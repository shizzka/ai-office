import datetime as dt
import json
import os
from pathlib import Path
from types import SimpleNamespace
import urllib.request

import pytest

from ops_watch import Collector, Line, Telegram, Watcher, parse_log, process_flags


class Bot:
    owner = 123

    def __init__(self):
        self.messages = []
        self.offline = False

    def send(self, text):
        if self.offline:
            raise OSError('offline')
        self.messages.append(text)


@pytest.fixture
def setup(tmp_path):
    now = [dt.datetime(2026, 11, 3, 12, 0).astimezone().timestamp()]
    root = tmp_path / 'qa'
    (root / 'fixes').mkdir(parents=True)
    pipeline = root / 'fixes/pipeline.log'
    pipeline.write_text('')
    for name, code in [('queue', 'SHIELD-1'), ('queue-smeta', 'SMETA-0')]:
        (root / name / 'state').mkdir(parents=True)
        (root / name / 'state/BASE').write_text('dev')
        (tmp_path / name / '.git').mkdir(parents=True)
        (root / name / 'ORDER').write_text(f'A|{code}|dev\nB|REVIEW|pause\n')
    panes = {}
    procs = []
    online = [True]
    collector = Collector(root, clock=lambda: now[0], processes=lambda: procs, tmux=lambda: panes,
                          tcp=lambda host, port: online[0],
                          repo_by_line={'shield': tmp_path / 'queue', 'smeta': tmp_path / 'queue-smeta'})
    bot = Bot()
    watcher = Watcher(collector, bot, tmp_path / 'ops-watch.state.json', clock=lambda: now[0])

    def append(text):
        with pipeline.open('a') as source:
            source.write(text)
        os.utime(pipeline, (now[0], now[0]))

    def state(name, code, text):
        file = root / name / 'state' / code
        file.write_text(text)
        os.utime(file, (now[0], now[0]))

    return SimpleNamespace(now=now, root=root, collector=collector, bot=bot, watcher=watcher,
                           panes=panes, procs=procs, online=online, append=append, state=state)


def test_fixture_dates_cross_midnight_and_ignore_other_activity():
    data = (Path(__file__).parent / 'fixtures/ops-watch/pipeline.log').read_bytes()
    anchor = dt.datetime(2026, 11, 3, 0, 5).astimezone()
    records = parse_log(data, anchor.timestamp(), 'fixture',
                        codes_by_line={'shield': {'SHIELD-1'}, 'smeta': {'SMETA-0', 'REVIEW'}})
    assert dt.datetime.fromtimestamp(records[0]['at']).day == 2
    assert dt.datetime.fromtimestamp(records[-1]['at']).day == 3
    assert records[-1]['code'] == 'REVIEW'
    assert records[-1]['kind'] == 'review'
    assert len(records) == 7


def test_transition_log_keeps_red_green_review_between_polls(setup):
    s = setup
    s.watcher.tick()
    s.append('11:59:00 [очередь] регрессия SHIELD-1 КРАСНАЯ\n'
             '11:59:01 [очередь] старт SHIELD-1-FIX\n'
             '11:59:02 [очередь] SHIELD-1 зелёный, критик ОК — feat/shield-1 ждёт ревью\n'
             '11:59:03 [смета] SMETA-0 ждёт ревью\n')
    s.watcher.tick()
    assert any('Тесты не прошли' in text for text in s.bot.messages)
    assert any('завершён зелёным' in text for text in s.bot.messages)
    assert any('Смета' in text and 'ревью' in text for text in s.bot.messages)
    before = len(s.bot.messages)
    s.watcher.tick()
    assert len(s.bot.messages) == before


def test_historical_events_baselined_current_stop_not_flooded(setup):
    s = setup
    s.append('11:00:00 [очередь] SHIELD-OLD зелёный\n11:01:00 [очередь] регрессия SHIELD-1 КРАСНАЯ\n')
    s.state('queue', 'SHIELD-1', 'СТОП после автоисправления (код 10)')
    s.watcher.tick()
    assert len(s.bot.messages) == 1
    assert 'SHIELD-1' in s.bot.messages[0]
    assert 'SHIELD-OLD' not in s.bot.messages[0]


