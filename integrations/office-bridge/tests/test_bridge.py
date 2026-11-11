from pathlib import Path
import json
import os
import sqlite3
import subprocess

import pytest
import bridge as b


@pytest.mark.parametrize('model,task,agent', [
    ('gpt-6.1-sol','FIX-4','leha'), ('gpt-6-astra','CRITIC-4','asya'),
    ('gpt-6-astra','ACC','asya'), ('gpt-6-astra','TABLES','ivanych'),
    ('gpt-6-astra','NORM-2','ivanych'), ('gpt-6.1-terra','VISUAL-4','taya'),
    ('gpt-6.1-sol','MISSION-1','sanya'), ('gpt-6-astra','TESTER-2','sanya'),
])
def test_codex_stdin(model,task,agent):
    a = b.parse_codex(['codex','exec','--model',model,'-C','/home/q/work/dcm-local','-'],
                      stdin=f'/home/q/work/dcm-qa/fixes/{task}-task.md')
    assert (a.agent,a.project,a.task) == (agent,'dcm',task)


def test_output_equals_options_node_and_relative_path():
    a = b.parse_codex('node /some/bin/codex exec --model=gpt-6.1-sol --cd=../job-hunter -o /tmp/FIX-out.md -',
                      cwd='/home/q/work/dcm-local')
    assert (a.agent,a.project,a.task) == ('leha','jh','FIX')


@pytest.mark.parametrize('args', [
    'bash -c "codex exec --model gpt-6.1-sol -C /home/q/work/dcm-local"',
    'codex app-server --model gpt-6.1-sol -C /home/q/work/dcm-local',
])
def test_unrelated_processes_are_not_team(args):
    assert b.parse_codex(args) is None


def test_stdin_wins_over_output():
    a = b.parse_codex('codex exec -m gpt-6-astra -C /home/q/work/dcm-qa -o /tmp/wrong-out.md -',
                      stdin='/home/q/work/dcm-qa/NORM-task.md')
    assert a.agent == 'ivanych' and a.task == 'NORM'


def test_queue_work_review_done_and_errors():
    tasks = b.parse_pipeline([
        '09:18:34 старт FIX-4', '10:00:00 конец FIX-4: EXIT=0',
        '10:00:10 регрессия FIX-4 ЗЕЛЁНАЯ — feat/fix-4 ждёт ревью',
        '10:01:00 FIX-4 слито в dev', '10:02:00 старт F1A на ветке feat/f1a',
        '10:03:00 регрессия F1A КРАСНАЯ — стоп, dev чистый',
        '10:04:00 СТОП chain: приёмка QA не готова',
    ])
    assert tasks['FIX-4'].status == 'done'
    assert tasks['F1B'].status == 'todo'
    assert tasks['F1A'].error and tasks['F1A'].priority == 'urgent'
    assert tasks['ACC'].error and tasks['ACC'].agent == 'asya'
    assert tasks['F1A'].status != 'done'  # mentioning dev is not a merge


def test_exit_nonzero_is_not_review_and_retry_resets_error():
    tasks = b.parse_pipeline(['старт F2','конец F2: EXIT=10'])
    assert tasks['F2'].error and tasks['F2'].priority == 'urgent'
    tasks = b.parse_pipeline(['СТОП F2', 'старт F2'])
    assert not tasks['F2'].error and tasks['F2'].status == 'in_progress'


def test_contextual_regression_and_actor():
    tasks = b.parse_pipeline(['старт FIX-4','ночь-4: регрессия на воркере', 'регрессия: RESULT False'])
    assert tasks['FIX-4'].error
    assert b.pipeline_actor('регрессия F1A ЗЕЛЁНАЯ') == 'motya'
    assert b.pipeline_actor('ночь: Astra (CRITIC-4)') == 'asya'
    assert b.pipeline_actor('ночь: Terra (VISUAL-4)') == 'taya'
    assert b.pipeline_actor('приёмка влита') == 'yarik'


