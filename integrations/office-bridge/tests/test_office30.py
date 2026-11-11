import json
from pathlib import Path
import shutil

import pytest
import bridge as b


FIXTURES = Path(__file__).parent / 'fixtures/office30'


@pytest.fixture
def lanes(tmp_path, monkeypatch, office):
    shutil.copytree(FIXTURES, tmp_path / 'dcm-qa')
    (tmp_path / 'dcm-qa/queue/state').mkdir(exist_ok=True)
    config = tmp_path / 'projects.json'
    config.write_text(json.dumps({'projects': [{'id': 'dcm', 'queues': [
        {'path': str(tmp_path / 'dcm-qa/queue'), 'logMarker': '[очередь]', 'name': 'Щит'},
        {'path': str(tmp_path / 'dcm-qa/queue-smeta'), 'logMarker': '[смета]', 'name': 'Смета'},
    ]}]}))
    monkeypatch.setenv('OFFICE_PROJECTS_CONFIG', str(config))
    monkeypatch.setattr(b, 'processes', lambda: [])
    monkeypatch.setattr(b, 'run_readonly', lambda *a, **kw: '')
    monkeypatch.setattr(b, 'notify', lambda *a: None)
    b.bootstrap(office)
    return config, lambda: b.tick(office, tmp_path, '')


def card(db, code):
    return db.execute('SELECT * FROM tasks WHERE id=?', ('bridge-dcm-task-' + code.lower(),)).fetchone()


def test_two_fixture_lanes_have_names_and_separate_state_and_log_evidence(office, tmp_path, lanes):
    _, tick = lanes
    tick()
    shield, smeta = card(office, 'SHIELD-1'), card(office, 'SMETA-0')
    assert (shield['status'], shield['priority']) == ('in_progress', 'urgent')
    assert (smeta['status'], smeta['priority']) == ('review', 'medium')
    assert 'DCM · Щит · SHIELD-1' in shield['title']
    assert 'DCM · Смета · SMETA-0' in smeta['title']
    assert card(office, 'QA-SMETA-1')['status'] == 'done'
    assert card(office, 'REVIEW')['status'] == 'in_progress'
    events = [json.loads(row[0]) for row in office.execute('SELECT details FROM activity_logs')]
    assert any('[смета] критик' in e.get('message', '') and e.get('agentName') == 'Ася' for e in events)
    assert tick()['tasks'] == 0
    assert tick()['events'] == 0  # shared journal has one durable cursor


@pytest.mark.parametrize('state,status,priority,agent', [
    ('СТОП: SMETA-0 ошибка', 'in_progress', 'urgent', 'bridge-leha'),
    ('регрессия SMETA-0 КРАСНАЯ', 'in_progress', 'urgent', 'bridge-motya'),
    ('SMETA-0 ждёт ревью', 'review', 'medium', 'bridge-yarik'),
    ('готово (abc1234)', 'review', 'medium', 'bridge-yarik'),
    ('готово (историческая красная — чинит SMETA-0-R1)', 'done', 'medium', 'bridge-leha'),
])
def test_smeta_uses_existing_queue_status_rules(office, tmp_path, lanes, state, status, priority, agent):
    _, tick = lanes
    (tmp_path / 'dcm-qa/queue-smeta/state/SMETA-0').write_text(state)
    tick()
    row = card(office, 'SMETA-0')
    assert (row['status'], row['priority'], row['assigned_to']) == (status, priority, agent)


