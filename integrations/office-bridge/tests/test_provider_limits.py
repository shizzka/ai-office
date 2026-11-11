import datetime as dt
import json
import os
from pathlib import Path
import time

import pytest
from provider_limits import (LimitObserver, claude_event, epoch, parse_limit_error,
                             parse_rate_limits, public_error, reset_time)

NOW = epoch('2026-11-01T15:00:00Z')
RESET = epoch('2026-11-04T15:40:00Z')


def rate(percent=90, when='2026-11-01T15:00:00Z', primary=True):
    return {'timestamp': when, 'type': 'event_msg', 'payload': {'type': 'token_count', 'rate_limits': {
        'primary' if primary else 'secondary': {'used_percent': percent, 'window_minutes': 10080, 'resets_at': RESET}}}}


def transcript(text, **extra):
    return {'timestamp': '2026-11-01T15:00:00Z', 'type': 'assistant', 'isApiErrorMessage': True,
            'message': {'content': [{'type': 'text', 'text': text}]}, **extra}


def test_jsonl_truncated_lines_and_newest_timestamp():
    lines = [rate(99, '2026-11-01T14:00:00Z'), rate(100), rate(88, '2026-11-01T13:00:00Z')]
    text = '{broken}\n' + '\n'.join(map(json.dumps, lines)) + '\n{"payload":{"rate_limits":'
    assert parse_rate_limits(text)['windows'][0]['usedPercent'] == 100
    assert parse_rate_limits('{truncated') is None
    assert parse_rate_limits(json.dumps({'type': 'response_item', 'payload': rate()['payload']})) is None


@pytest.mark.parametrize('percent', [89, 89.99, 90, 100, 101])
@pytest.mark.parametrize('primary', [True, False])
def test_window_projections(percent, primary):
    assert parse_rate_limits(json.dumps(rate(percent, primary=primary)))['windows'] == [{'usedPercent': percent, 'resetsAt': RESET}]


@pytest.mark.parametrize('value', [None, '100', True, float('nan'), -1])
def test_invalid_percent(value):
    assert parse_rate_limits(json.dumps(rate(value))) is None


@pytest.mark.parametrize('line', [
    "ERROR: You've hit your usage limit. Try again at 2026-11-04T15:40:00Z",
    '2026-11-01T15:00:00Z ERROR codex: rate limit reached; resets_at: 1793806800',
    'API Error: HTTP 429 Too Many Requests; retry after 2h 30m',
    json.dumps({'type': 'error', 'message': 'Usage limit reached, resets 2026-11-04T15:40:00Z'}),
    json.dumps({'type': 'turn.failed', 'error': {'message': 'Rate limit reached, try again at 2026-11-04T15:40:00Z'}}),
])
def test_exec_limit_errors(line):
    result = parse_limit_error(line, NOW)
    assert result['blocked'] is True and result['resetsAt'] > NOW


@pytest.mark.parametrize('line', [
    'Please implement usage limit reached support, resets 2026-11-04T15:40:00Z',
    'const error = "Usage limit reached";',
    json.dumps({'type': 'item.completed', 'item': {'text': 'ERROR usage limit reached resets 6pm'}}),
    'Error: unexpected response 429',
    "error = parse_limit_error('ERROR: usage limit reached', NOW, RESET)",
])
def test_quotations_and_unrelated_429_do_not_trigger(line):
    assert parse_limit_error(line, NOW) is None


@pytest.mark.parametrize('text,expected', [
    ("You've hit your limit · resets 6pm (Europe/Moscow)", '2026-11-02T15:00:00Z'),
    ('Usage limit reached, resets Nov 4 at 6:40pm (Europe/Moscow)', '2026-11-04T15:40:00Z'),
    ('Limit reached. Resets 04.11.2026 18:40 (Europe/Moscow)', '2026-11-04T15:40:00Z'),
    ('You have reached your usage limit. Try again at 2026-11-04T15:40:00Z', '2026-11-04T15:40:00Z'),
    ('Rate limit reached. Resets in 2h 30m', '2026-11-01T17:30:00Z'),
    ("You're out of extra usage · resets 2026-11-04T15:40:00Z", '2026-11-04T15:40:00Z'),
])
def test_claude_variants(text, expected):
    result = claude_event(transcript(text))
    assert result == {'observedAt': NOW, 'blocked': True, 'resetsAt': epoch(expected)}


def test_claude_system_error_success_and_message_quotes():
    error = {'type': 'system', 'subtype': 'api_error', 'timestamp': '2026-11-01T15:00:00Z',
             'error': {'type': 'rate_limit_error', 'message': 'Rate limit reached, resets in 1h'}}
    assert claude_event(error)['resetsAt'] == NOW + 3600
    assert claude_event(transcript('The log contained usage limit reached.', isApiErrorMessage=False)) is None
    success = transcript('Finished', isApiErrorMessage=False)
    success['message']['stop_reason'] = 'end_turn'
    assert claude_event(success)['blocked'] is False
    assert claude_event({'type': 'user', 'message': error}) is None