def test_restart_persistent_dedup_outbox_and_private_atomic_state(setup):
    s = setup
    s.bot.offline = True
    assert s.watcher.enqueue('stop|shield|SHIELD-1|red', 'Красная регрессия')
    s.watcher.flush()
    assert len(s.watcher.state['outbox']) == 1
    path = s.watcher.state_path
    assert path.stat().st_mode & 0o777 == 0o600
    restarted = Watcher(s.collector, s.bot, path, clock=lambda: s.now[0])
    assert not restarted.enqueue('stop|shield|SHIELD-1|red', 'duplicate')
    s.bot.offline = False
    restarted.flush()
    assert s.bot.messages == ['Красная регрессия']
    assert json.loads(path.read_text())['outbox'] == []
    s.now[0] += 7199
    assert not restarted.enqueue('stop|shield|SHIELD-1|red', 'duplicate')
    s.now[0] += 1
    assert restarted.enqueue('stop|shield|SHIELD-1|red', 'repeat')


def test_tmux_loss_survives_restart(setup):
    s = setup
    s.panes['dcm-queue'] = [50]
    s.watcher.tick()
    watcher = Watcher(s.collector, s.bot, s.watcher.state_path, clock=lambda: s.now[0])
    del s.panes['dcm-queue']
    watcher.tick()
    assert sum('сессия очереди пропала' in text for text in s.bot.messages) == 1
    watcher.tick()
    assert sum('сессия очереди пропала' in text for text in s.bot.messages) == 1


def test_silence_not_suppressed_by_other_line_or_unrelated_codex(setup):
    s = setup
    s.state('queue', 'SHIELD-1', 'в работе (Лёха): SHIELD-1')
    s.append('12:00:00 [очередь] старт SHIELD-1\n')
    s.watcher.tick()
    s.panes['dcm-queue'] = [50]
    s.now[0] += 5401
    s.procs.append({'pid': 20, 'ppid': 1, 'args': ['codex', 'exec', '-C', '/home/q/ai-office'], 'fds': []})
    s.append('13:30:01 [смета] старт SMETA-0\n13:30:01 unrelated log activity\n')
    snap = s.watcher.tick()
    assert snap['lines'][0]['idleSeconds'] == 5401
    assert any('Щит' in text and 'двойной нормы' in text for text in s.bot.messages)


def test_waiting_line_exempt_from_silence(setup):
    s = setup
    s.state('queue', 'SHIELD-1', 'ждёт ревью архитектора')
    s.watcher.tick()
    s.now[0] += 5000
    s.watcher.tick()
    assert not any('45 минут' in text and 'Щит' in text for text in s.bot.messages)


def test_real_process_ancestry_and_output_association(setup):
    line = setup.collector.lines[0]
    procs = [{'pid': 1, 'ppid': 0, 'args': ['bash', str(line.path / 'dcm-queue.sh'), 'run']},
             {'pid': 2, 'ppid': 1, 'args': ['node', '/usr/bin/codex', 'exec', '-C', '/dcm']},
             {'pid': 3, 'ppid': 1, 'args': ['bash', str(line.path.parent / 'worker-run.sh'), 'test']}]
    assert process_flags(line, procs) == {'codex': True, 'worker': True}
    procs[1]['ppid'] = procs[2]['ppid'] = 99
    assert process_flags(line, procs) == {'codex': False, 'worker': False}
    procs[2]['fds'] = [str(line.path / 'out' / 'SHIELD-1-regression.log')]
    assert process_flags(line, procs) == {'codex': False, 'worker': True}
    assert process_flags(setup.collector.lines[1], procs) == {'codex': False, 'worker': False}


