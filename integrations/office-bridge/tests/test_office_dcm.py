import datetime as dt
import json
import os
import pytest
from office_dcm import Observer, parse_bugs, parse_regression


def epoch(text):
    return dt.datetime.fromisoformat(text).astimezone().timestamp()


def test_real_headings_deduplicated_and_fences_features_references_ignored():
    count, titles = parse_bugs('''# Bugs
### B1 · major · Окно молчит при ошибке
B2 reference
### F2 · feature · Функция
```
### B99 · major · Пример
```
### B1 · minor · Повтор
### B40: Кнопки перекрывают меню
''')
    assert count == 2
    assert titles == ['🐞 B1: Окно молчит при ошибке', '🐞 B40: Кнопки перекрывают меню']


@pytest.mark.parametrize('private', ['/home/q/private.txt', 'C:\\Users\\q', 'https://example.org/user',
    'Почта user@example.org', 'Позвонить +7 (999) 123-45-67', 'Марина: личная запись',
    'Ошибка для Петра', '`private.json`', '[private](path)', '<script>secret</script>', 'token=secret'])
def test_private_titles_count_but_never_publish(private):
    assert parse_bugs(f'### B1 · minor · {private}') == (1, [])


def test_cache_five_minutes_and_no_source_mutation(tmp_path):
    root = tmp_path/'dcm-local'
    root.mkdir()
    source = root/'BACKLOG.md'
    source.write_text('### B1 · ux · Не открывается окно')
    observer = Observer()
    first = observer.observe(tmp_path, now=1000, monotonic=0)
    assert first['bugCount'] == 1
    source.write_text('### B1 · ux · Не открывается окно\n### B2: Ошибка меню')
    before = source.read_bytes(), source.stat().st_mtime_ns
    assert observer.observe(tmp_path, now=1001, monotonic=299)['bugCount'] == 1
    assert observer.observe(tmp_path, now=1300, monotonic=300)['bugCount'] == 2
    assert (source.read_bytes(), source.stat().st_mtime_ns) == before
    assert set(first) == {'bugCount', 'bugTitle', 'regression'}


def test_missing_malformed_and_missing_cache_recovery(tmp_path):
    observer = Observer()
    result = observer.observe(tmp_path, now=100, monotonic=1)
    assert result == {'bugCount': None, 'bugTitle': None, 'regression': {'status':'unknown','timestamp':None,'fresh':False,'recordId':None,'green':False,'new':False}}
    root = tmp_path/'dcm-local'
    root.mkdir()
    source = root/'BACKLOG.md'
    source.write_bytes(b'\xff')
    assert observer.observe(tmp_path, now=100, monotonic=301)['bugCount'] is None
    source.write_text('No bug headings')
    assert observer.observe(tmp_path, now=100, monotonic=601)['bugCount'] == 0


@pytest.mark.parametrize('line,status', [('регрессия RESULT True /private','pass'),
    ('регрессия RESULT False /private','fail'), ('регрессия ЗЕЛЁНАЯ (старый FAIL)','pass'),
    ('regression FAIL','fail'), ('регрессия красная','fail')])
def test_latest_result_and_freshness(line, status):
    now = epoch('2026-11-01T20:00:00')
    result = parse_regression(f'19:50:00 {line}\n19:59:00 старт F2', now, now)
    assert result['status'] == status
    assert result['fresh'] is True
    assert result['timestamp'] == dt.datetime.fromtimestamp(epoch('2026-11-01T19:50:00'), dt.timezone.utc).isoformat()
    assert '/private' not in json.dumps(result)
    assert parse_regression(f'19:29:59 {line}', now, now)['fresh'] is False
    assert parse_regression(f'19:30:00 {line}', now, now)['fresh'] is True


