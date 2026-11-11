import json
import bridge as b


def test_whoami_rename_preserves_id_assignments_history_and_migrates_feed_once(office):
    b.bootstrap(office)
    aid = b.agent_id('mihalych')
    # Simulate an existing installation, including escaped Unicode in old feed.
    office.execute("UPDATE agents SET name=?,position_x=333 WHERE id=?", ('Михалыч', aid))
    office.execute("INSERT INTO tasks(id,title,description,status_detail,assigned_to) VALUES(?,?,?,?,?)",
                   ('bridge-security-review', 'Ревью Михалыча', 'Михалыч проверяет код', 'Михалыч: работает', aid))
    office.execute("INSERT INTO agent_status_history(id,agent_id,status,status_text) VALUES(?,?,?,?)",
                   ('security-history', aid, 'working', 'Михалыч проверяет код'))
    old = json.dumps({'agentId': aid, 'agentName': 'Михалыч', 'message': 'Кот на клавиатуре Михалыча'})
    office.execute("INSERT INTO activity_logs(id,entity_type,entity_id,action,details) VALUES(?,?,?,?,?)",
                   ('bridge-security-event', 'agent', aid, 'pipeline', old))
    office.execute("DELETE FROM office_bridge_state WHERE key='office18_whoami'")
    office.commit()
    b.bootstrap(office)
    hero = office.execute('SELECT * FROM agents WHERE id=?', (aid,)).fetchone()
    assert (hero['name'], hero['role'], hero['position_x']) == ('whoami', 'Безопасник', 333)
    task = office.execute("SELECT * FROM tasks WHERE id='bridge-security-review'").fetchone()
    assert (task['title'], task['assigned_to']) == ('Ревью whoami', aid)
    assert task['description'] == 'whoami проверяет код'
    assert task['status_detail'] == 'whoami: работает'
    history = office.execute("SELECT * FROM agent_status_history WHERE id='security-history'").fetchone()
    assert history['agent_id'] == aid and history['status_text'] == 'whoami проверяет код'
    details = office.execute("SELECT details FROM activity_logs WHERE id='bridge-security-event'").fetchone()[0]
    assert json.loads(details) == {'agentId': aid, 'agentName': 'whoami', 'message': 'Кот на клавиатуре whoami'}
    b.bootstrap(office)
    assert office.execute("SELECT details FROM activity_logs WHERE id='bridge-security-event'").fetchone()[0] == details
    assert office.execute("SELECT COUNT(*) FROM agents WHERE name='whoami'").fetchone()[0] == 1
    assert office.execute('PRAGMA foreign_key_check').fetchall() == []


def test_old_source_text_cannot_restore_the_old_name_after_restart(office, tmp_path):
    b.bootstrap(office)
    source = tmp_path / 'pipeline.log'
    source.write_text('Михалыч проверяет код\n')
    lines, offsets, identity = b.pipeline_lines(source)
    counts = b.sync(office, {'mihalych': ('working', 'Михалыч: аудит')}, {}, lines, offsets, identity, source)
    assert counts['statuses'] == 1 and counts['events'] == 1
    assert office.execute("SELECT status_text FROM agent_status_history WHERE agent_id='bridge-mihalych'").fetchone()[0] == 'whoami: аудит'
    details = office.execute("SELECT details FROM activity_logs WHERE action='pipeline'").fetchone()[0]
    assert json.loads(details)['message'] == 'whoami проверяет код'
    assert b.sync(office, {'mihalych': ('working', 'Михалыч: аудит')}, {}, lines, offsets, identity, source) == {'statuses': 0, 'tasks': 0, 'events': 0}
