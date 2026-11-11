import json
import sqlite3

import pytest

import bridge as b


def test_descriptions_priority_reload_and_preserved_status(office, tmp_path):
    b.bootstrap(office)
    root = tmp_path / 'dcm-qa/fixes'
    root.mkdir(parents=True)
    (root / 'F2-task.md').write_text('# Задание F2: Единая модель объекта\nДетали\n')
    titles = root / 'board-titles.json'
    titles.write_text(json.dumps({'F2': 'Модель помещений'}))

    def sync(lines):
        tasks = b.parse_pipeline(lines, planned=('F2', 'F3'))
        b.describe_pipeline(tmp_path, tasks)
        b.sync(office, {}, tasks, [], [], {}, root / 'pipeline.log')
        return office.execute("SELECT description,status_detail,status FROM tasks WHERE id='bridge-dcm-task-f2'").fetchone()[:]

    assert sync(['старт F2']) == ('Модель помещений', 'старт F2', 'in_progress')
    replacement = root / 'replacement.json'
    replacement.write_text(json.dumps({'F2': 'Обновлённая модель'}))
    replacement.replace(titles)
    assert sync([]) == ('Обновлённая модель', 'старт F2', 'in_progress')
    titles.write_text('{}')
    assert sync([])[0] == 'Единая модель объекта'
    (root / 'F2-task.md').unlink()
    titles.write_text('invalid json during write')
    assert sync([])[0] == 'Единая модель объекта'
    assert office.execute("SELECT description FROM tasks WHERE id='bridge-dcm-task-f3'").fetchone()[0] == 'В очереди конвейера'


def test_green_recheck_clears_warning_and_later_failure_wins(office, tmp_path):
    b.bootstrap(office)
    lines = ['старт F0', 'регрессия: RESULT False',
             '11:15:21 F0: регрессия перепроверена — ЗЕЛЁНАЯ (повтор PASS)']
    tasks = b.parse_pipeline(lines)
    assert not tasks['F0'].error and tasks['F0'].priority == 'medium'
    b.sync(office, {}, tasks, [], [], {}, tmp_path / 'pipeline.log')
    assert office.execute("SELECT title,priority FROM tasks WHERE id='bridge-dcm-task-f0'").fetchone()[:] == ('DCM · F0', 'medium')
    assert b.parse_pipeline(lines + ['регрессия F0 КРАСНАЯ'])['F0'].error
    assert not b.parse_pipeline(['регрессия F0 КРАСНАЯ', 'старт F0'])['F0'].error


@pytest.mark.parametrize('model,agent', [('gpt-6.1-sol', 'leha'), ('gpt-6-astra', 'asya'), ('gpt-6.1-terra', 'taya')])
@pytest.mark.parametrize('location', ['-C /home/q/ai-office',
                                     '-C /unknown --add-dir /home/q/work/office-bridge',
                                     '-C /home/q --add-dir=/home/q/work/office-bridge'])
def test_office_assignments_for_all_models(monkeypatch, tmp_path, model, agent, location):
    monkeypatch.setattr(b, 'run_readonly', lambda *a, **kw: '')
    source = tmp_path / 'TASK-4.md'
    source.write_text('# Задание OFFICE-4: Понятная доска\nОписание\n')
    args = b.shlex.split(f'codex exec -m {model} {location} -')
    statuses, assignments = b.collect_status(procs=[b.Process(10, 1, args, '/home/q', str(source))],
                                            work=tmp_path, claude_root=tmp_path)
    assert statuses[agent] == ('working', 'Офис: Задание OFFICE-4: Понятная доска')
    assert len(assignments) == 1 and assignments[0].project == 'office'
    assert 'office' in b.PROJECTS


@pytest.mark.parametrize('cwd', ['/home/q/work/job-hunter', '/home/q/work/job-hunter-branch',
                                 '/home/q/work/job-hunter/worktrees/branch'])
