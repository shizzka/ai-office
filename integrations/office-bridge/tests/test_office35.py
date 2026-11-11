"""OFFICE-35: recovered circles and architect approval on the task board."""
import datetime as dt
import json
import os
from pathlib import Path
import shutil
from types import SimpleNamespace

import pytest

import bridge as b


FIXTURE = Path(__file__).parent / 'fixtures/office35'


def modified(path, when):
    at = dt.datetime.fromisoformat(when).timestamp()
    os.utime(path, (at, at))
    return at


@pytest.fixture
def board(office, tmp_path, monkeypatch):
    root = tmp_path / 'dcm-qa'
    shutil.copytree(FIXTURE, root)
    config = tmp_path / 'projects.json'
    config.write_text(json.dumps({'projects': [{'id': 'dcm', 'queues': [
        {'path': str(root / 'queue'), 'logMarker': '[очередь]', 'name': 'Щит'},
        {'path': str(root / 'queue-smeta'), 'logMarker': '[смета]', 'name': 'Смета'},
    ]}]}))
    monkeypatch.setenv('OFFICE_PROJECTS_CONFIG', str(config))
    monkeypatch.setattr(b, 'processes', lambda: [])
    monkeypatch.setattr(b, 'run_readonly', lambda *args, **kwargs: '')
    monkeypatch.setattr(b, 'notify', lambda *args: None)
    b.bootstrap(office)
    log = root / 'fixes/pipeline.log'
    state = root / 'queue-smeta/state/SMETA-1'
    modified(log, '2026-11-06T18:06:00')
    modified(state, '2026-11-06T17:56:00')
    modified(root / 'queue/state/SHIELD-1', '2026-11-06T17:56:00')
    return SimpleNamespace(root=root, state=state, log=log,
                           queues=b.configured_queues(tmp_path), work=tmp_path,
                           tick=lambda: b.tick(office, tmp_path, ''))


def card(db, code='SMETA-1'):
    return db.execute('SELECT * FROM tasks WHERE id=?', ('bridge-dcm-task-' + code.lower(),)).fetchone()


def no_recovery(board):
    board.log.write_text(''.join(board.log.read_text().splitlines(keepends=True)[:3]))
    modified(board.log, '2026-11-06T18:06:00')


def assert_normal(row):
    assert (row['status'], row['priority']) == ('in_progress', 'medium')
    assert '⚠' not in row['title']


def test_recorded_recovery_clears_stored_warning_and_stale_failed_run(office, board):
    no_recovery(board)
    board.state.write_text('СТОП: SMETA-1-FIX изменил acceptance/')
    modified(board.state, '2026-11-05T22:27:33')
    board.tick()
    assert card(office)['priority'] == 'urgent'
    board.state.write_text('регрессия на воркере (SMETA-1-FIX)')
    modified(board.state, '2026-11-06T17:56:00')
    # The old Codex error used to override the normal queue state every tick.
    with office:
        b.set_state(office, 'dcm:jobs', {'run-old': dict(
            title='SMETA-1-FIX', description='', agent='leha', task_key='SMETA-1',
            source='', output='', logs=[], active=False, result_ok=False,
            result_detail='СТОП: изменил acceptance/', result_evidence=[None],
            finished_at=dt.datetime(2026, 11, 5, 22, 27, 33).timestamp())})
    board.tick()
    row = card(office)
    assert_normal(row)
    assert row['title'] == 'DCM · Смета · SMETA-1'
    assert row['assigned_to'] == 'bridge-motya'
    assert 'регрессия на воркере (SMETA-1-FIX)' in row['status_detail']
    assert not b.queue_tasks(board.work, board.log.read_text().splitlines(), queue=board.queues[1])['SMETA-1'].error
    assert board.tick()['tasks'] == board.tick()['events'] == 0


@pytest.mark.parametrize('state', [
    'в работе (Лёха): SMETA-1-FIX', 'регрессия на воркере (SMETA-1-FIX)',
    'критик (Ася): SMETA-1-FIX', 'ночное ревью SMETA-1-FIX', 'ждёт лимит Codex',
])
def test_normal_state_newer_than_stop_clears_warning(office, board, state):
    no_recovery(board)
    board.state.write_text(state)
    modified(board.state, '2026-11-06T17:56:00')
    board.tick()
    assert_normal(card(office))


