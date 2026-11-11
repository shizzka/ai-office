import json
import time

import pytest
import bridge as b


@pytest.fixture
def tick(office, tmp_path, monkeypatch):
    b.bootstrap(office)
    monkeypatch.setattr(b, 'processes', lambda: [])
    monkeypatch.setattr(b, 'run_readonly', lambda *a, **kw: '')
    monkeypatch.setattr(b, 'notify', lambda *a: None)
    return lambda: b.tick(office, tmp_path, '')


def test_review_file_is_live_optional_and_durable(office, tmp_path, tick):
    job = dict(title='OFFICE-26 — коты', description='Описание', agent='leha',
               source='', output='', logs=[], active=False, review=True,
               result_ok=True, result_detail='EXIT=0')
    with office:
        b.set_state(office, 'office:jobs', {'run-old': job})
    tick()  # missing file is fine
    tid = 'bridge-office-task-run-old'
    assert office.execute('SELECT status FROM tasks WHERE id=?', (tid,)).fetchone()[0] == 'review'
    b.REVIEWED_FILE.write_text('# комментарий\n\nOFFICE-26 # принято\nOFFICE-26\n')
    tick()
    row = office.execute('SELECT status,status_detail FROM tasks WHERE id=?', (tid,)).fetchone()
    assert tuple(row) == ('done', 'Принято Яриком')
    before = office.execute('SELECT count(*) FROM activity_logs').fetchone()[0]
    b.bootstrap(office)
    assert tick()['tasks'] == 0
    assert office.execute('SELECT count(*) FROM activity_logs').fetchone()[0] == before
    events = [json.loads(r[0]) for r in office.execute('SELECT details FROM activity_logs')]
    accepted = [e for e in events if e['message'] == 'Ярик принял ревью: OFFICE-26']
    assert len(accepted) == 1 and accepted[0]['agentName'] == 'Ярик'


def test_review_accepts_stored_task_key_without_a_journal(office, tick):
    with office:
        office.execute("INSERT INTO tasks(id,title,status,priority,project_id) VALUES('standalone','⚠ Задача','review','urgent','bridge-office')")
    b.REVIEWED_FILE.write_text('standalone\n')
    tick()
    assert tuple(office.execute("SELECT status,status_detail,title,priority FROM tasks WHERE id='standalone'").fetchone()) == (
        'done', 'Принято Яриком', 'Задача', 'medium')
    assert tick()['tasks'] == 0


def queue(tmp_path, code='UI-GUARD-1', kind='dev'):
    root = tmp_path / 'dcm-qa/queue'
    (root / 'state').mkdir(parents=True)
    (root / 'ORDER').write_text(f'B|{code}|{kind}\n')
    return root / 'state' / code


def test_done_queue_with_historical_red_is_closed_by_successor(office, tmp_path, tick):
    state = queue(tmp_path)
    state.write_text('готово (3b4a35a; красная: дрейф эталонов — чинит UI-GUARD-1-R1)')
    tick()
    row = office.execute("SELECT title,status,priority,status_detail FROM tasks WHERE id='bridge-dcm-task-ui-guard-1'").fetchone()
    assert tuple(row)[1:] == ('done', 'medium', 'закрыт кругом UI-GUARD-1-R1')
    assert '⚠' not in row['title']
    assert tick()['tasks'] == 0


@pytest.mark.parametrize('code', ['F2', 'F3', 'FIX-5', 'UI-GUARD-1-R1'])
def test_dev_completion_waits_for_explicit_merge(office, tmp_path, tick, code):
    state = queue(tmp_path, code)
    state.write_text('готово (abc1234), Ярик: РЕКОМЕНДУЮ В DEV — ждёт ревью')
    tid = 'bridge-dcm-task-' + code.lower()
    tick()
    assert office.execute('SELECT status FROM tasks WHERE id=?', (tid,)).fetchone()[0] == 'review'
    root = tmp_path / 'dcm-qa/fixes'
    root.mkdir(parents=True)
    (root / 'pipeline.log').write_text(f'12:00 {code} влит в dev (abc1234)\n')
    tick()
    assert office.execute('SELECT status FROM tasks WHERE id=?', (tid,)).fetchone()[0] == 'done'
    assert tick()['tasks'] == 0


def test_queue_review_file_beats_red_and_review(office, tmp_path, tick):
    state = queue(tmp_path, 'FIX-5')
    state.write_text('красная: ошибка')
    b.REVIEWED_FILE.write_text('FIX-5\n')
    tick()
    assert tuple(office.execute("SELECT status,status_detail FROM tasks WHERE id='bridge-dcm-task-fix-5'").fetchone()) == ('done', 'Принято Яриком')
    assert tick()['tasks'] == 0


