import json
import sqlite3

import pytest
import bridge as b
from cleanup22c import cleanup, CODES, NOTE


@pytest.fixture
def watcher(office, tmp_path, monkeypatch):
    b.bootstrap(office)
    procs = []
    monkeypatch.setattr(b, 'processes', lambda: procs)
    monkeypatch.setattr(b, 'run_readonly', lambda *a, **kw: '')
    monkeypatch.setattr(b, 'notify', lambda *a: None)
    return procs, lambda db=office: b.tick(db, tmp_path, '')


def process(tmp_path, project='jh', model='gpt-6.1-sol', heading='B67 — восстановление сессии', **kwargs):
    source = tmp_path / 'TASK.md'
    source.write_text('# ' + heading + '\nОписание задания\n')
    output = tmp_path / 'out.md'
    log = tmp_path / 'run.log'
    log.write_text('working\n')
    cwd = {'jh': '/mnt/work/jh-b58', 'office': '/home/q/ai-office',
           'dcm': '/home/q/work/dcm-qa', 'other': '/tmp/new-project'}[project]
    args = ['codex', 'exec', '-m', model, '-C', cwd, '-o', str(output), '-']
    return b.Process(101, 1, args, str(tmp_path), str(source), str(log), start_ticks=123, **kwargs), output, log


def cards(db, project):
    return db.execute('SELECT * FROM tasks WHERE project_id=?', ('bridge-' + project,)).fetchall()


@pytest.mark.parametrize('project,heading,model,agent', [
    ('jh', 'B67 — восстановление сессии', 'gpt-6.1-sol', 'leha'),
    ('office', 'OFFICE-22b — пульт режиссёра', 'gpt-6.1-sol', 'leha'),
    ('dcm', 'Приёмка тестировщика', 'gpt-6-astra', 'asya'),
    ('other', 'Нарисовать обложку', 'gpt-6.1-terra', 'taya'),
])
def test_all_projects_lifecycle_restart_and_feed(office, tmp_path, watcher, project, heading, model, agent):
    procs, tick = watcher
    p, output, log = process(tmp_path, project, model, heading)
    procs.append(p)
    tick()
    row = cards(office, project)[0] if project != 'dcm' else office.execute("SELECT * FROM tasks WHERE title=?", (heading,)).fetchone()
    assert row['assigned_to'] == 'bridge-' + agent
    assert row['status'] == 'in_progress'
    assert 'TASK' not in row['title']
    if project == 'office':
        assert row['title'] == heading
    if project == 'jh':
        assert row['title'].startswith('JH · B67')
    dbpath = office.execute('PRAGMA database_list').fetchone()[2]
    with b.connect(b.Path(dbpath)) as restarted:
        b.bootstrap(restarted)
        assert tick(restarted)['tasks'] == 0
        output.write_text('Готово\n')
        log.write_text('EXIT=0\n')
        procs.clear()
        tick(restarted)
        final = restarted.execute('SELECT * FROM tasks WHERE id=?', (row['id'],)).fetchone()
        assert final['status'] == ('review' if project == 'office' else 'done')
        assert tick(restarted)['tasks'] == 0
        events = [json.loads(r[0]) for r in restarted.execute('SELECT details FROM activity_logs WHERE entity_id=?', ('bridge-' + agent,))]
        assert len(events) == 2
        assert all(e['agentName'] == b.TEAM[agent][0] for e in events)
        assert any('Старт' in e['message'] for e in events)
        assert any('Завершение' in e['message'] for e in events)


@pytest.mark.parametrize('tail,output', [
    ('EXIT=0\n', ''), ('EXIT=7\n', 'old report'),
    ("You've hit your usage limit\n", 'old report'),
    ('rate limit reached\n', 'report'),
    ('error: unavailable\n', 'report'), ('EXIT=0\n', '  \n'),
])
def test_errors_and_empty_output_are_visible(office, tmp_path, watcher, tail, output):
    procs, tick = watcher
    p, out, log = process(tmp_path)
    procs.append(p)
    tick()
    out.write_text(output)
    log.write_text(tail)
    procs.clear()
    tick()
    row = cards(office, 'jh')[0]
    assert row['status'] == 'in_progress' and row['priority'] == 'urgent'
    assert '⚠' in row['title']
    assert row['status_detail']
    events = [json.loads(r[0]) for r in office.execute('SELECT details FROM activity_logs')]
    assert any('Ошибка' in e['message'] for e in events)