def test_chain_is_parsed_without_execution(tmp_path):
    script = tmp_path/'chain.sh'
    script.write_text('touch /should-never-exist\nfor S in F1A F1B F1C F2 F3; do\n')
    assert b.planned_stages(script) == b.STAGES


def test_archive_restore_is_durable_and_preserves_every_row(office):
    b.bootstrap(office)
    assert office.execute('select count(*) from agents where archived=0').fetchone()[0] == 10
    assert office.execute('select count(*) from agents where archived=1').fetchone()[0] == 2
    assert office.execute('select title from tasks where id="legacy-task"').fetchone()[0] == 'Сохранить историю'
    assert office.execute('select status_text from agent_status_history where id="history"').fetchone()[0] == 'Старый статус'
    b.legacy_visibility(office,True)
    b.bootstrap(office)  # next bridge restart must not undo the restoration
    assert office.execute('select archived from agents where id="vanya"').fetchone()[0] == 0
    b.legacy_visibility(office,False)
    assert office.execute('select archived from agents where id="vanya"').fetchone()[0] == 1
    assert office.execute('pragma foreign_key_check').fetchall() == []


def test_preserve_prior_archival_and_positions(office):
    office.execute('ALTER TABLE agents ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
    office.execute('UPDATE agents SET archived=1 WHERE id="tema"')
    office.commit()
    b.bootstrap(office)
    office.execute('UPDATE agents SET position_x=333 WHERE id="bridge-leha"')
    office.commit()
    b.bootstrap(office)
    b.legacy_visibility(office,True)
    assert office.execute('select archived from agents where id="tema"').fetchone()[0] == 1
    assert office.execute('select position_x from agents where id="bridge-leha"').fetchone()[0] == 333


def test_atomic_sync_idempotent_append_restart_partial_and_rotation(office,tmp_path):
    b.bootstrap(office)
    path = tmp_path/'pipeline.log'
    path.write_text('09:00 старт F1A\n09:01 конец F1A: EXIT=0\n09:02 незавершено')
    def sync():
        lines,ends,ident = b.pipeline_lines(path)
        return b.sync(office,{'leha':('working','F1A')},b.parse_pipeline(lines),lines,ends,ident,path)
    first = sync()
    assert first['events'] == 2 and first['statuses'] == 1
    assert sync() == {'events':0,'statuses':0,'tasks':0}
    with path.open('a') as f:
        f.write(' F1B\n')
    assert sync()['events'] == 1
    assert sync()['events'] == 0
    path.rename(tmp_path/'old.log')
    path.write_text('09:03 старт F2\n')
    assert sync()['events'] == 1
    path.write_text('старт F3\n')  # same inode truncation
    assert sync()['events'] == 1
    events = [json.loads(r[0]) for r in office.execute('select details from activity_logs')]
    assert all(e['agentName'] == 'Лёха' and e['agentId'] == 'bridge-leha' for e in events)
    assert office.execute('select count(*) from agent_status_history where agent_id="bridge-leha"').fetchone()[0] == 1


def test_transaction_rolls_back_status_and_offsets_on_failure(office,tmp_path):
    b.bootstrap(office)
    path = tmp_path/'pipeline.log'
    path.write_text('старт F1A\n')
    lines,ends,ident = b.pipeline_lines(path)
    bad = b.PipelineTask('F1A',agent='nonexistent')
    with pytest.raises(sqlite3.IntegrityError):
        b.sync(office,{'leha':('working','F1A')},{'F1A':bad},lines,ends,ident,path)
    assert not office.execute('select * from agent_status_history where agent_id="bridge-leha"').fetchall()
    assert b.get_state(office,'pipeline') is None


def test_git_only_completed_dev_and_unmerged_branch(tmp_path):
    repo = tmp_path/'repo'
    repo.mkdir()
    def git(*args):
        return subprocess.run(['git','-C',str(repo),*args],check=True,capture_output=True,text=True).stdout
    git('init','-b','dev')
    git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','--allow-empty','-m','FIX-4 foundation')
    git('checkout','-b','feat/f1a')
    git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','--allow-empty','-m','F1A work')
    tasks = b.parse_pipeline([])
    b.git_evidence(repo,tasks)
    assert tasks['FIX-4'].status == 'done'
    assert tasks['F1A'].status == 'review'
    assert git('branch','--show-current').strip() == 'feat/f1a'
    git('checkout','dev')
    git('merge','--ff-only','feat/f1a')
    b.git_evidence(repo,tasks)
    assert tasks['F1A'].status == 'done'


def test_live_detection_deduplicates_node_and_native_and_shows_office(monkeypatch,tmp_path):
    monkeypatch.setattr(b,'run_readonly',lambda args,**kw:'')
    args = ['codex','exec','--model','gpt-6.1-sol','-C','/home/q/work/dcm-local','-o','/tmp/F1A-out.md','-']
    procs = [b.Process(10,1,['node','/bin/codex',*args[1:]],'/home/q/work/dcm-qa'),
             b.Process(11,10,args,'/home/q/work/dcm-qa'),
             b.Process(12,1,['codex','exec','--model','gpt-6.1-sol','-C','/home/q/ai-office'],'/home/q/ai-office')]
    statuses, assignments = b.collect_status(procs=procs,work=tmp_path,claude_root=tmp_path)
    assert len(assignments) == 2
    assert statuses['leha'][0] == 'working' and statuses['leha'][1].startswith('DCM Lab · F1A')
    assert 'Офис' in statuses['leha'][1]
    assert statuses['sanya'][0] == 'idle'


def test_claude_freshness_and_ops_not_architect(monkeypatch,tmp_path):
    monkeypatch.setattr(b,'run_readonly',lambda args,**kw:'jh-ops\t20\t1\t/home/q/work/jh-ops\n')
    root = tmp_path/'claude'
    def transcript(cwd,mtime):
        directory = root / b.re.sub(r'[^a-zA-Z0-9-]','-',cwd)
        directory.mkdir(parents=True,exist_ok=True)
        f = directory/'session.jsonl'
        f.write_text('{"type":"assistant"}\n')
        os.utime(f,(mtime,mtime))
    transcript('/home/q/work/dcm-local',990)
    transcript('/home/q/work/jh-ops',800)
    procs = [b.Process(10,1,['claude'],'/home/q/work/dcm-local'),
             b.Process(20,1,['claude','-n','jh-ops'],'/home/q/work/jh-ops')]
    statuses,_ = b.collect_status(now=1000,procs=procs,work=tmp_path,claude_root=root)
    assert statuses['yarik'][0] == 'working'
    assert statuses['lyuda'][0] == 'idle'
    transcript('/home/q/work/jh-ops',999)
    statuses,_ = b.collect_status(now=1000,procs=procs,work=tmp_path,claude_root=root)
    assert statuses['lyuda'][0] == 'working'


def test_acceptance_logged_hash_done_only_when_in_dev(tmp_path):
    repo = tmp_path/'repo'
    repo.mkdir()
    def git(*args):
        return subprocess.run(['git','-C',str(repo),*args],check=True,capture_output=True,text=True).stdout
    git('init','-b','dev')
    git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','--allow-empty','-m','base')
    git('checkout','-b','feat/f2')
    git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','--allow-empty','-m','acceptance: приёмочные тесты Ф2/Ф3')
    commit = git('rev-parse','--short','HEAD').strip()
    tasks = b.parse_pipeline([f'10:20:00 приёмка влита {commit}, хеш 123456789012'])
    b.git_evidence(repo,tasks)
    assert tasks['ACC'].status == 'review'
    git('checkout','dev')
    git('merge','--ff-only','feat/f2')
    b.git_evidence(repo,tasks)
    assert tasks['ACC'].status == 'done'


def test_finished_acc_before_import_is_review(tmp_path):
    root = tmp_path/'dcm-qa/acceptance-ws'
    root.mkdir(parents=True)
    (root/'ACC.log').write_text('Finished\nEXIT=0\n')
    tasks = b.parse_pipeline([])
    b.task_log_evidence(tmp_path,tasks)
    assert tasks['ACC'].status == 'review'


def test_legacy_unassigned_tasks_and_projects_are_hidden_and_restored(office):
    office.execute("INSERT INTO projects(id,name) VALUES('legacy-project','Фабрика Контента')")
    office.execute("INSERT INTO tasks(id,title) VALUES('unassigned','Старая задача')")
    office.commit()
    b.bootstrap(office)
    assert office.execute("SELECT archived FROM tasks WHERE id='unassigned'").fetchone()[0] == 1
    assert office.execute("SELECT archived FROM projects WHERE id='legacy-project'").fetchone()[0] == 1
    b.legacy_visibility(office,True)
    b.bootstrap(office)
    assert office.execute("SELECT archived FROM tasks WHERE id='unassigned'").fetchone()[0] == 0
    assert office.execute("SELECT archived FROM projects WHERE id='legacy-project'").fetchone()[0] == 0
    assert office.execute("SELECT COUNT(*) FROM projects WHERE archived=0").fetchone()[0] == 5


def test_contextual_commit_hash_without_stage_token():
    tasks = b.parse_pipeline(['старт F1A', 'коммит abc1234'])
    assert tasks['F1A'].commit == 'abc1234'
    assert tasks['F1A'].status == 'review'


def test_orphan_legacy_activity_archived_restored_without_deletion(office):
    office.execute("INSERT INTO activity_logs(id,entity_type,entity_id,details) VALUES('orphan','agent','deleted-agent','old event')")
    office.commit()
    b.bootstrap(office)
    assert office.execute("SELECT archived FROM activity_logs WHERE id='orphan'").fetchone()[0] == 1
    b.legacy_visibility(office,True)
    b.bootstrap(office)
    assert office.execute("SELECT details,archived FROM activity_logs WHERE id='orphan'").fetchone()[:] == ('old event',0)
    b.legacy_visibility(office,False)
    assert office.execute("SELECT archived FROM activity_logs WHERE id='orphan'").fetchone()[0] == 1


def test_missing_log_completion_does_not_reset_review_to_queue(office,tmp_path):
    b.bootstrap(office)
    path = tmp_path/'pipeline.log'
    path.write_text('')
    b.sync(office,{}, {'ACC':b.PipelineTask('ACC',status='review',agent='asya',detail='EXIT=0')}, [],[],{},path)
    b.sync(office,{},b.parse_pipeline([]),[],[],{},path)
    assert office.execute("SELECT status,description FROM tasks WHERE id='bridge-dcm-task-acc'").fetchone()[:] == ('review','EXIT=0')
    b.sync(office,{},b.parse_pipeline(['старт ACC']),[],[],{},path)
    assert office.execute("SELECT status FROM tasks WHERE id='bridge-dcm-task-acc'").fetchone()[0] == 'in_progress'


def test_finished_report_is_review_if_log_rotated(tmp_path):
    root = tmp_path/'dcm-qa/acceptance-ws'
    root.mkdir(parents=True)
    (root/'ACC-out.md').write_text('Report ready for review')
    (root/'ACC.log').write_text('A later job is using this log now\n')
    tasks = b.parse_pipeline([])
    b.task_log_evidence(tmp_path,tasks)
    assert tasks['ACC'].status == 'review'


def test_git_hash_is_not_stage_and_acc_numeric_suffix_is_recognized():
    tasks = b.parse_pipeline(['приёмка влита f123456, хеш 123456789012'])
    assert tasks['ACC'].status == 'review'
    assert tasks['ACC'].commit == 'f123456'
    assert 'F123456' not in tasks
    assert b.task_codes('старт ACC2 на ветке feat/acc2') == ['ACC2']


@pytest.mark.parametrize('path,project', [
    ('/home/q/work/dcm/src/main.py', 'DCM Lab'),
    ('/home/q/work/dcm-qa/TASK.md', 'DCM Lab'),
    ('/home/q/work/dcm-local/src/main.py', 'DCM Lab'),
    ('/home/q/work/job-hunter/src/main.py', 'job-hunter'),
])
@pytest.mark.parametrize('age,status', [(10, 'working'), (119, 'working'), (120, 'idle'), (121, 'idle'), (-1, 'idle')])
def test_claude_home_cwd_project_from_transcript(monkeypatch, tmp_path, path, project, age, status):
    monkeypatch.setattr(b, 'run_readonly', lambda *a, **kw: '')
    directory = tmp_path / '-home-q'
    directory.mkdir()
    transcript = directory / 'session.jsonl'
    transcript.write_text(json.dumps({'type': 'assistant', 'message': {'content': [
        {'type': 'tool_use', 'name': 'Read', 'input': {'file_path': path}}
    ]}}) + '\n')
    os.utime(transcript, (1000 - age, 1000 - age))
    statuses, _ = b.collect_status(now=1000, procs=[b.Process(10, 1, ['claude'], '/home/q')],
                                   work=tmp_path, claude_root=tmp_path)
    assert statuses['yarik'][0] == status
    assert statuses['yarik'][1].startswith(project + ' ·')


def test_claude_latest_records_project_switch_and_thinking(tmp_path):
    transcript = tmp_path / 'session.jsonl'
    def record(content):
        return json.dumps({'type': 'assistant', 'message': {'content': content}}) + '\n'
    transcript.write_text(record([{'type': 'thinking', 'thinking': '/home/q/work/dcm-local'}]) +
                          record([{'type': 'tool_use', 'input': {'command': 'cd /home/q/work/job-hunter'}}]) +
                          '{"type":"assistant",')  # incomplete append ignored
    assert b.transcript_context(transcript) == ('jh', 'working')
    with transcript.open('w') as f:
        f.write(record([{'type': 'text', 'text': '/home/q/work/job-hunter'}]) +
                record([{'type': 'thinking', 'thinking': 'Проверяю план'}]))
    assert b.transcript_context(transcript) == ('jh', 'thinking')


def test_claude_resume_from_another_cwd_and_unrelated_session(tmp_path, monkeypatch):
    monkeypatch.setattr(b, 'run_readonly', lambda *a, **kw: '')
    original = tmp_path / '-home-q-work-dcm-local'
    original.mkdir()
    transcript = original / 'resumed.jsonl'
    transcript.write_text(json.dumps({'type': 'user', 'message': {'content': 'work/dcm-local'}}) + '\n')
    assert b.transcript_for('/home/q', ['claude', '--resume', 'resumed'], tmp_path) == transcript
    # A home session must not borrow a different session's project/activity.
    statuses, _ = b.collect_status(procs=[b.Process(10, 1, ['claude'], '/home/q')],
                                   work=tmp_path, claude_root=tmp_path)
    assert statuses['yarik'][0] == 'idle'


def test_office_work_is_a_board_project():
    assert b.project_for('/home/q/ai-office') == 'office'
    assert b.project_for('/home/q/work/office-bridge') == 'office'
    assert b.PROJECTS['office'][0] == 'Офис'


def test_unknown_astra_assignment_is_asya():
    # 01.11: ТЗ тестировщика от Astra (TASK.md) не показывалось в офисе — неизвестное задание Astra = Ася.
    assert b.role_for("TASK", "gpt-6-astra") == "asya"
    assert b.role_for("TABLES-2", "gpt-6-astra") == "ivanych"