def test_rollover_future_missing_timestamps_and_explicit_iso():
    now = epoch('2026-11-02T00:05:00')
    assert parse_regression('23:58:00 регрессия FAIL\n00:04:00 работа', now, now)['fresh']
    assert not parse_regression('2026-11-02T10:00:00+00:00 regression FAIL', now, now)['fresh']
    assert parse_regression('регрессия RESULT False', now, now) == {'status':'fail','timestamp':None,'fresh':False}
    assert parse_regression('00:04:00 регрессия на воркере', now, now)['status'] == 'unknown'
    assert parse_regression('99:99:00 regression FAIL', now, now)['status'] == 'unknown'


def test_observer_reads_actual_pipeline_location_and_does_not_cache_regression(tmp_path):
    pipeline = tmp_path/'dcm-qa/fixes/pipeline.log'
    pipeline.parent.mkdir(parents=True)
    now = epoch('2026-11-01T20:00:00')
    observer = Observer()
    pipeline.write_text('19:50:00 регрессия RESULT False /private\n')
    os.utime(pipeline, (now, now))
    before = pipeline.read_bytes(), pipeline.stat().st_mtime_ns
    assert observer.observe(tmp_path, now=now, monotonic=0)['regression']['status'] == 'fail'
    assert (pipeline.read_bytes(), pipeline.stat().st_mtime_ns) == before
    pipeline.write_text('19:59:00 регрессия RESULT True\n')
    os.utime(pipeline, (now, now))
    assert observer.observe(tmp_path, now=now, monotonic=1)['regression']['status'] == 'pass'
    assert not observer.observe(tmp_path, now=now+1900, monotonic=2)['regression']['fresh']


def test_boot_baseline_new_green_identity_and_safe_repeat_polls(tmp_path):
    pipeline = tmp_path/'dcm-qa/fixes/pipeline.log'
    pipeline.parent.mkdir(parents=True)
    now = epoch('2026-11-01T20:00:00')
    private = '/private/client@example.org token=secret'
    line = f'19:59:00 регрессия F2 ЗЕЛЁНАЯ {private}\n'
    pipeline.write_text(line)
    os.utime(pipeline, (now, now))
    observer = Observer()
    def read():
        return observer.observe(tmp_path, now=now, monotonic=0)['regression']
    baseline = read()
    assert baseline['fresh'] and baseline['green'] and not baseline['new']
    assert read() == baseline
    # Identical timestamps and text are separate records when appended.
    with pipeline.open('a') as stream:
        stream.write(line)
    os.utime(pipeline, (now, now))
    event = read()
    assert event['new'] and event['green'] and event['fresh']
    assert event['recordId'] != baseline['recordId']
    assert len(event['recordId']) == 24 and int(event['recordId'], 16) >= 0
    assert read() == event
    assert not Observer().observe(tmp_path, now=now, monotonic=0)['regression']['new']
    assert set(event) == {'status', 'timestamp', 'fresh', 'recordId', 'green', 'new'}
    assert private not in json.dumps(event) and 'secret' not in json.dumps(event)


@pytest.mark.parametrize('verdict,green,status', [
    ('регрессия RESULT True', False, 'pass'), ('regression PASS', False, 'pass'),
    ('регрессия зелёная', True, 'pass'), ('регрессия ЗЕЛЕНАЯ (старый FAIL)', True, 'pass'),
    ('регрессия КРАСНАЯ', False, 'fail'), ('регрессия RESULT False ЗЕЛЁНАЯ', False, 'fail'),
])
def test_only_explicit_russian_green_can_trigger_pizza(tmp_path, verdict, green, status):
    observer = Observer()
    observer.observe(tmp_path, now=0, monotonic=0)  # Source absent at boot.
    pipeline = tmp_path/'dcm-qa/fixes/pipeline.log'
    pipeline.parent.mkdir(parents=True)
    now = epoch('2026-11-01T20:00:00')
    pipeline.write_text(f'19:59:00 {verdict}\n')
    os.utime(pipeline, (now, now))
    signal = observer.observe(tmp_path, now=now, monotonic=1)['regression']
    assert (signal['status'], signal['green'], signal['new']) == (status, green, True)
    stale = observer.observe(tmp_path, now=now+1900, monotonic=2)['regression']
    assert stale['status'] == status and not stale['fresh'] and not stale['new']


