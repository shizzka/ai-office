import datetime as dt
import json
from pathlib import Path

import bridge as b
import jh_observer as j

NOW = dt.datetime(2026, 11, 1, 12, tzinfo=j.TZ)


def fixture(root, profile='qa', end=True, rc=0):
    p = root / 'profiles' / profile
    p.mkdir(parents=True, exist_ok=True)
    (p/'scheduled-search.log').write_text(f'01.11 08:00 start {profile}\nPRIVATE_COMPANY https://private.invalid TOKEN_SECRET\n' +
                                          (f'01.11 08:34 end {profile} rc={rc}\n' if end else ''))
    rows = [dict(event='search_started', created_at='2026-11-01T08:00:03', run_id='SECRET_RUN'),
            dict(event='decision', created_at='2026-11-01T08:01:00', run_id='SECRET_RUN', evaluation_present=True, vacancy_id='SECRET_VACANCY'),
            dict(event='application_result', created_at='2026-11-01T08:03:00', run_id='SECRET_RUN', outcome='sent', application_id='SECRET_APPLICATION'),
            dict(event='stage_failed', created_at='2026-11-01T08:04:00', run_id='SECRET_RUN', failure_id='SECRET_FAILURE')]
    if end:
        rows.append(dict(event='search_finished', created_at='2026-11-01T08:34:37', run_id='SECRET_RUN', found=42, applied=1, funnel={'evaluated': 12}))
    for row in rows:
        row.update(title='SECRET_TITLE', company='PRIVATE_COMPANY', url='https://private.invalid', token='TOKEN_SECRET', profile_id=profile)
    (p/'analytics_events.jsonl').write_text(''.join(json.dumps(row)+'\n' for row in rows))
    return p


def proc(profile='qa', command='search', pid=10):
    return b.Process(pid, 1, ['bash', '/fake/run.sh', '--profile', profile, command], '/fake')


def test_completed_and_metrics(tmp_path):
    fixture(tmp_path)
    status, events = j.observe(tmp_path, [], NOW)
    assert status[0] == 'idle'
    for text in ['основной', 'rc=0', 'найдено 42', 'оценено 12', 'откликов 1', 'ошибок этапов 1', 'утро/вечер']:
        assert text in status[1]
    assert len(events) == 2 and 'найдено' not in events[0][1] and 'найдено 42' in events[1][1]


def test_live_stale_start_failure_and_daemon(tmp_path):
    fixture(tmp_path, end=False)
    status, _ = j.observe(tmp_path, [proc(), proc(command='bot-daemon')], NOW)
    assert status[0] == 'working' and 'откликов 1' in status[1] and 'чат: основной' in status[1]
    assert 'найдено' not in status[1]
    assert j.observe(tmp_path, [], NOW)[0][0] == 'idle'
    fixture(tmp_path, rc=7)
    assert '⚠ rc=7' in j.observe(tmp_path, [], NOW)[0][1]


def test_partial_unknown_missing_and_shared_analytics(tmp_path):
    p = fixture(tmp_path)
    (p/'analytics_events.jsonl').write_text('{broken}\n[]\n{"event":"unknown","title":"SECRET"}\n')
    assert 'найдено' not in j.observe(tmp_path, [], NOW)[0][1]
    (tmp_path/'analytics_events.jsonl').write_text(json.dumps(dict(event='search_finished', run_id='x', profile_id='qa', created_at='2026-11-01T08:34:00', found=99, applied=2))+'\n')
    # Missing start cannot associate an arbitrary shared run to a scheduled start.
    assert 'найдено' not in j.observe(tmp_path, [], NOW)[0][1]
    (p/'scheduled-search.log').write_text('01.11 08:34 end qa rc=0\n')
    assert 'найдено 99' in j.observe(tmp_path, [], NOW)[0][1]
    (tmp_path/'analytics_events.jsonl').write_text(json.dumps(dict(event='search_finished', run_id='x', profile_id='other', created_at='2026-11-01T08:34:00', found=99))+'\n')
    assert 'найдено' not in j.observe(tmp_path, [], NOW)[0][1]
    (p/'scheduled-search.log').write_text('01.11 08:00 start qa')
    assert not j.scheduled(p/'scheduled-search.log', 'qa', NOW)


def test_held_lock_is_required_and_only_real_commands(tmp_path):
    profile = 'qa'
    path = tmp_path/'jh-search-qa.lock'
    path.touch()
    locks = tmp_path/'locks'
    locks.write_text('')
    processes = [proc(pid=15, command='other')]
    assert not j.locked_profiles([profile], processes, tmp_path, locks)
    st = path.stat()
    locks.write_text(f'1: FLOCK ADVISORY WRITE 15 {j.os.major(st.st_dev):x}:{j.os.minor(st.st_dev):x}:{st.st_ino} 0 EOF\n')
    assert j.locked_profiles([profile], processes, tmp_path, locks) == {'qa'}
    assert not j.locked_profiles([profile], [], tmp_path, locks)
    assert j.active_profiles([b.Process(1, 0, ['bash', '-c', 'run.sh --profile qa search'], '')]) == (set(), set())


def test_privacy_database_no_cards_dedup_and_aliases(office, tmp_path):
    b.bootstrap(office)
    for profile in ['qa', 'client_SECRET_CLIENT', 'client_SECOND_CLIENT', 'qa-dev', 'marina-dev']:
        fixture(tmp_path, profile)
    counts = b.sync_routine(office, tmp_path, [])
    assert counts['events'] == 10 and counts['tasks'] == 0
    assert b.sync_routine(office, tmp_path, []) == dict(statuses=0, events=0, tasks=0)
    assert not office.execute("SELECT 1 FROM tasks WHERE assigned_to='bridge-sharik'").fetchone()
    dump = '\n'.join(office.iterdump())
    for private in ['PRIVATE_COMPANY', 'https://private.invalid', 'TOKEN_SECRET', 'SECRET_', 'client_', 'qa-dev', 'marina-dev']:
        assert private not in dump
    for alias in ['основной', 'клиент 1', 'клиент 2', 'dev']:
        assert alias in dump
    assert office.execute("SELECT position_x FROM agents WHERE id='bridge-sharik'").fetchone()[0] > 750


def test_new_year_and_strict_lines(tmp_path):
    p = tmp_path/'log'
    p.write_text('31.12 23:59 start qa\n01.01 00:01 end qa rc=2\n01.01 00:02 end qa rc=0 https://secret\n')
    run = j.scheduled(p, 'qa', dt.datetime(2027, 1, 1, 12, tzinfo=j.TZ))[0]
    assert run.start.year == 2026 and run.end.year == 2027 and run.rc == 2
