"""Language contract uses synthetic journal rows only. No real Telegram config."""
import datetime as dt
import re

import pytest

from ops_language import describe_event, phase_timing
from ops_watch import parse_log
from test_ops_watch import setup  # isolated filesystem/process/network fixture


VOCABULARY = [
    ('старт SHIELD-1 на feat/shield-1 (поверх dev)', 'code-start', 'Лёха начал код'),
    ('старт QA-1 (Ася пишет приёмку, без доступа к коду)', 'acceptance-start', 'Ася готовит'),
    ('возобновление SHIELD-1 после сбоя: коммит abc1234 на feat/x — сразу регрессия', 'resume', 'повторяем тесты'),
    ('коммит 7488594 на feat/shield-1', 'commit', 'коммит 7488594'),
    ('регрессия SHIELD-1 принята архитектором без повторного прогона: abc', 'tests-waived', 'без повторного прогона'),
    ('регрессия SHIELD-1: нет связи с воркером (ssh timeout) — повтор 1/12 через 10 мин', 'worker-retry', 'Обрыв связи'),
    ('регрессия SHIELD-1: воркер недоступен 2 часа — СТОП', 'stop', 'недоступна уже 2 часа'),
    ('регрессия SHIELD-1 КРАСНАЯ: FAIL visual-reference', 'tests-red', 'не прошёл шаг visual-reference'),
    ('регрессия SHIELD-1 ЗЕЛЁНАЯ', 'tests-green', 'зелёные'),
    ('критик (Ася): SHIELD-1', 'critic-start', 'Ася проверяет'),
    ('критик: блокеры (2) в SHIELD-1', 'critic-blockers', '(2)'),
    ('критик ОК SHIELD-1', 'critic-green', 'блокеров нет'),
    ('Ярик (ночная смена): ревью SHIELD-1', 'night-start', 'Ночной Ярик проверяет'),
    ('ночной ревью: ДОРАБОТАТЬ SHIELD-1', 'night-result', 'доработать'),
    ('SHIELD-1 не прошёл (блокер критика) — Ярик (ночная смена) готовит одну попытку исправления', 'fix-plan', 'готовит исправление'),
    ('лимит/перегрузка Codex — чекпоинт сохранён, жду 30 мин и продолжаю (попытка 1)', 'limit', 'работа сохранена (чекпоинт)'),
    ('СТОП: SHIELD-1 — ошибка Codex', 'stop', 'ошибка запуска модели'),
    ('СТОП: SHIELD-1 изменил acceptance/', 'stop', 'Изменены защищённые проверки'),
    ('СТОП: SHIELD-1 — нет задания на исправление', 'stop', 'не смог подготовить'),
    ('СТОП: SHIELD-1 не починился с одной попытки — ждёт архитектора', 'stop', 'не помогло'),
    ('СТОП: цепочка F2/F3 не зелёная — очередь не стартует', 'stop', 'нужен архитектор'),
    ('нет BASE — жду окончания цепочки F2/F3', 'preparing', 'готовности общей ветки'),
    ('пауза по команде владельца перед SHIELD-1', 'pause', 'по вашей команде'),
    ('блок B: стоп — REVIEW (ревью стопки веток до dev). Продолжить: touch state/REVIEW.approved', 'review', 'решения архитектора'),
    ('QA-1 влит в dev (abc1234), хеш приёмки обновлён', 'merged', 'общую ветку'),
    ('SHIELD-1 зелёный, критик ОК, Ярик: ДОРАБОТАТЬ — feat/x ждёт ревью, дальше поверх', 'complete', 'доработать'),
    ('очередь пройдена до конца', 'queue-done', 'Все круги'),
    ('архитектор (06.11, ревью): стопка GATE-LOCAL-1/2 влита, ДОРАБОТАТЬ не стопит', 'note', 'Архитектор: (06.11'),
    ('действующий архитектор принял R1; возобновляю ORDER, следующий SHIELD-1', 'note', 'Архитектор: принял R1'),
    ('продолжение SHIELD-1 на сохранённом дереве feat/shield-1', 'resume', 'Лёха продолжает прерванный круг'),
    ('сеть Codex — чекпоинт сохранён, жду 30 мин', 'limit', 'работа сохранена'),
    ('сеть Codex недоступна 8 часов — СТОП', 'stop', 'Сеть Codex недоступна 8 часов'),
    ('регрессия SHIELD-1: нет результата от воркера (timeout) — повтор 3/12 через 10 мин', 'worker-retry', 'Воркер не ответил, повтор 3 из 12 через 10 мин'),
    ('СТОП: регрессия SHIELD-1 — воркер 12 раз не отдал результат', 'stop', 'Очередь встала'),
    ('ночное ревью SHIELD-1: ДОРАБОТАТЬ — круг ждёт ревью архитектора, очередь идёт дальше', 'review-info', 'очередь идёт дальше'),
]


