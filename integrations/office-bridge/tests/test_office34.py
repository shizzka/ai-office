"""OFFICE-34: recorded production state and isolated status-transition regressions."""
import json
import os
from pathlib import Path
import re
import shutil

import pytest

from ops_watch import Collector, parse_log
from test_ops_watch import setup


FIXTURE = Path(__file__).parent / 'fixtures/office34'


def test_recorded_november_6_snapshot(tmp_path):
    root = tmp_path / 'qa'
    shutil.copytree(FIXTURE, root)
    mtimes = json.loads((root / 'mtimes.json').read_text())
    for name, modified in mtimes.items():
        os.utime(root / name, (modified, modified))
    collector = Collector(root, clock=lambda: max(mtimes.values()) + 60,
                          processes=lambda: [], tmux=lambda: {'dcm-queue': [1], 'dcm-smeta': [2]},
                          tcp=lambda *args: True)
    snapshot = collector.snapshot()
    shield, smeta = snapshot['lines']
    assert shield['circle'] == 'SHIELD-VIS-1'
    assert shield['stage'] == 'Лёха пишет'
    cards = {item['code']: item for item in shield['queue']}
    for code in ('FIX-5', 'GATE-REF-1'):
        assert (cards[code]['status'], cards[code]['state']) == ('done', 'Готово')
    assert (smeta['circle'], smeta['stage']) == ('SMETA-1', 'Регрессия')
    assert shield['status'] == smeta['status'] == 'running'
    assert not any(row['code'] in ('ORDER', 'R1', 'GATE-LOCAL-1') for row in collector.records)
    notes = [row for row in collector.records if re.search(r'\] (?:действующий )?архитектор\b', row['raw'])]
    assert notes
    assert all(row['eventType'] == 'note' and row['kind'] != 'stop' for row in notes)
    assert all(not re.match(r'\d\d:\d\d:\d\d \[', row['humanText']) for row in collector.records)
    assert all(not re.search(r'(?:остановилась|продолжить) круга\b', row['humanText']) for row in collector.records)
    continuation = next(row for row in collector.records if 'продолжение SHIELD-VIS-1-FIX на сохранённом' in row['raw'])
    assert continuation['humanText'] == 'Лёха продолжает прерванный круг SHIELD-VIS-1-FIX'
    helper = next(row for row in collector.records if 'возобновлён сохранённый helper' in row['raw'])
    assert helper['eventType'] == 'unknown'
    assert helper['humanText'].startswith('возобновлён сохранённый helper SMETA-1')


@pytest.mark.parametrize('body,code', [
    ('коммит abc1234 на feat/shield-1', 'SHIELD-1'),
    ('коммит abc1234 на feat/shield-1-fix', 'SHIELD-1-FIX'),
    ('старт SHIELD-1-FIX-FIX', 'SHIELD-1-FIX-FIX'),
    ('старт SHIELD-1-R1', None),
    ('старт SHIELD-1-R1 на feat/shield-1-r1 (поверх feat/shield-1)', None),
    ('регрессия ORDER ЗЕЛЁНАЯ', None),
    ('критик R1', None),
    ('старт SMETA-0', None),
    ('коммит abc1234 на feat/shield-1-fix-extra', None),
    ('коммит abc1234 на feat/gate-local-1', None),
    ('старт GATE-LOCAL-1', None),
    ('коммит abc1234', None),
])
def test_circle_whitelist_and_branch_resolution(body, code):
    rows = parse_log(('12:00:00 [очередь] старт SHIELD-1\n'
                      f'12:00:01 [очередь] {body}\n').encode(), 1793977551, 'test',
                     codes_by_line={'shield': {'SHIELD-1'}, 'smeta': {'SMETA-0'}})
    assert rows[-1]['code'] == code