@pytest.mark.parametrize('model,agent', [('gpt-6.1-sol', 'leha'), ('gpt-6-astra', 'asya'), ('gpt-6.1-terra', 'taya')])
def test_arbitrary_jh_task_names_and_models(tmp_path, cwd, model, agent):
    source = tmp_path / 'arbitrary.md'
    source.write_text('# Ускорить поиск вакансий\n\nПоказывать результаты по мере загрузки.\n')
    assignment = b.parse_codex(['codex', 'exec', '-m', model, '-C', cwd, '-o', 'answer.md', '-'],
                               cwd=str(tmp_path), stdin=str(source))
    assert assignment.project == 'jh' and assignment.agent == agent
    assert assignment.source == str(source)
    assert assignment.output == str(tmp_path / 'answer.md')
    assert b.job_text(assignment.source, assignment.task) == ('Ускорить поиск вакансий', 'Показывать результаты по мере загрузки.')


def test_jh_lifecycle_restart_dedup_and_pid_reuse(office, tmp_path, monkeypatch):
    b.bootstrap(office)
    monkeypatch.setattr(b, 'run_readonly', lambda *a, **kw: '')
    source = tmp_path / 'anything.md'
    source.write_text('# Поиск вакансий\n\nПроверить обработку пагинации.\n')
    output = tmp_path / 'result.md'
    log = tmp_path / 'run.log'
    log.write_text('working\n')
    args = ['codex', 'exec', '-m', 'gpt-6-astra', '-C', '/home/q/work/job-hunter-feature', '-o', str(output), '-']
    # Child is deliberately listed before the launcher.
    procs = [b.Process(11, 10, args, str(tmp_path), str(source), str(log), start_ticks=101),
             b.Process(10, 1, ['node', '/bin/codex', *args[1:]], str(tmp_path), str(source), str(log), start_ticks=100)]
    monkeypatch.setattr(b, 'processes', lambda: procs)
    monkeypatch.setattr(b, 'notify', lambda *a: None)
    b.tick(office, tmp_path, '')
    query = "SELECT id,title,description,status,assigned_to FROM tasks WHERE project_id='bridge-jh'"
    row = office.execute(query).fetchone()
    assert row[1:] == ('Поиск вакансий', 'Проверить обработку пагинации.', 'in_progress', 'bridge-asya')
    task_id = row[0]
    # Reopen the database just as a fresh bridge does.
    dbpath = office.execute('PRAGMA database_list').fetchone()[2]
    with b.connect(b.Path(dbpath)) as restarted:
        b.bootstrap(restarted)
        assert b.tick(restarted, tmp_path, '')['tasks'] == 0
        assert restarted.execute(query).fetchone()['id'] == task_id
        assert len(restarted.execute(query).fetchall()) == 1
        output.write_text('Готово')
        log.write_text('Finished\nEXIT=0\n')
        procs.clear()
        b.tick(restarted, tmp_path, '')
        assert restarted.execute(query).fetchone()['status'] == 'done'
        assert b.tick(restarted, tmp_path, '')['tasks'] == 0
        # A later invocation may reuse both the PID and output path.
        log.write_text('working again\n')
        procs.append(b.Process(10, 1, args, str(tmp_path), str(source), str(log), start_ticks=200))
        b.tick(restarted, tmp_path, '')
        assert len(restarted.execute(query).fetchall()) == 2
        assert restarted.execute('SELECT status FROM tasks WHERE id=?', (task_id,)).fetchone()[0] == 'done'