@pytest.mark.parametrize('marker', ['очередь', 'смета'])
@pytest.mark.parametrize('body,kind,phrase', VOCABULARY)
def test_journal_vocabulary(marker, body, kind, phrase):
    raw = f'12:00:00 [{marker}] {body}'
    row = parse_log((raw + '\n').encode(), dt.datetime(2026, 11, 4, 12).timestamp(), 'fixture',
                    codes_by_line={'shield': {'SHIELD-1', 'QA-1', 'REVIEW'},
                                   'smeta': {'SHIELD-1', 'QA-1', 'REVIEW'}})[0]
    assert row['eventType'] == kind
    if kind in ('stop', 'tests-red', 'critic-blockers'):
        assert row['kind'] == 'stop'
    if kind == 'limit':
        assert row['kind'] == 'limit'
    assert phrase in row['humanText']
    assert row['raw'] == raw
    assert row['line'] == ('shield' if marker == 'очередь' else 'smeta')
    assert not re.search(r'(?:остановилась|продолжить|проверяет) круга\b', row['humanText'])
    assert not re.match(r'\d\d:\d\d:\d\d \[', row['humanText'])
    if kind in ('note', 'review-info'):
        assert row['kind'] == 'activity' and not row['progress']


def test_unknown_row_cleaned_and_commit_does_not_inherit_circle_when_lines_interleave():
    rows = parse_log(('12:00:00 [очередь] старт SHIELD-1\n'
                      '12:00:01 [смета] старт SMETA-0\n'
                      '12:01:00 [очередь] коммит 7488594 на feat/x\n'
                      '12:02:00 [очередь] новый тип: подробности\n').encode(),
                    dt.datetime(2026, 11, 4, 12, 3).timestamp(), 'fixture',
                    codes_by_line={'shield': {'SHIELD-1'}, 'smeta': {'SMETA-0'}})
    assert rows[0]['code'] == 'SHIELD-1'
    assert rows[2]['code'] is None
    assert rows[2]['humanText'] == 'Лёха закончил код (коммит 7488594)'
    assert rows[-1]['humanText'] == 'новый тип: подробности'
    assert rows[-1]['raw'] == '12:02:00 [очередь] новый тип: подробности'


def test_estimates_use_only_completed_stages_and_require_three_samples():
    rows = []
    for i, duration in enumerate((20, 30, 100)):
        rows += [dict(code=f'C-{i}', phase='code', at=i * 10000),
                 dict(code=f'C-{i}', phase='regression', at=i * 10000 + duration * 60)]
    assert phase_timing(rows[:4], 'code', 'C-1', 30000)['source'] == 'default'
    result = phase_timing(rows, 'code', 'C-2', 30000)
    assert result['source'] == 'journal'
    assert result['expectedMinutes'] == 30
    rows += [dict(code='C-3', phase='code', at=40000), dict(code='C-3', phase='limit', at=100000)]
    assert phase_timing(rows, 'code', 'C-3', 100100)['expectedMinutes'] == 30


def test_limit_does_not_become_review_or_send_alert_but_dead_runner_does(setup):
    s = setup
    s.panes['dcm-queue'] = [50]
    s.append('12:00:00 [очередь] старт SHIELD-1\n')
    s.watcher.tick()
    s.bot.messages.clear()
    s.now[0] += 60
    s.state('queue', 'SHIELD-1', 'ждёт лимит Codex')
    s.append('12:01:00 [очередь] лимит/перегрузка Codex — чекпоинт сохранён, жду 30 мин и продолжаю\n')
    line = s.watcher.tick()['lines'][0]
    assert line['status'] == 'waiting'
    assert line['presentation']['attention']['level'] == 'none'
    assert 'продолжим в' in line['presentation']['doing']
    assert line['review'] == []
    assert not s.bot.messages
    del s.panes['dcm-queue']
    line = s.watcher.tick()['lines'][0]
    assert line['presentation']['attention']['level'] == 'intervention'
    assert len(s.bot.messages) == 1
    assert 'Очередь Щит встала:' in s.bot.messages[0]