@pytest.mark.parametrize('heading,marker', [
    ('Очень секретное задание', ''), ('Оформить офис', 'Сюрприз для Марины'),
    ('Оформить офис', 'Пометка: сюрприз для Марины'),
])
def test_secret_has_no_public_description_files_or_error_details(office, tmp_path, watcher, heading, marker):
    procs, tick = watcher
    p, output, log = process(tmp_path, 'office', heading=heading)
    b.Path(p.stdin).write_text('# ' + heading + '\n' + marker + '\nУЛЬТРАСЕКРЕТ /hidden/secret.png\n')
    procs.append(p)
    tick()
    row = cards(office, 'office')[0]
    assert row['title'] == b.SECRET_TITLE and row['description'] == ''
    procs.clear()
    log.write_text('error: /hidden/secret.png\n')
    tick()
    row = cards(office, 'office')[0]
    assert row['title'] == b.SECRET_TITLE and row['description'] == ''
    public = json.dumps([tuple(row) for row in office.execute('SELECT title,description,status_detail FROM tasks')], ensure_ascii=False)
    public += json.dumps([tuple(row) for row in office.execute('SELECT status_text FROM agent_status_history')], ensure_ascii=False)
    public += json.dumps([tuple(row) for row in office.execute('SELECT details FROM activity_logs')], ensure_ascii=False)
    assert 'УЛЬТРАСЕКРЕТ' not in public and '/hidden/' not in public
    assert str(tmp_path) not in public
    assert 'Марин' not in public


def test_privacy_requirements_do_not_mark_the_task_itself_secret(tmp_path):
    source = tmp_path / 'TASK-22c.md'
    source.write_text('# OFFICE-22c — доска задач\n- Секретные задания: заголовок «Очень секретное задание», сюрприз для Марины.\n')
    assert b.job_text(str(source), '')[0] == 'OFFICE-22c — доска задач'


def test_priority_cd_then_added_then_output_and_worktree_metadata(tmp_path):
    assert b.parse_codex('codex exec -C /mnt/work/jh-b58 --add-dir /home/q/ai-office -o /tmp/out.md').project == 'jh'
    assert b.parse_codex('codex exec -C /unknown --add-dir /home/q/ai-office -o /home/q/work/security-audit/b67-last.md').project == 'office'
    assert b.parse_codex('codex exec -C /unknown -o /home/q/work/dcm-qa/out.md').project == 'dcm'
    assert b.project_for('/mnt/work/c14-c15-review') == 'jh'
    tree = tmp_path / 'arbitrary-review'
    tree.mkdir()
    (tree / '.git').write_text('gitdir: /mnt/work/job-hunter/.git/worktrees/arbitrary-review\n')
    assert b.project_for(str(tree / 'src')) == 'jh'


def test_output_neighbor_task_heading_and_unheaded_jh_prompt(tmp_path):
    (tmp_path / 'TASK-22b.md').write_text('# OFFICE-22b — пульт режиссёра\nДетали\n')
    a = b.parse_codex(['codex', 'exec', '-C', '/home/q/ai-office', '-o', 'OUT-22b.md', '-'], cwd=str(tmp_path), stdin='pipe:[42]')
    assert a.source == str(tmp_path / 'TASK-22b.md')
    assert a.task == 'OFFICE-22b'
    source = tmp_path / 'prompt-b67-task.md'
    source.write_text('Working in /mnt/work/jh-b58\n\nB67 — исправить сессию\n')
    a = b.parse_codex(['codex', 'exec', '-C', '/mnt/work/jh-b58', '-o', 'b67-last.md'], cwd=str(tmp_path))
    assert a.source == str(source) and a.task == 'B67'


def test_parent_child_order_single_run_and_separate_stderr(office, tmp_path, watcher):
    procs, tick = watcher
    p, output, log = process(tmp_path)
    stderr = tmp_path / 'stderr.log'
    stderr.write_text('error: failed\n')
    launcher = b.replace(p, args=['node', '/bin/codex', *p.args[1:]], stdin='pipe:[42]')
    child = b.replace(p, pid=102, ppid=101, stderr=str(stderr), start_ticks=124)
    procs.extend([launcher, child])
    tick()
    assert len(cards(office, 'jh')) == 1
    assert len(b.get_state(office, 'jh:jobs')) == 1
    output.write_text('Report\n')
    log.write_text('EXIT=0\n')
    procs.clear()
    tick()
    assert cards(office, 'jh')[0]['priority'] == 'urgent'


