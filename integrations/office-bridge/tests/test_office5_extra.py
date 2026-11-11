import json
import bridge as b
import jh_observer as j
from test_office5 import fixture, NOW


def test_finish_can_be_enriched_after_analytics_flush_without_duplicate(office, tmp_path):
    b.bootstrap(office)
    p = fixture(tmp_path)
    source = p / 'analytics_events.jsonl'
    data = source.read_text()
    source.unlink()
    assert b.sync_routine(office, tmp_path, [])['events'] == 2
    source.write_text(data)
    assert b.sync_routine(office, tmp_path, [])['events'] == 1
    assert b.sync_routine(office, tmp_path, [])['events'] == 0
    assert office.execute("SELECT count(*) FROM activity_logs WHERE entity_id='bridge-sharik'").fetchone()[0] == 2
    # After log rotation, an orphan end still has the same public identity.
    (p/'scheduled-search.log').write_text('01.11 08:34 end qa rc=0\n')
    b.sync_routine(office, tmp_path, [])
    assert office.execute("SELECT count(*) FROM activity_logs WHERE entity_id='bridge-sharik'").fetchone()[0] == 2


def test_partial_tail_does_not_count_missing_events_as_zero(tmp_path):
    p = fixture(tmp_path)
    source = p/'analytics_events.jsonl'
    rows = source.read_text().splitlines()
    source.write_text('\n'.join(rows[1:])+'\n')
    status, _ = j.observe(tmp_path, [], NOW)
    assert 'найдено 42' not in status[1]  # cannot unambiguously link to scheduled start
    assert 'ошибок этапов' not in status[1]


def test_exec_python_daemon_and_search():
    p = b.Process(1, 0, ['python3', '-m', 'job_hunter', '--profile', 'qa', 'bot-daemon'], '/home/q/work/job-hunter')
    assert j.active_profiles([p]) == (set(), {'qa'})
    p = b.Process(1, 0, ['python3', 'main.py', '--profile=qa', 'search'], '/home/q/work/job-hunter')
    assert j.active_profiles([p]) == ({'qa'}, set())


def test_duplicate_analytics_and_numeric_injection(tmp_path):
    p = fixture(tmp_path)
    source = p/'analytics_events.jsonl'
    rows = source.read_text().splitlines()
    rows.insert(3, rows[2])
    rows.insert(2, rows[1])
    summary = json.loads(rows[-1]); summary['found'] = 'SECRET_COMPANY'; summary['applied'] = True
    rows[-1] = json.dumps(summary)
    source.write_text('\n'.join(rows)+'\n')
    status, _ = j.observe(tmp_path, [], NOW)
    assert 'найдено' not in status[1] and 'SECRET' not in status[1]
    assert 'откликов 1' in status[1] and 'оценено 12' in status[1]


def test_scoped_file_profile_id_is_private_account_id(office, tmp_path):
    b.bootstrap(office)
    p = fixture(tmp_path)
    source = p/'analytics_events.jsonl'
    rows = [json.loads(line) for line in source.read_text().splitlines()]
    for row in rows:
        row['profile_id'] = 'PRIVATE_ACCOUNT_ID'
    source.write_text(''.join(json.dumps(row)+'\n' for row in rows))
    b.sync_routine(office, tmp_path, [])
    dump = '\n'.join(office.iterdump())
    assert 'найдено 42' in dump and 'PRIVATE_ACCOUNT_ID' not in dump