@pytest.mark.parametrize('has_output,tail,ok', [
    (False, 'EXIT=0\n', False), (True, 'Finished\nEXIT=0\n', True),
    (True, 'EXIT=10\n', False), (True, 'error: connection failed\n', False),
    (True, '{"type":"turn.failed","error":{}}\n', False),
    (True, 'EXIT=0\nerror: later failure\n', False),
    (True, 'error: retry\nEXIT=0\n', True),
])
def test_jh_completion_requires_output_and_no_final_error(office, tmp_path, has_output, tail, ok):
    b.bootstrap(office)
    output = tmp_path / 'output.md'
    log = tmp_path / 'codex.log'
    if has_output:
        output.write_text('Report')
    log.write_text(tail)
    assignment = b.Assignment('taya', 'jh', 'arbitrary', '/home/q/work/job-hunter',
                              output=str(output), logs=(str(log),), run_id='boot:1:100')
    tasks, jobs = b.jh_tasks(office, [assignment], {})
    b.sync(office, {}, tasks, [], [], {}, tmp_path / 'pipeline.log', 'jh', jobs)
    tasks, jobs = b.jh_tasks(office, [], {})
    b.sync(office, {}, tasks, [], [], {}, tmp_path / 'pipeline.log', 'jh', jobs)
    row = office.execute("SELECT title,status,priority FROM tasks WHERE project_id='bridge-jh'").fetchone()
    assert row['title'].startswith('⚠') is (not ok)
    assert row['status'] == ('done' if ok else 'in_progress')
    assert row['priority'] == ('medium' if ok else 'urgent')


def test_jh_missing_stdin_uses_output_name():
    a = b.parse_codex('codex exec -m gpt-6-astra -C /home/q/work/job-hunter -o /tmp/any-answer.md -', stdin='pipe:[42]')
    assert a.task == 'any-answer' and a.source == ''


def test_office_work_never_creates_a_dcm_or_jh_card(office, tmp_path, monkeypatch):
    b.bootstrap(office)
    monkeypatch.setattr(b, 'collect_status', lambda **kw: (
        {'leha': ('working', 'Офис: OFFICE-4')},
        [b.Assignment('leha', 'office', 'OFFICE-4', '/home/q/ai-office')]))
    monkeypatch.setattr(b, 'run_readonly', lambda *a, **kw: '')
    monkeypatch.setattr(b, 'notify', lambda *a: None)
    b.tick(office, tmp_path, '')
    assert office.execute("SELECT count(*) FROM tasks WHERE title LIKE '%OFFICE-4%' AND project_id='bridge-office'").fetchone()[0] == 1
    assert office.execute("SELECT current_status FROM agents WHERE id='bridge-leha'").fetchone()[0] == 'working'
    assert office.execute("SELECT count(*) FROM projects WHERE id LIKE 'bridge-%'").fetchone()[0] == 4


def test_optional_jh_pipeline_has_no_dcm_stages_and_independent_cursor(office, tmp_path, monkeypatch):
    b.bootstrap(office)
    monkeypatch.setattr(b, 'collect_status', lambda **kw: ({}, []))
    monkeypatch.setattr(b, 'run_readonly', lambda *a, **kw: '')
    monkeypatch.setattr(b, 'notify', lambda *a: None)
    root = tmp_path / 'job-hunter'
    root.mkdir()
    path = root / 'pipeline.log'
    path.write_text('12:00:00 старт SEARCH-PAGING\n12:05:00 конец SEARCH-PAGING: EXIT=0\n')
    assert b.tick(office, tmp_path, '')['events'] == 2
    assert b.tick(office, tmp_path, '')['events'] == 0
    rows = office.execute("SELECT title,status FROM tasks WHERE project_id='bridge-jh'").fetchall()
    assert [tuple(row) for row in rows] == [('JH · SEARCH-PAGING', 'done')]
    with path.open('a') as stream:
        stream.write('12:10:00 старт SEARCH-PAGING\n12:15:00 конец SEARCH-PAGING: EXIT=1\n')
    assert b.tick(office, tmp_path, '')['events'] == 2
    assert office.execute("SELECT priority FROM tasks WHERE project_id='bridge-jh'").fetchone()[0] == 'urgent'
    details = [json.loads(row[0]) for row in office.execute('SELECT details FROM activity_logs')]
    assert all(detail['projectId'] == 'bridge-jh' for detail in details)
    assert b.get_state(office, 'pipeline:jh')['size'] == path.stat().st_size