def test_cleanup_dry_run_is_idempotent_and_survives_old_pipeline_and_restart(office, tmp_path, watcher):
    procs, tick = watcher
    for code in CODES:
        office.execute('INSERT INTO tasks(id,title,status,description,status_detail,project_id,assigned_to) VALUES(?,?,?,?,?,?,?)',
                       ('bridge-dcm-task-' + code.lower(), 'DCM · ' + code, 'review' if '4' in code else 'in_progress', 'История', 'Старый статус', 'bridge-dcm', 'bridge-leha'))
    office.commit()
    before = list(office.iterdump())
    assert len(cleanup(office)) == 7
    assert list(office.iterdump()) == before
    cleanup(office, True)
    cleanup(office, True)
    root = tmp_path / 'dcm-qa/fixes'
    root.mkdir(parents=True)
    (root / 'pipeline.log').write_text('старт ACC2\nстарт CRITIC-4\nконец VISUAL-4: EXIT=0\n')
    b.bootstrap(office)
    tick()
    for code in CODES:
        row = office.execute('SELECT status,description,status_detail FROM tasks WHERE id=?', ('bridge-dcm-task-' + code.lower(),)).fetchone()
        assert tuple(row) == ('done', 'История', NOTE)


def queue_fixture(tmp_path):
    root = tmp_path / 'dcm-qa/queue'
    (root / 'tasks').mkdir(parents=True)
    (root / 'state').mkdir()
    (root / 'ORDER').write_text('C|SMETA-0|dev\nC|QA-SMETA-1|qa\nE|REVIEW|pause\n')
    (root / 'tasks/SMETA-0.md').write_text('# SMETA-0 — контракт\nПубличные интерфейсы\n')
    (root / 'dcm-queue.sh').write_text('Q=/home/q/work/dcm-qa/queue; L=$Q/queue.log\n')
    (root / 'queue.log').write_text('09:00 [очередь] старт SMETA-0\n')
    return root


def test_queue_stages_external_architect_and_review(office, tmp_path, watcher):
    procs, tick = watcher
    root = queue_fixture(tmp_path)
    assert b.queue_source(tmp_path) == root / 'queue.log'
    tid = 'bridge-dcm-task-smeta-0'
    def state(text):
        (root / 'state/SMETA-0').write_text(text)
        tick()
        return office.execute('SELECT * FROM tasks WHERE id=?', (tid,)).fetchone()
    assert state('в работе (Лёха): SMETA-0')['assigned_to'] == 'bridge-leha'
    assert state('регрессия на воркере (SMETA-0)')['assigned_to'] == 'bridge-motya'
    assert state('критик (Ася): SMETA-0')['assigned_to'] == 'bridge-asya'
    row = state('Ярик (ночная смена): ревью SMETA-0')
    assert row['assigned_to'] is None and b.NIGHT_ARCHITECT in row['status_detail']
    assert 'dev → регрессия → критик → ночной архитектор → ждёт ревью Ярика' in row['status_detail']
    assert state('готово (abc1234), Ярик: РЕКОМЕНДУЮ В DEV')['status'] == 'review'
    assert state('готово (одобрено)')['status'] == 'review'  # approval is not a dev merge
    assert office.execute('SELECT count(*) FROM agents WHERE name=?', (b.NIGHT_ARCHITECT,)).fetchone()[0] == 0
    events = [json.loads(r[0]) for r in office.execute('SELECT details FROM activity_logs')]
    assert any(e['agentName'] == b.NIGHT_ARCHITECT for e in events)
    assert tick()['tasks'] == 0


def test_queue_arch_process_does_not_animate_asya_or_create_substep_card(office, tmp_path, watcher):
    procs, tick = watcher
    root = queue_fixture(tmp_path)
    (root / 'out').mkdir()
    source = root / 'out/SMETA-0-arch-task.md'
    source.write_text('Ты — Ярик в ночную смену: ревью круга SMETA-0\n')
    (root / 'state/SMETA-0').write_text('Ярик (ночная смена): ревью SMETA-0')
    args = ['codex', 'exec', '-C', '/home/q/work/dcm-local', '-m', 'gpt-6-astra', '-o', str(root / 'out/SMETA-0-arch.md'), '-']
    procs.append(b.Process(200, 1, args, str(tmp_path), str(source), start_ticks=999))
    tick()
    assert office.execute("SELECT current_status FROM agents WHERE id='bridge-asya'").fetchone()[0] == 'idle'
    rows = office.execute("SELECT * FROM tasks WHERE title LIKE '%SMETA-0%'").fetchall()
    assert len(rows) == 1 and rows[0]['assigned_to'] is None