def test_status_and_stage_elapsed_not_reset_by_repeated_activity(setup):
    s = setup
    s.panes['dcm-queue'] = [50]
    s.state('queue', 'SHIELD-1', 'регрессия на воркере (SHIELD-1)')
    s.append('12:00:00 [очередь] возобновление SHIELD-1 после сбоя: коммит abc1234 — сразу регрессия\n')
    s.now[0] += 1800
    s.append('12:30:00 [очередь] регрессия SHIELD-1: нет связи с воркером — повтор 1/12 через 10 мин\n')
    view = s.collector.snapshot(fresh=True)['lines'][0]['presentation']
    assert view['timing']['elapsedMinutes'] == 30
    assert not view['showSilence']
    assert view['attention']['level'] == 'none'
    s.now[0] += 4201
    assert s.collector.snapshot(fresh=True)['lines'][0]['presentation']['showSilence']


@pytest.mark.parametrize('reason', ['ошибка Codex', 'СТОП неизвестная причина', 'регрессия КРАСНАЯ', 'блокер критика'])
def test_any_state_only_stop_alerts_immediately_once_and_survives_restart(setup, reason):
    from ops_watch import Watcher
    s = setup
    s.panes['dcm-queue'] = [50]
    s.watcher.tick()
    s.bot.messages.clear()
    del s.panes['dcm-queue']
    s.state('queue', 'SHIELD-1', reason)
    line = s.watcher.tick()['lines'][0]
    assert line['presentation']['attention']['level'] == 'intervention'
    assert len(s.bot.messages) == 1
    assert 'Очередь Щит встала:' in s.bot.messages[0] and 'Что делать:' in s.bot.messages[0]
    s.watcher.tick()
    Watcher(s.collector, s.bot, s.watcher.state_path, clock=lambda: s.now[0]).tick()
    assert len(s.bot.messages) == 1


def test_pause_request_waits_for_circle_and_review_decision_is_explicit(setup):
    s = setup
    s.panes['dcm-queue'] = [50]
    s.state('queue', 'SHIELD-1', 'в работе (Лёха): SHIELD-1')
    (s.root / 'queue/PAUSE').touch()
    line = s.collector.snapshot(fresh=True)['lines'][0]
    assert line['status'] == 'running'
    assert line['pauseRequested']
    assert line['presentation']['attention']['level'] == 'none'
    assert 'уйдёт на паузу' in line['presentation']['doing']
    del s.panes['dcm-queue']
    assert s.collector.snapshot(fresh=True)['lines'][0]['presentation']['attention']['level'] == 'decision'


def test_secret_patterns_redacted_without_loading_config():
    row = describe_event('неизвестно token=fixture-secret chat_id=12345678', None)
    assert row['humanText'] == 'неизвестно token=[скрыто] chat_id=[скрыто]'


def test_repeated_failure_after_restart_of_queue_not_throttled_for_two_hours(setup):
    s = setup
    s.panes['dcm-queue'] = [50]
    s.watcher.tick()
    for minute in (1, 3):
        s.now[0] += 60
        s.append(f'12:0{minute}:00 [очередь] СТОП: SHIELD-1 ошибка Codex\n')
        s.watcher.tick()
        s.now[0] += 60
        s.append(f'12:0{minute+1}:00 [очередь] старт SHIELD-1\n')
        s.watcher.tick()
    messages = [message for message in s.bot.messages if 'Очередь Щит встала:' in message]
    assert len(messages) == 2


def test_stop_without_circle_or_journal_still_alerts(setup):
    s = setup
    (s.root / 'queue/ORDER').write_text('')
    s.panes['dcm-queue'] = [50]
    s.watcher.tick()
    del s.panes['dcm-queue']
    line = s.watcher.tick()['lines'][0]
    assert line['circle'] is None
    assert len(s.bot.messages) == 1
    assert 'Очередь Щит встала:' in s.bot.messages[0]


def test_child_error_and_parent_stop_on_different_polls_are_one_incident(setup):
    s = setup
    s.watcher.tick()
    s.append('12:00:00 [очередь] СТОП: SHIELD-1-FIX ошибка Codex\n')
    s.watcher.tick()
    s.now[0] += 2
    s.append('12:00:02 [очередь] СТОП: SHIELD-1 не починился с одной попытки — ждёт архитектора\n')
    s.watcher.tick()
    assert len(s.bot.messages) == 1
    assert 'ошибка модели' in s.bot.messages[0]