def test_unknown_and_expired_resets():
    error = parse_limit_error('ERROR: usage limit reached', NOW, RESET)
    assert public_error(error, RESET) is None
    assert public_error(error, RESET-1)['blocked'] is True
    assert parse_limit_error('ERROR: usage limit reached', NOW)['resetsAt'] is None
    assert reset_time('limit reached resets gibberish', NOW) is None
    assert reset_time('limit reached resets 35:99', NOW) is None


def test_observer_latest_file_expiry_append_rotation_and_safe_projection(tmp_path):
    home, work = tmp_path/'home', tmp_path/'work'
    sessions = home/'.codex/sessions'; sessions.mkdir(parents=True)
    logs = work/'office-bridge'; logs.mkdir(parents=True)
    claude = home/'.claude/projects'; claude.mkdir(parents=True)
    older, newer = sessions/'old.jsonl', sessions/'new.jsonl'
    older.write_text(json.dumps(rate(100, '2026-11-01T13:00:00Z'))+'\n')
    newer.write_text(json.dumps(rate())+'\n{"unfinished":')
    # File mtimes alone must not choose the older event.
    os.utime(older, (NOW+100, NOW+100)); os.utime(newer, (NOW+1, NOW+1))
    observer = LimitObserver()
    public = observer.observe(home, work, NOW)
    assert public['codex']['windows'][0]['usedPercent'] == 90
    assert public['codex']['error'] is None
    log = logs/'codex.log'
    log.write_text('ERROR: rate limit reached resets 2026-11-04T15:40:00Z\n')
    os.utime(log, (NOW+120, NOW+120))
    assert observer.observe(home, work, NOW)['codex']['error']['resetsAt'] == RESET
    assert observer.observe(home, work, RESET)['codex']['error'] is None
    newer.write_text(json.dumps(rate(30, '2026-11-01T16:00:00Z'))+'\n')
    os.utime(newer, (NOW+3600, NOW+3600))
    assert observer.observe(home, work, NOW)['codex']['error'] is None
    newer.unlink(); older.unlink()
    assert observer.observe(home, work, NOW)['codex']['windows'] == []
    (claude/'session.jsonl').write_text(json.dumps(transcript('Usage limit reached, resets in 1h'))+'\n')
    assert observer.observe(home, work, NOW)['claude']['error']['resetsAt'] == NOW+3600
    assert 'message' not in json.dumps(public) and 'token' not in json.dumps(public)


def test_appending_unrelated_output_does_not_slide_relative_reset(tmp_path):
    home, work = tmp_path/'home', tmp_path/'work'
    path = work/'office-bridge'/'codex.log'; path.parent.mkdir(parents=True)
    path.write_text('ERROR: usage limit reached, resets in 1h\n')
    os.utime(path, (NOW, NOW))
    observer = LimitObserver()
    assert observer.observe(home, work, NOW)['codex']['error']['resetsAt'] == NOW+3600
    with path.open('a') as stream:
        stream.write('process stopped\n')
    os.utime(path, (NOW+7200, NOW+7200))
    assert observer.observe(home, work, NOW+7200)['codex']['error'] is None

    # A repeated identical notice at a new byte offset is a new error.
    with path.open('a') as stream:
        stream.write('ERROR: usage limit reached, resets in 1h\n')
    os.utime(path, (NOW+7300, NOW+7300))
    assert observer.observe(home, work, NOW+7300)['codex']['error']['resetsAt'] == NOW+10900


def test_reverse_reader_keeps_offsets_across_utf8_chunk_boundaries(tmp_path):
    from provider_limits import reverse_lines
    path = tmp_path/'large.log'
    contents = ('я'*40000+'\nshort\nпоследняя').encode()
    path.write_bytes(contents)
    rows = list(reverse_lines(path, with_offsets=True))
    assert [text for text, offset in rows] == ['последняя', 'short', 'я'*40000]
    for text, offset in rows:
        assert contents[offset:offset+len(text.encode())] == text.encode()


def test_error_fallback_uses_exhausted_window_and_does_not_roll_to_another_window(tmp_path):
    home, work = tmp_path/'home', tmp_path/'work'
    session = home/'.codex/sessions'/'run.jsonl'; session.parent.mkdir(parents=True)
    record = rate(100)
    record['payload']['rate_limits']['primary']['resets_at'] = NOW+20
    record['payload']['rate_limits']['secondary'] = {'used_percent': 50, 'resets_at': NOW+200}
    session.write_text(json.dumps(record)+'\n'); os.utime(session, (NOW, NOW))
    log = work/'office-bridge'/'codex.log'; log.parent.mkdir(parents=True)
    log.write_text('ERROR: usage limit reached\n'); os.utime(log, (NOW+1, NOW+1))
    observer = LimitObserver()
    assert observer.observe(home, work, NOW+1)['codex']['error']['resetsAt'] == NOW+20
    assert observer.observe(home, work, NOW+50)['codex']['error'] is None