def test_worker_down_after_15min_and_recovery_persist_restart(setup):
    s = setup
    s.online[0] = False
    s.watcher.tick()
    assert not any('15 минут' in text for text in s.bot.messages)
    s.now[0] += 901
    watcher = Watcher(s.collector, s.bot, s.watcher.state_path, clock=lambda: s.now[0])
    watcher.tick()
    assert sum('15 минут' in text for text in s.bot.messages) == 2
    s.online[0] = True
    s.now[0] += 60
    watcher.tick()
    assert sum('связь восстановлена' in text for text in s.bot.messages) == 2
    watcher.tick()
    assert sum('связь восстановлена' in text for text in s.bot.messages) == 2


def test_owner_private_commands_only(setup):
    s = setup
    def update(chat=123, sender=123, kind='private', command='/status', seq=1):
        return {'update_id': seq, 'message': {'chat': {'id': chat, 'type': kind}, 'from': {'id': sender}, 'text': command}}
    for args in ({'chat': 999}, {'sender': 999}, {'kind': 'group'}):
        s.watcher.handle_update(update(**args))
    assert s.watcher.state['outbox'] == []
    s.watcher.handle_update(update())
    s.watcher.handle_update(update(command='/queue', seq=2))
    s.watcher.handle_update(update(command='/help', seq=3))
    s.watcher.code_handler = lambda: 'Test code issued'
    s.watcher.handle_update(update(command='/code', seq=4))
    s.watcher.flush()
    assert len(s.bot.messages) == 4
    assert 'Щит' in s.bot.messages[0] and 'Смета' in s.bot.messages[0]
    assert 'SHIELD-1' in s.bot.messages[1]
    assert s.bot.messages[-1] == 'Test code issued'


def test_snapshot_normalizes_arbitrary_source_text(setup):
    s = setup
    s.state('queue', 'SHIELD-1', 'ошибка Codex /private/location arbitrary-source-text')
    s.append('12:00:00 [очередь] СТОП: SHIELD-1 /private/location arbitrary-source-text\n')
    snapshot = s.watcher.tick()
    assert 'arbitrary-source-text' in snapshot['events'][0]['raw']
    assert 'arbitrary-source-text' not in snapshot['events'][0]['humanText']
    output = json.dumps(snapshot['lines'], ensure_ascii=False) + json.dumps(s.bot.messages)
    assert 'arbitrary-source-text' not in output
    assert '/private/location' not in output


def test_telegram_explicit_proxy_ignores_no_proxy(tmp_path, monkeypatch):
    token = tmp_path / 'config'
    chat = tmp_path / 'owner'
    token.write_text('offline-fixture-placeholder')
    chat.write_text('123')
    monkeypatch.setenv('NO_PROXY', '*')
    bot = Telegram(token, chat)
    observed = []
    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self): return b'{"ok": true, "result": []}'
    def open_request(req, timeout):
        observed.append(req)
        return Response()
    monkeypatch.setattr(bot.opener, 'open', open_request)
    bot.call('getUpdates', {'timeout': 25})
    assert observed[0].host == '127.0.0.1:12334'
    assert observed[0]._tunnel_host == 'api.telegram.org'
    handlers = [h for h in bot.opener.handlers if isinstance(h, urllib.request.ProxyHandler)]
    assert handlers[0].proxies['https'] == 'http://127.0.0.1:12334'


def test_live_associated_job_suppresses_silence(setup):
    s = setup
    s.state('queue', 'SHIELD-1', 'регрессия на воркере (SHIELD-1)')
    s.watcher.tick()
    s.now[0] += 3000
    s.procs.extend([
        {'pid': 50, 'ppid': 1, 'args': ['bash', str(s.root / 'queue/dcm-queue.sh'), 'run']},
        {'pid': 51, 'ppid': 50, 'args': ['bash', str(s.root / 'worker-run.sh'), 'regression']},
    ])
    snapshot = s.watcher.tick()
    assert snapshot['lines'][0]['processes']['worker']
    assert not any('Щит' in text and '45 минут' in text for text in s.bot.messages)