def test_partial_appends_and_non_regression_lines_do_not_create_events(tmp_path):
    pipeline = tmp_path/'dcm-qa/fixes/pipeline.log'
    pipeline.parent.mkdir(parents=True)
    now = epoch('2026-11-01T20:00:00')
    observer = Observer()
    pipeline.write_text('19:58:00 регрессия КРАСНАЯ\n')
    os.utime(pipeline, (now, now))
    baseline = observer.observe(tmp_path, now=now, monotonic=0)['regression']
    with pipeline.open('a') as stream:
        stream.write('19:59:00 регрессия ЗЕЛЁНАЯ')
    os.utime(pipeline, (now, now))
    assert observer.observe(tmp_path, now=now, monotonic=1)['regression'] == baseline
    with pipeline.open('a') as stream:
        stream.write('\n19:59:30 старт F2\n')
    os.utime(pipeline, (now, now))
    green = observer.observe(tmp_path, now=now, monotonic=2)['regression']
    assert green['new'] and green['green'] and green['recordId'] != baseline['recordId']
    with pipeline.open('a') as stream:
        stream.write('20:00:00 работа\n')
    os.utime(pipeline, (now, now))
    assert observer.observe(tmp_path, now=now, monotonic=3)['regression'] == green


def test_rotation_changes_record_identity_without_replaying_missing_source(tmp_path):
    pipeline = tmp_path/'dcm-qa/fixes/pipeline.log'
    pipeline.parent.mkdir(parents=True)
    now = epoch('2026-11-01T20:00:00')
    line = '19:59:00 регрессия ЗЕЛЁНАЯ\n'
    pipeline.write_text(line)
    os.utime(pipeline, (now, now))
    observer = Observer()
    first = observer.observe(tmp_path, now=now, monotonic=0)['regression']
    rotated = pipeline.with_suffix('.old')
    pipeline.rename(rotated)
    assert observer.observe(tmp_path, now=now, monotonic=1)['regression']['status'] == 'unknown'
    rotated.rename(pipeline)
    assert observer.observe(tmp_path, now=now, monotonic=2)['regression'] == first
    pipeline.rename(rotated)
    pipeline.write_text(line)
    os.utime(pipeline, (now, now))
    next_record = observer.observe(tmp_path, now=now, monotonic=3)['regression']
    assert next_record['recordId'] != first['recordId'] and next_record['new']


def test_tick_publishes_validated_signal_and_motya_uses_same_verdict(office, tmp_path, monkeypatch):
    import bridge as b
    b.bootstrap(office)
    monkeypatch.setattr(b, 'processes', lambda: [])
    monkeypatch.setattr(b, 'run_readonly', lambda *args, **kwargs: '')
    monkeypatch.setattr(b, 'notify', lambda *args: None)
    monkeypatch.setattr(b, 'dcm_observer', Observer())
    pipeline = tmp_path/'dcm-qa/fixes/pipeline.log'
    pipeline.parent.mkdir(parents=True)
    now = dt.datetime.now().astimezone().isoformat()
    pipeline.write_text(f'{now} регрессия КРАСНАЯ\n')
    b.tick(office, tmp_path, '')
    first = b.get_state(office, 'office17:public')['regression']
    assert first['status'] == 'fail' and not first['new']
    # An incidental historical FAIL must not turn the explicit green red.
    with pipeline.open('a') as stream:
        stream.write(f'{now} регрессия ЗЕЛЁНАЯ (старый FAIL)\n')
    b.tick(office, tmp_path, '')
    published = b.get_state(office, 'office17:public')['regression']
    assert published['status'] == 'pass' and published['green'] and published['new']
    assert published['recordId'] != first['recordId']
    status = office.execute("SELECT status_text FROM agent_status_history WHERE agent_id='bridge-motya' AND ended_at IS NULL").fetchone()[0]
    assert status.endswith('Последняя регрессия: зелёная')