@pytest.mark.parametrize('state', [
    'СТОП: SMETA-1-FIX изменил acceptance/', 'регрессия SMETA-1 КРАСНАЯ',
    'ошибка Codex', 'СТОП: ждёт лимит Codex',
])
def test_state_itself_still_reports_error(office, board, state):
    board.state.write_text(state)
    modified(board.state, '2026-11-06T18:06:00')
    board.tick()
    row = card(office)
    assert row['priority'] == 'urgent' and row['title'].startswith('⚠ ')


def test_new_journal_error_after_state_and_recovery_is_visible(office, board):
    with board.log.open('a') as stream:
        stream.write('18:07:00 [смета] СТОП: SMETA-1-FIX новая ошибка Codex\n')
    modified(board.log, '2026-11-06T18:08:00')
    board.tick()
    row = card(office)
    assert row['priority'] == 'urgent' and row['title'].startswith('⚠ ')
    assert 'новая ошибка' in row['status_detail']


@pytest.mark.parametrize('failed_at', ['2026-11-05T22:27:33', '2026-11-06T18:07:00'])
def test_failed_substep_log_does_not_override_queue_state(office, board, failed_at):
    no_recovery(board)
    log = board.root / 'substep.log'
    log.write_text('EXIT=7\n')
    modified(log, failed_at)
    with office:
        b.set_state(office, 'dcm:jobs', {'run-failed': dict(
            title='SMETA-1-FIX', description='', agent='leha', task_key='SMETA-1',
            source='', output='', logs=[str(log)], active=True, started_at=1)})
    board.tick()
    assert_normal(card(office))
    assert board.tick()['tasks'] == 0


@pytest.mark.parametrize('recovery', [
    'продолжение SMETA-1-FIX на сохранённом дереве', 'старт SMETA-1-FIX',
    'коммит 4d36f8c на feat/smeta-1-fix',
])
@pytest.mark.parametrize('stale_state', [False, True])
def test_explicit_recovery_clears_previous_circle_error(office, board, recovery, stale_state):
    if stale_state:
        board.state.write_text('СТОП: SMETA-1-FIX изменил acceptance/')
        modified(board.state, '2026-11-05T22:27:33')
    else:
        board.state.unlink()
    no_recovery(board)
    with board.log.open('a') as stream:
        stream.write(f'18:07:00 [смета] {recovery}\n')
    modified(board.log, '2026-11-06T18:08:00')
    board.tick()
    assert_normal(card(office))


@pytest.mark.parametrize('unrelated', [
    '[очередь] старт SMETA-1-FIX', '[смета] старт SMETA-10',
    '[смета] старт QA-SMETA-1', '[смета] коммит 4d36f8c на feat/smeta-10',
    '[смета] коммит 4d36f8c', '[смета] архитектор: продолжение SMETA-1-FIX',
])
def test_other_circle_lane_or_note_cannot_clear_error(office, board, unrelated):
    board.state.unlink()
    no_recovery(board)
    with board.log.open('a') as stream:
        stream.write(f'18:07:00 {unrelated}\n')
    modified(board.log, '2026-11-06T18:08:00')
    board.tick()
    assert card(office)['priority'] == 'urgent'