def test_log_truncation_and_partial_record(setup):
    s = setup
    s.append('11:00:00 [очередь] старт SHIELD-1 on a very long branch with additional context\n')
    s.watcher.tick()
    file = s.root / 'fixes/pipeline.log'
    file.write_text('12:00:00 [очередь] регрессия SHIELD-1 КРАСНАЯ')
    os.utime(file, (s.now[0], s.now[0]))
    s.watcher.tick()
    assert not any('Тесты не прошли' in text for text in s.bot.messages)
    s.append('\n')
    s.watcher.tick()
    assert any('Тесты не прошли' in text for text in s.bot.messages)


def test_successful_green_and_queue_order_contract(setup):
    s = setup
    s.state('queue', 'SHIELD-1', 'готово (abc123), Ярик: РЕКОМЕНДУЮ В DEV')
    s.append('12:00:00 [очередь] SHIELD-1 зелёный, критик ОК, Ярик: РЕКОМЕНДУЮ В DEV — feat/shield-1 ждёт ревью\n')
    snapshot = s.collector.snapshot()
    line = snapshot['lines'][0]
    assert [item['code'] for item in line['queue']] == ['SHIELD-1', 'REVIEW']
    assert line['queue'][0]['status'] == 'done'
    assert line['lastRegression']['result'] == 'green'
    assert set(snapshot) == {'updatedAt', 'lines', 'events', 'workers'}


def test_log_fallback_updates_queue_active_stop_and_pending_green_review(setup):
    s = setup
    s.append('11:59:00 [очередь] старт SHIELD-1\n')
    assert s.collector.snapshot(fresh=True)['lines'][0]['queue'][0]['status'] == 'running'
    s.state('queue', 'SHIELD-1', 'регрессия на воркере (SHIELD-1)')
    s.append('12:00:00 [очередь] регрессия SHIELD-1 КРАСНАЯ\n')
    assert s.collector.snapshot(fresh=True)['lines'][0]['status'] == 'stopped'
    s.now[0] += 60
    s.append('12:01:00 [очередь] SHIELD-1 зелёный, критик ОК — feat/shield-1 ждёт ревью, дальше поверх\n')
    line = s.collector.snapshot(fresh=True)['lines'][0]
    assert line['queue'][0]['status'] == 'done'
    assert 'SHIELD-1' in line['review']
    (s.root / 'queue/state/SHIELD-1.approved').touch()
    assert 'SHIELD-1' not in s.collector.snapshot(fresh=True)['lines'][0]['review']


def test_next_running_log_circle_overrides_earlier_unknown_queue_item(setup):
    s = setup
    (s.root / 'queue/ORDER').write_text('A|SHIELD-OLD|dev\nA|SHIELD-1|dev\n')
    s.append('12:00:00 [очередь] старт SHIELD-1\n')
    line = s.collector.snapshot(fresh=True)['lines'][0]
    assert line['circle'] == 'SHIELD-1'
    assert line['queue'][1]['status'] == 'running'


def test_flush_does_not_hold_state_lock_during_network(setup):
    import threading
    s = setup
    acquired = []
    s.watcher.enqueue('one', 'message')
    def send(text):
        def concurrent_save():
            with s.watcher.lock:
                acquired.append(True)
        thread = threading.Thread(target=concurrent_save)
        thread.start()
        thread.join(timeout=1)
        assert acquired
    s.bot.send = send
    s.watcher.flush()
    assert s.watcher.state['outbox'] == []


def test_published_https_menu_once_and_retry_throttled(setup, monkeypatch):
    s = setup
    calls = []
    s.bot.call = lambda method, payload: calls.append((method, payload))
    monkeypatch.setenv('DCM_PULT_URL', 'https://example.test/pult')
    s.watcher.configure_menu()
    s.watcher.configure_menu()
    assert len(calls) == 1
    assert calls[0][0] == 'setChatMenuButton'
    assert calls[0][1]['chat_id'] == s.bot.owner
    monkeypatch.setenv('DCM_PULT_URL', 'http://localhost/pult')
    s.watcher.configure_menu()
    assert len(calls) == 1