@pytest.mark.parametrize('old_status', ['in_progress', 'review', 'done'])
def test_moving_code_keeps_record_status_and_history_without_duplicate_or_false_close(office, tmp_path, lanes, old_status):
    _, tick = lanes
    shield, smeta = tmp_path / 'dcm-qa/queue', tmp_path / 'dcm-qa/queue-smeta'
    (shield / 'ORDER').write_text('C|SMETA-7|dev\n')
    (smeta / 'ORDER').write_text('')
    (shield / 'state/SMETA-7').write_text('регрессия на воркере' if old_status == 'in_progress' else 'готово')
    if old_status == 'done':
        b.REVIEWED_FILE.write_text('SMETA-7\n')
    tick()
    before = card(office, 'SMETA-7')
    assert before['status'] == old_status
    event_count = office.execute('SELECT count(*) FROM activity_logs').fetchone()[0]
    b.REVIEWED_FILE.unlink(missing_ok=True)
    # ORDER may temporarily contain the code in both lanes during transfer.
    (smeta / 'ORDER').write_text('D|SMETA-7|dev\n')
    tick()
    (shield / 'ORDER').write_text('')
    b.bootstrap(office)  # restart retains task identity and observed status
    tick()
    after = card(office, 'SMETA-7')
    assert (after['id'], after['status'], after['status_detail']) == (before['id'], old_status, before['status_detail'])
    assert 'DCM · Смета · SMETA-7' in after['title']
    assert office.execute("SELECT count(*) FROM tasks WHERE id LIKE '%smeta-7%'").fetchone()[0] == 1
    assert office.execute('SELECT count(*) FROM activity_logs').fetchone()[0] == event_count
    assert tick()['tasks'] == 0
    # New positive evidence from its current lane can change the status.
    (smeta / 'state/SMETA-7').write_text('СТОП: ошибка')
    tick()
    assert (card(office, 'SMETA-7')['status'], card(office, 'SMETA-7')['priority']) == ('in_progress', 'urgent')


def test_foreign_markers_cannot_change_state_or_merge_other_lane_tasks(office, tmp_path, lanes):
    _, tick = lanes
    log = tmp_path / 'dcm-qa/fixes/pipeline.log'
    log.write_text('старт F3\nрегрессия F3 ЗЕЛЁНАЯ\n'
                   '[очередь] старт SHIELD-1\n[смета] старт SMETA-0\n'
                   '[смета] SHIELD-1 влит в dev\n[очередь] SMETA-0 влит в dev\n'
                   '[смета] регрессия F3 КРАСНАЯ\n')
    tick()
    assert card(office, 'SHIELD-1')['status'] == 'in_progress'
    assert card(office, 'SMETA-0')['status'] == 'in_progress'
    assert card(office, 'F3')['status'] == 'review'
    with log.open('a') as stream:
        stream.write('[смета] SMETA-0 влит в dev\n[очередь] SHIELD-1 влит в dev\n')
    tick()
    assert card(office, 'SHIELD-1')['status'] == 'done'
    assert card(office, 'SMETA-0')['status'] == 'done'


def test_single_path_legacy_config_and_explicit_config_argument(tmp_path, lanes):
    config, _ = lanes
    root = tmp_path / 'dcm-qa/queue'
    for source, expected in [(str(root), b.QueueLine(root)),
                             (str(tmp_path / 'dcm-qa/fixes/pipeline.log'),
                              b.QueueLine(root, log=tmp_path / 'dcm-qa/fixes/pipeline.log'))]:
        config.write_text(json.dumps({'projects': [{'id': 'dcm', 'queue': source}]}))
        assert b.configured_queues(tmp_path, config) == [expected]
    config.unlink()
    assert b.configured_queues(tmp_path, config) == [b.QueueLine(root)]


def test_separate_journals_are_scoped_and_read_once(office, tmp_path, lanes):
    config, tick = lanes
    raw = json.loads(config.read_text())
    for item in raw['projects'][0]['queues']:
        item['log'] = str(Path(item['path']) / 'queue.log')
        Path(item['log']).write_text(f"{item['logMarker']} старт SMETA-0\n")
    config.write_text(json.dumps(raw))
    tick()
    assert card(office, 'SMETA-0')['status'] == 'in_progress'
    assert tick()['events'] == 0


def test_queue_line_name_survives_live_process_overlay(office, tmp_path, lanes):
    config, _ = lanes
    queues = b.configured_queues(tmp_path, config)
    pipeline = b.queue_tasks(tmp_path, [], queue=queues[1])
    assignment = b.Assignment(agent='leha', project='dcm', task='SMETA-0',
        cwd=str(tmp_path), source=str(queues[1].path / 'tasks/SMETA-0.md'),
        output='', run_id='smeta-live')
    tasks, _ = b.process_tasks(office, [assignment], pipeline, 'dcm')
    assert tasks['SMETA-0'].queue_name == 'Смета'
    b.sync(office, {}, tasks, [], [], {}, tmp_path)
    assert 'DCM · Смета · SMETA-0' in card(office, 'SMETA-0')['title']