def test_queue_review_survives_completed_substep_and_uses_separate_merge_journal(office, tmp_path, tick):
    state = queue(tmp_path, 'UI-GUARD-1-R1')
    state.write_text('готово (2d06928), Ярик: РЕКОМЕНДУЮ В DEV')
    root = state.parent.parent
    (root / 'dcm-queue.sh').write_text('L=$Q/queue.log\n')
    detail = b.queue_tasks(tmp_path, [])['UI-GUARD-1-R1'].detail
    with office:
        b.set_state(office, 'dcm:jobs', {'run-substep': dict(title='UI-GUARD-1-R1-critic',
            description='', agent='asya', source='', output='', logs=[], active=False,
            task_key='UI-GUARD-1-R1', result_ok=True, result_detail='EXIT=0', evidence_before=detail)})
    tid = 'bridge-dcm-task-ui-guard-1-r1'
    tick()
    assert office.execute('SELECT status FROM tasks WHERE id=?', (tid,)).fetchone()[0] == 'review'
    fixes = tmp_path / 'dcm-qa/fixes'
    fixes.mkdir(parents=True)
    (fixes / 'pipeline.log').write_text('UI-GUARD-1-R1 влит в dev\n')
    tick()
    assert office.execute('SELECT status FROM tasks WHERE id=?', (tid,)).fetchone()[0] == 'done'
    assert tick()['tasks'] == 0


def test_later_final_answer_clears_transcript_error_but_not_separate_stderr(tmp_path):
    output, log, stderr = (tmp_path / name for name in ('out.md', 'run.log', 'stderr.log'))
    output.write_text('Все модули готовы')
    log.write_text('fatal: not a git repository\ncodex\nВсе модули готовы\ntokens used\n123\n')
    job = dict(output=str(output), logs=[str(log)], started_at=time.time() - 1)
    assert b.finished_job_result(job)[0]
    stderr.write_text('error: transport failed\n')
    job['logs'].append(str(stderr))
    assert not b.finished_job_result(job)[0]
    job['logs'].pop()
    log.write_text('fatal: failed\n{"type":"turn.completed"}\nEXIT=7\n')
    assert not b.finished_job_result(job)[0]


def test_cached_failure_rechecks_later_evidence_without_review_file(office, tmp_path, tick):
    output, log = tmp_path / 'out.md', tmp_path / 'run.log'
    output.write_text('Все модули готовы')
    log.write_text('fatal: not a git repository\ncodex\nВсе модули готовы\n')
    with office:
        b.set_state(office, 'dcm:jobs', {'run-spec': dict(title='SPEC-2 — Щит', description='', agent='asya',
            source='/spec/modules/04-task.md', output=str(output), logs=[str(log)], active=False,
            result_ok=False, result_detail='ошибка', finished_at=1, started_at=time.time() - 5)})
    tick()
    row = office.execute("SELECT title,status,priority FROM tasks WHERE id='bridge-dcm-task-run-spec'").fetchone()
    assert row['status'] == 'done' and row['priority'] == 'medium' and '⚠' not in row['title']
    assert tick()['tasks'] == 0


def test_successful_retry_closes_only_same_assignment_and_keeps_new_failure(office, tmp_path, tick):
    def job(source, started, ok, target=None):
        return dict(title='SPEC-2 — модуль', description='', agent='asya', source=source,
                    output=source + '-out', logs=[], active=False, started_at=started,
                    result_ok=ok, result_detail='EXIT=0' if ok else 'ошибка',
                    result_evidence=[None], finished_at=1, **({'task_key': target} if target else {}))
    with office:
        b.set_state(office, 'dcm:jobs', {
            'run-failed': job('/same', 1, False), 'run-other': job('/other', 2, False),
            'run-ok': job('/same', 3, True),
            'run-first': job('/stage', 4, False, 'F3'), 'run-good': job('/stage', 5, True, 'F3'),
            'run-last': job('/stage', 6, False, 'F3')})
    tick()
    for key, expected in [('run-failed', 'done'), ('run-other', 'in_progress'), ('F3', 'in_progress')]:
        assert office.execute('SELECT status FROM tasks WHERE id=?', ('bridge-dcm-task-' + key.lower(),)).fetchone()[0] == expected
    assert tick()['tasks'] == 0


def test_review_matches_spec_round_but_never_a_prefix(office, tick):
    with office:
        for key, title in [('one', 'SPEC-2 — Смета'), ('two', 'SPEC-20 — другой круг')]:
            office.execute('INSERT INTO tasks(id,title,status,project_id) VALUES(?,?,?,?)', (key, title, 'review', 'bridge-dcm'))
    b.REVIEWED_FILE.write_text('SPEC-2\n')
    tick()
    assert office.execute("SELECT status FROM tasks WHERE id='one'").fetchone()[0] == 'done'
    assert office.execute("SELECT status FROM tasks WHERE id='two'").fetchone()[0] == 'review'