def test_specific_child_and_generic_parent_stop_are_one_incident(setup):
    s = setup
    s.watcher.tick()
    s.state('queue', 'SHIELD-1', 'СТОП после автоисправления (код 12)')
    data = (Path(__file__).parent / 'fixtures/ops-watch/stop-incident.log').read_text()
    s.append(data)
    snapshot = s.watcher.tick()
    assert len(s.bot.messages) == 1
    assert 'ошибка модели' in s.bot.messages[0]
    assert 'SHIELD-1' in s.bot.messages[0]
    assert snapshot['lines'][0]['reason'] == 'Ошибка Codex'
    s.watcher.tick()
    assert len(s.bot.messages) == 1


def test_generic_parent_state_keeps_specific_incident_cause(setup):
    s = setup
    s.watcher.tick()
    s.append('12:00:00 [очередь] СТОП: SHIELD-1-FIX — ошибка Codex\n'
             '12:00:00 [очередь] СТОП: SHIELD-1 не починился с одной попытки — ждёт архитектора\n')
    s.now[0] += 3
    s.state('queue', 'SHIELD-1', 'СТОП после автоисправления')
    snapshot = s.watcher.tick()
    assert snapshot['lines'][0]['reason'] == 'Ошибка Codex'
    assert len(s.bot.messages) == 1


def test_order_name_ending_fix_is_not_blindly_stripped(setup):
    s = setup
    (s.root / 'queue/ORDER').write_text('A|SHIELD-1|dev\nA|SHIELD-1-FIX|dev\n')
    s.watcher.tick()
    s.append('12:00:00 [очередь] СТОП: SHIELD-1-FIX — ошибка Codex\n'
             '12:00:00 [очередь] СТОП: SHIELD-1 не починился с одной попытки — ждёт архитектора\n')
    s.watcher.tick()
    assert len(s.bot.messages) == 2
    assert any('SHIELD-1-FIX.' in message for message in s.bot.messages)


def test_commit_event_has_useful_safe_label():
    record = parse_log('12:00:00 [очередь] коммит abc123 на feat/shield-1\n'.encode(), dt.datetime.now().timestamp(), 'fixture')[0]
    assert record['text'] == 'Коммит сохранён'
    assert 'abc123' not in record['text']


@pytest.mark.parametrize('missing', ['base', 'repo', 'both'])
def test_unprepared_line_awaits_start_without_alerts_even_after_restart(setup, missing):
    s = setup
    if missing in ('base', 'both'):
        (s.root / 'queue-smeta/state/BASE').unlink()
    if missing in ('repo', 'both'):
        (s.collector.repo_by_line['smeta'] / '.git').rmdir()
    # The shared journal has only the other line's events.
    s.append('12:00:00 [очередь] старт SHIELD-1\n')
    line = s.watcher.tick()['lines'][1]
    assert line['status'] == 'awaiting-start'
    assert line['circle'] is None
    assert 'слияния стопки щита' in line['reason']
    s.now[0] += 8000
    s.watcher.tick()
    restarted = Watcher(s.collector, s.bot, s.watcher.state_path, clock=lambda: s.now[0])
    restarted.tick()
    assert not any('Смета' in message for message in s.bot.messages)


def test_same_unprepared_line_with_history_and_lost_session_is_stopped(setup):
    s = setup
    (s.root / 'queue-smeta/state/BASE').unlink()
    s.append('12:00:00 [смета] старт SMETA-0\n')
    s.panes['dcm-smeta'] = [50]
    assert s.watcher.tick()['lines'][1]['status'] == 'running'
    del s.panes['dcm-smeta']
    line = s.watcher.tick()['lines'][1]
    assert line['status'] == 'stopped'
    assert line['reason'] == 'Нет сессии очереди'
    assert any('Смета' in message and 'сессия очереди пропала' in message for message in s.bot.messages)