@pytest.mark.parametrize('body', [
    'коммит abc1234', 'коммит abc1234 на feat/unknown-1',
    'регрессия ORDER ЗЕЛЁНАЯ', 'критик R1', 'СТОП GATE-LOCAL-1',
    'архитектор: SHIELD-1 стопка влита; СТОП, старт, красная регрессия',
])
def test_unattributed_events_and_notes_cannot_change_card(setup, body):
    s = setup
    s.panes['dcm-queue'] = [1]
    s.state('queue', 'SHIELD-1', 'в работе (Лёха): SHIELD-1')
    s.append('11:59:00 [очередь] старт SHIELD-1\n')
    before = s.collector.snapshot()['lines'][0]
    s.now[0] += 60
    s.append(f'12:01:00 [очередь] {body}\n')
    after = s.collector.snapshot(fresh=True)['lines'][0]
    assert after['queue'] == before['queue']
    assert (after['circle'], after['stage'], after['status']) == (before['circle'], before['stage'], before['status'])


@pytest.mark.parametrize('approved', [False, True])
@pytest.mark.parametrize('body', [
    'коммит abc1234 на feat/shield-1', 'регрессия SHIELD-1 КРАСНАЯ',
    'критик SHIELD-1', 'возобновление SHIELD-1 — сразу регрессия',
])
def test_closed_circle_cannot_be_reopened_by_activity(setup, approved, body):
    s = setup
    s.state('queue', 'SHIELD-1', 'в работе' if approved else 'готово (abc1234)')
    if approved:
        s.state('queue', 'SHIELD-1.approved', 'принято')
    s.now[0] += 60
    s.append(f'12:01:00 [очередь] {body}\n')
    card = s.collector.snapshot()['lines'][0]['queue'][0]
    assert (card['status'], card['state']) == ('done', 'Готово')


@pytest.mark.parametrize('approved', [False, True])
@pytest.mark.parametrize('start', ['старт SHIELD-1', 'продолжение SHIELD-1-FIX на сохранённом дереве'])
def test_closed_circle_reopens_only_after_explicit_named_restart(setup, approved, start):
    s = setup
    s.state('queue', 'SHIELD-1', 'готово')
    if approved:
        s.state('queue', 'SHIELD-1.approved', 'принято')
    s.now[0] += 62
    s.append(f'12:01:00 [очередь] {start}\n12:01:01 [очередь] коммит abc1234 на feat/shield-1-fix\n')
    assert s.collector.snapshot()['lines'][0]['queue'][0]['status'] == 'running'


def test_current_circle_uses_newest_running_state_over_order_and_log_only_work(setup):
    s = setup
    s.panes['dcm-queue'] = [1]
    (s.root / 'queue/ORDER').write_text('A|OLD-1|dev\nA|SHIELD-1|dev\nA|NEW-1|dev\nA|LOG-1|dev\n')
    s.state('queue', 'OLD-1', 'ждёт ревью архитектора')
    s.state('queue', 'SHIELD-1', 'регрессия на воркере')
    s.now[0] += 10
    s.state('queue', 'NEW-1', 'ночное ревью')
    s.now[0] += 50
    s.append('12:01:00 [очередь] старт LOG-1\n')
    line = s.collector.snapshot()['lines'][0]
    assert (line['circle'], line['stage'], line['status']) == ('NEW-1', 'Ночное ревью', 'running')


def test_night_review_pending_does_not_stop_line_or_hide_a_real_stop(setup):
    s = setup
    s.panes['dcm-queue'] = [1]
    s.state('queue', 'SHIELD-1', 'ночное ревью')
    s.now[0] += 60
    s.append('12:01:00 [очередь] ночное ревью SHIELD-1: ДОРАБОТАТЬ — круг ждёт ревью архитектора, очередь идёт дальше\n')
    line = s.collector.snapshot()['lines'][0]
    assert line['status'] == 'running'
    assert line['presentation']['attention']['level'] == 'none'
    s.now[0] += 2
    s.append('12:01:01 [очередь] СТОП: SHIELD-1 ошибка Codex\n'
             '12:01:02 [очередь] архитектор: SHIELD-1 — разберу остановку\n')
    assert s.collector.snapshot(fresh=True)['lines'][0]['status'] == 'stopped'