def test_dcm_exit_without_pipeline_completion_does_not_stick(office, tmp_path, watcher):
    procs, tick = watcher
    root = tmp_path / 'dcm-qa/fixes'
    root.mkdir(parents=True)
    (root / 'pipeline.log').write_text('старт F3\n')
    p, output, log = process(tmp_path, 'dcm', heading='F3 — ядро')
    procs.append(p)
    tick()
    assert office.execute("SELECT status FROM tasks WHERE id='bridge-dcm-task-f3'").fetchone()[0] == 'in_progress'
    output.write_text('Сделано\n')
    log.write_text('EXIT=0\n')
    procs.clear()
    tick()
    assert office.execute("SELECT status FROM tasks WHERE id='bridge-dcm-task-f3'").fetchone()[0] == 'review'
    assert tick()['tasks'] == 0


@pytest.mark.parametrize('heading,agent', [('NORM-2 — нормы', 'ivanych'), ('TESTER-2 — приёмка', 'sanya')])
def test_specialists_start_and_finish_under_their_own_names(office, tmp_path, watcher, heading, agent):
    procs, tick = watcher
    p, output, log = process(tmp_path, 'dcm', 'gpt-6-astra', heading)
    procs.append(p)
    tick()
    output.write_text('Готово')
    log.write_text('EXIT=0\n')
    procs.clear()
    tick()
    events = [json.loads(r[0]) for r in office.execute('SELECT details FROM activity_logs WHERE entity_id=?', ('bridge-' + agent,))]
    assert len(events) == 2
    assert all(e['agentName'] == b.TEAM[agent][0] for e in events)


def test_delayed_exit_evidence_clears_initial_missing_output(office, tmp_path, watcher):
    procs, tick = watcher
    p, output, log = process(tmp_path)
    procs.append(p)
    tick()
    procs.clear()
    tick()
    assert cards(office, 'jh')[0]['priority'] == 'urgent'
    output.write_text('Report')
    log.write_text('EXIT=0\n')
    tick()
    assert cards(office, 'jh')[0]['status'] == 'done'
    assert tick()['tasks'] == 0


def test_limit_in_output_without_log_and_stale_report_are_not_success(tmp_path):
    output = tmp_path / 'out.md'
    output.write_text("You've hit your usage limit. Try again later.")
    assert not b.job_result(dict(output=str(output), logs=[]))[0]
    output.write_text('Old report')
    job = dict(output=str(output), logs=[], output_before=b.output_stamp(str(output)))
    assert not b.finished_job_result(job)[0]
    assert not b.finished_job_result(job)[0]


def test_shared_pipeline_queue_markers_do_not_corrupt_f3_state(tmp_path):
    root = queue_fixture(tmp_path)
    (root / 'dcm-queue.sh').write_text('L=/home/q/work/dcm-qa/fixes/pipeline.log\n')
    lines = ['старт F3', 'регрессия F3 ЗЕЛЁНАЯ',
             '09:00 [очередь] старт SMETA-0', '09:02 [очередь] регрессия SMETA-0 КРАСНАЯ']
    assert b.parse_pipeline(lines)['F3'].status == 'review'
    assert b.queue_tasks(tmp_path, lines)['SMETA-0'].error
    assert b.queue_source(tmp_path) == tmp_path / 'dcm-qa/fixes/pipeline.log'


def test_fresh_report_written_before_first_poll_is_valid_without_exit_log(tmp_path):
    import time
    output = tmp_path / 'out.md'
    output.write_text('Report')
    job = dict(output=str(output), logs=[], output_before=b.output_stamp(str(output)), started_at=time.time() - 10)
    assert b.finished_job_result(job)[0]
    job['started_at'] = time.time() + 10
    assert not b.finished_job_result(job)[0]


def test_critic_reviewing_another_stage_does_not_reopen_that_stage(office, tmp_path, watcher):
    procs, tick = watcher
    root = tmp_path / 'dcm-qa/fixes'
    root.mkdir(parents=True)
    (root / 'pipeline.log').write_text('старт FIX-3\nFIX-3 слито в dev\n')
    source = tmp_path / 'CRITIC-4-task.md'
    source.write_text('# Критика изменений FIX-3\nПроверить код\n')
    args = ['codex', 'exec', '-C', '/home/q/work/dcm-local', '-m', 'gpt-6-astra', '-o', str(tmp_path / 'critic-out.md'), '-']
    procs.append(b.Process(300, 1, args, str(tmp_path), str(source), start_ticks=555))
    tick()
    assert office.execute("SELECT status FROM tasks WHERE id='bridge-dcm-task-fix-3'").fetchone()[0] == 'done'
    rows = office.execute("SELECT title,assigned_to FROM tasks WHERE id LIKE 'bridge-dcm-task-run-%'").fetchall()
    assert len(rows) == 1
    assert rows[0]['title'].startswith('DCM · CRITIC-4 — ')
    assert rows[0]['assigned_to'] == 'bridge-asya'
