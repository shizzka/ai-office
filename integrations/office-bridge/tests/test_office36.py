"""OFFICE-36: queue state owns the circle after a Codex substep exits."""
import datetime as dt
import json
import os
from types import SimpleNamespace

import pytest

import bridge as b


def modified(path, when):
    at = dt.datetime.fromisoformat(when).timestamp()
    os.utime(path, (at, at))


@pytest.fixture(params=[
    ('queue', 'SHIELD-VIS-1', 'Щит', '[очередь]', '18:39:00'),
    ('queue-smeta', 'SMETA-1', 'Смета', '[смета]', '18:05:00'),
])
def circle(office, tmp_path, monkeypatch, request):
    lane, code, name, marker, committed = request.param
    root = tmp_path / 'dcm-qa' / lane
    (root / 'state').mkdir(parents=True)
    (root / 'ORDER').write_text(f'B|{code}|dev\n')
    state = root / 'state' / code
    state.write_text(f'регрессия на воркере ({code}-FIX)')
    modified(state, '2026-11-06T17:56:00')
    journal = root / 'queue.log'
    journal.write_text(f'{committed} {marker} коммит abc1234 на feat/{code.lower()}-fix\n')
    modified(journal, '2026-11-06T18:40:00')
    log = root / f'{code}-FIX.log'
    log.write_text('codex\nГотово, коммит abc1234\nEXIT=0\n')
    modified(log, '2026-11-06T18:40:00')
    job = dict(title=code + '-FIX', description='', agent='leha', task_key=code,
               source=str(root / f'{code}-FIX.log.in'), output=str(root / 'missing-out.md'),
               logs=[str(log)], active=True,
               started_at=dt.datetime(2026, 11, 6, 17, 55).timestamp())
    config = tmp_path / 'projects.json'
    config.write_text(json.dumps({'projects': [{'id': 'dcm', 'queues': [
        {'path': str(root), 'name': name, 'logMarker': marker, 'log': str(journal)},
    ]}]}))
    monkeypatch.setenv('OFFICE_PROJECTS_CONFIG', str(config))
    monkeypatch.setattr(b, 'processes', lambda: [])
    monkeypatch.setattr(b, 'run_readonly', lambda *args, **kwargs: '')
    monkeypatch.setattr(b, 'notify', lambda *args: None)
    b.bootstrap(office)
    with office:
        b.set_state(office, 'dcm:jobs', {'run-finished': job})
    return SimpleNamespace(code=code, name=name, marker=marker, state=state, journal=journal,
                           job=job, work=tmp_path, queue=b.configured_queues(tmp_path)[0],
                           tick=lambda: b.tick(office, tmp_path, ''))


def test_finished_codex_without_output_does_not_override_regression(office, circle):
    queue_task = b.queue_tasks(circle.work, circle.journal.read_text().splitlines(),
                              queue=circle.queue)[circle.code]
    assert (queue_task.status, queue_task.priority, queue_task.error) == ('in_progress', 'medium', False)
    assert queue_task.progress_at < b.output_stamp(circle.job['logs'][0])[0] / 1e9
    assert not b.finished_job_result(circle.job)[0]
    circle.tick()
    row = office.execute('SELECT * FROM tasks WHERE id=?',
                         ('bridge-dcm-task-' + circle.code.lower(),)).fetchone()
    assert row['title'] == f'DCM · {circle.name} · {circle.code}'
    assert (row['status'], row['priority'], row['assigned_to']) == ('in_progress', 'medium', 'bridge-motya')
    assert row['status_detail'] == queue_task.detail
    # Keep tracking the process outcome without using it as the circle outcome.
    job = b.get_state(office, 'dcm:jobs')['run-finished']
    assert not job['active'] and not job['result_ok']
    assert 'выходной файл отсутствует' in job['result_detail']
    assert circle.tick()['tasks'] == circle.tick()['events'] == 0


@pytest.mark.parametrize('error_source', ['state', 'journal'])
def test_queue_error_survives_successful_codex_exit(office, circle, error_source):
    if error_source == 'state':
        circle.state.write_text('СТОП: ошибка Codex')
        modified(circle.state, '2026-11-06T18:41:00')
    else:
        with circle.journal.open('a') as stream:
            stream.write(f'18:41:00 {circle.marker} СТОП: {circle.code}-FIX ошибка Codex\n')
        modified(circle.journal, '2026-11-06T18:41:00')
    b.Path(circle.job['output']).write_text('Отчёт готов')
    circle.tick()
    row = office.execute('SELECT * FROM tasks WHERE id=?',
                         ('bridge-dcm-task-' + circle.code.lower(),)).fetchone()
    assert row['title'].startswith('⚠ ')
    assert (row['status'], row['priority']) == ('in_progress', 'urgent')
    assert 'СТОП:' in row['status_detail'] and 'ошибка Codex' in row['status_detail']


@pytest.mark.parametrize('marker', [dict(queue_name='Щит', detail='Регрессия'),
                                        dict(detail='Блок B · регрессия')])
def test_queue_identity_preserves_state_through_retry_cleanup(office, marker):
    b.bootstrap(office)
    task = b.PipelineTask('SHIELD-VIS-1', status='in_progress', priority='urgent', error=True, **marker)

    def job(target, started, ok):
        return dict(title='SHIELD-VIS-1-FIX', description='', agent='leha', source='same.in',
                    output='same.out', logs=[], active=False, task_key=target, started_at=started,
                    result_ok=ok, result_detail='EXIT=0' if ok else 'ошибка',
                    result_evidence=[None], finished_at=1)
    with office:
        b.set_state(office, 'dcm:jobs', {
            'run-failed': job(task.code, 1, False), 'run-retry': job('run-retry', 2, True),
        })
    tasks, _ = b.process_tasks(office, [], {task.code: task}, 'dcm')
    assert tasks[task.code] is task
    assert (task.status, task.priority, task.error) == ('in_progress', 'urgent', True)


@pytest.mark.parametrize('project', ['office', 'jh', 'other', 'dcm'])
def test_finished_codex_outside_queue_still_reports_missing_output(office, project):
    b.bootstrap(office)
    with office:
        b.set_state(office, project + ':jobs', {'run-finished': dict(
            title='Задание', description='', agent='leha', source='', output='', logs=[], active=True)})
    tasks, _ = b.process_tasks(office, [], {}, project)
    task = tasks['run-finished']
    assert (task.status, task.priority, task.error) == ('in_progress', 'urgent', True)
    assert 'выходной файл отсутствует' in task.detail