def test_awaiting_to_running_one_information_message_survives_restart(setup):
    s = setup
    (s.root / 'queue-smeta/state/BASE').unlink()
    s.watcher.tick()
    s.state('queue-smeta', 'BASE', 'smeta/base')
    s.panes['dcm-smeta'] = [50]
    s.append('12:00:00 [смета] старт SMETA-0\n')
    assert s.watcher.tick()['lines'][1]['status'] == 'running'
    s.watcher.tick()
    restarted = Watcher(s.collector, s.bot, s.watcher.state_path, clock=lambda: s.now[0])
    restarted.tick()
    assert s.bot.messages == ['Смета: линия запущена\nПульт: /pult']


@pytest.mark.parametrize('reason', ['Ждём слияния стопки щита в dev', ''])
def test_hold_overrides_running_and_stop_log_and_suppresses_alerts(setup, reason):
    s = setup
    s.panes['dcm-smeta'] = [50]
    s.watcher.tick()
    s.bot.messages.clear()
    (s.root / 'queue-smeta/HOLD').write_text(reason)
    del s.panes['dcm-smeta']
    s.append('12:00:00 [смета] СТОП: SMETA-0 ошибка Codex\n')
    line = s.watcher.tick()['lines'][1]
    assert line['status'] == 'awaiting-start'
    assert line['reason'] == (reason or 'Запуск линии отложен владельцем')
    s.now[0] += 8000
    s.watcher.tick()
    assert not any('Смета' in message for message in s.bot.messages)
    (s.root / 'queue-smeta/HOLD').unlink()
    assert s.watcher.tick()['lines'][1]['status'] == 'stopped'
    assert any('ошибка модели' in message for message in s.bot.messages)


def test_hold_discards_obsolete_offline_stop_alerts(setup):
    s = setup
    s.bot.offline = True
    s.panes['dcm-smeta'] = [50]
    s.watcher.tick()
    del s.panes['dcm-smeta']
    s.watcher.tick()
    assert any('smeta' in message['key'] for message in s.watcher.state['outbox'])
    (s.root / 'queue-smeta/HOLD').write_text('Ждём слияния')
    s.bot.offline = False
    s.watcher.tick()
    assert not s.bot.messages
    assert not s.watcher.state['outbox']


@pytest.mark.parametrize('live', ['session', 'queue', 'job'])
def test_live_line_is_not_awaiting_even_without_base(setup, live):
    s = setup
    (s.root / 'queue-smeta/state/BASE').unlink()
    if live == 'session':
        s.panes['dcm-smeta'] = [50]
    elif live == 'queue':
        s.procs.append({'pid': 50, 'ppid': 1, 'args': ['bash', str(s.root / 'queue-smeta/dcm-queue.sh'), 'run']})
    else:
        s.procs.append({'pid': 50, 'ppid': 1, 'args': ['sleep', '30'], 'fds': [str(s.root / 'queue-smeta/out/job.log')]})
    assert s.collector.snapshot(fresh=True)['lines'][1]['status'] == 'running'


def test_historical_line_outside_log_tail_is_not_awaiting(setup):
    s = setup
    (s.root / 'queue-smeta/state/BASE').unlink()
    s.append('11:00:00 [смета] старт SMETA-0\n' + 'unrelated\n' * 450000)
    assert s.collector.snapshot(fresh=True)['lines'][1]['status'] == 'stopped'


def test_status_command_names_awaiting_line(setup):
    s = setup
    (s.root / 'queue-smeta/HOLD').write_text('Ждём слияния стопки щита')
    s.watcher.handle_update({'update_id': 1, 'message': {'chat': {'id': 123, 'type': 'private'},
                                                      'from': {'id': 123}, 'text': '/status'}})
    s.watcher.flush()
    assert 'Смета: Ждём слияния стопки щита' in s.bot.messages[0]
    assert 'Ждём слияния стопки щита' in s.bot.messages[0]