@pytest.mark.parametrize('lane,code', [('queue', 'SHIELD-1'), ('queue-smeta', 'SMETA-1')])
def test_approved_file_accepts_circle_and_emits_one_review_event(office, board, lane, code):
    state = board.root / lane / 'state' / code
    state.write_text('СТОП: ошибка Codex')
    modified(state, '2026-11-06T18:06:00')
    board.tick()
    assert card(office, code)['priority'] == 'urgent'
    approved = state.with_name(code + '.approved')
    approved.touch()  # Presence is acceptance, even with no contents.
    tasks = b.queue_tasks(board.work, board.log.read_text().splitlines(),
                          queue=next(q for q in board.queues if q.path.name == lane))
    assert (tasks[code].status, tasks[code].error, tasks[code].detail) == ('done', False, b.REVIEWED_DETAIL)
    # Even a live substep must not reopen a circle accepted by the architect.
    assignment = b.Assignment(agent='leha', project='dcm', task=code,
                              cwd=str(board.work), source=str(state.parent.parent / 'tasks' / (code + '.md')),
                              output='', run_id='still-live')
    tasks, _ = b.process_tasks(office, [assignment], tasks, 'dcm')
    b.sync(office, {}, tasks, [], [], {}, board.log)
    row = card(office, code)
    assert (row['status'], row['priority'], row['status_detail']) == ('done', 'medium', 'Принято Яриком')
    assert '⚠' not in row['title']
    board.tick()
    b.bootstrap(office)
    b.REVIEWED_FILE.write_text(code + '\n')  # Both sources still mean one acceptance.
    board.tick()
    events = [json.loads(r[0]) for r in office.execute('SELECT details FROM activity_logs')]
    accepted = [e for e in events if e['message'] == f'Ярик принял ревью: {code}']
    assert len(accepted) == 1
    assert accepted[0]['source'] == str(approved)
    assert accepted[0]['taskId'] == row['id']
    assert board.tick()['tasks'] == board.tick()['events'] == 0


@pytest.mark.parametrize('has_job', [False, True])
def test_approved_circle_without_order_is_accepted_once_and_scoped_to_dcm(office, board, has_job):
    board.tick()
    (board.state.parent.parent / 'ORDER').write_text('')
    approved = board.state.with_name('SMETA-1.approved')
    approved.touch()
    with office:
        office.execute("INSERT INTO tasks(id,title,status,project_id) VALUES('bridge-jh-task-smeta-1','SMETA-1','review','bridge-jh')")
        if has_job:
            b.set_state(office, 'dcm:jobs', {'run-old': dict(
                title='SMETA-1-FIX', description='', agent='leha', task_key='SMETA-1',
                source='', output='', logs=[], active=False, result_ok=False,
                result_detail='ошибка', result_evidence=[None], finished_at=1)})
    board.tick()
    row = card(office)
    assert (row['status'], row['priority'], row['status_detail']) == ('done', 'medium', 'Принято Яриком')
    assert office.execute("SELECT status FROM tasks WHERE id='bridge-jh-task-smeta-1'").fetchone()[0] == 'review'
    b.bootstrap(office)
    assert board.tick()['tasks'] == board.tick()['events'] == 0
    events = [json.loads(r[0]) for r in office.execute('SELECT details FROM activity_logs')]
    assert len([e for e in events if e['message'] == 'Ярик принял ревью: SMETA-1']) == 1


def test_clock_only_dates_use_all_lines_across_midnight():
    modified_at = dt.datetime(2026, 11, 6, 0, 5).timestamp()
    times = b.queue_log_times([
        '23:59:00 [смета] СТОП: SMETA-1',
        '00:01:00 unrelated pipeline entry',
        '00:04:00 [смета] старт SMETA-1-FIX',
    ], modified_at)
    assert [dt.datetime.fromtimestamp(at) for at in times] == [
        dt.datetime(2026, 11, 5, 23, 59), dt.datetime(2026, 11, 6, 0, 1), dt.datetime(2026, 11, 6, 0, 4)]


def test_approval_event_uses_circle_code_when_stored_card_has_a_run_id(office, board):
    (board.state.parent.parent / 'ORDER').write_text('')
    board.state.with_name('SMETA-1.approved').touch()
    with office:
        office.execute("INSERT INTO tasks(id,title,status,project_id) VALUES('bridge-dcm-task-run-old','SMETA-1 — круг','review','bridge-dcm')")
    board.tick()
    events = [json.loads(r[0]) for r in office.execute('SELECT details FROM activity_logs')]
    accepted = [e for e in events if e.get('taskId') == 'bridge-dcm-task-run-old']
    assert len(accepted) == 1
    assert accepted[0]['message'] == 'Ярик принял ревью: SMETA-1'
    assert board.tick()['tasks'] == 0
