"""Read-only quota observation. Only numbers/booleans leave this module.

Sources are never modified. File caches contain projections, never message text.
Reverse reads tolerate an unfinished JSONL tail and stop at the latest event.
"""
from __future__ import annotations
import datetime as dt
import json
import hashlib
import math
from pathlib import Path
import re
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def epoch(value):
    try:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            value = float(value)
            return value if math.isfinite(value) and 0 < value < 32503680000 else None
        parsed = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return parsed.timestamp()
    except (ValueError, TypeError, OverflowError, OSError):
        return None


def rate_event(record, fallback=0):
    if not isinstance(record, dict):
        return None
    payload = record.get('payload', record)
    if not isinstance(payload, dict):
        return None
    # Ignore message contents/tool outputs quoting a quota event.
    if 'payload' in record and (record.get('type') != 'event_msg' or payload.get('type') != 'token_count'):
        return None
    limits = payload.get('rate_limits')
    if not isinstance(limits, dict):
        return None
    windows = []
    for name in ('primary', 'secondary'):
        window = limits.get(name)
        if not isinstance(window, dict):
            continue
        used, reset = window.get('used_percent'), epoch(window.get('resets_at'))
        if type(used) in (int, float) and math.isfinite(used) and used >= 0 and reset:
            windows.append({'usedPercent': used, 'resetsAt': reset})
    if not windows:
        return None
    return {'observedAt': epoch(record.get('timestamp')) or fallback, 'windows': windows}


def parse_rate_limits(text, fallback=0):
    events = []
    for line in text.splitlines():
        try:
            event = rate_event(json.loads(line), fallback)
            if event:
                events.append(event)
        except (ValueError, TypeError):
            continue
    return max(events, key=lambda e: e['observedAt'], default=None)


LIMIT = re.compile(r"(?:usage[ _-]?limit|rate[ _-]?limit|limit (?:has been )?reached|hit your (?:\w+ )?limit|out of extra usage|\b429\b)", re.I)
NOTICE = re.compile(r"^(?:you(?:['’]ve| have) (?:hit|reached)|usage limit|rate limit|limit reached|claude (?:usage )?limit|you(?:['’]re| are) out of extra usage)", re.I)


def reset_time(text, observed):
    """ISO/epoch, relative durations, Claude 6pm (Europe/Moscow), Nov 4 at 6pm.

    A clock without a date is tied to the original event day; it never slides
    forward on subsequent polls. Missing/ambiguous resets remain unknown.
    """
    marker = re.search(r'(?:reset(?:s|ting)?(?:_at)?|try again(?: at| in)?|retry(?: after| at| in)?|available (?:at|in))\s*[:=]?\s*(.+)', text, re.I)
    if not marker:
        return None
    value = re.sub(r'^(?:at|in|on)\s+', '', marker[1].strip(), flags=re.I)
    iso = re.search(r'\b(20\d\d-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)?)', value)
    if iso:
        return epoch(iso[1])
    unix = re.match(r'(\d{10})(?!\d)', value)
    if unix:
        return epoch(int(unix[1]))
    duration = re.match(r'(?:(\d+)\s*(?:d(?:ays?)?)\s*)?(?:(\d+)\s*(?:h(?:ours?|rs?)?)\s*)?(?:(\d+)\s*(?:m(?:in(?:ute)?s?)?)\s*)?(?:(\d+)\s*(?:s(?:ec(?:ond)?s?)?)\s*)?', value, re.I)
    if duration and any(duration.groups()):
        return observed + sum(int(n or 0)*unit for n, unit in zip(duration.groups(), (86400,3600,60,1)))
    tz_match = re.search(r'\(([A-Za-z_]+/[A-Za-z_+/-]+|UTC)\)', value)
    try:
        zone = ZoneInfo(tz_match[1]) if tz_match else dt.datetime.now().astimezone().tzinfo
    except ZoneInfoNotFoundError:
        return None
    base = dt.datetime.fromtimestamp(observed, zone)
    clock = re.search(r'\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(\d{1,2}):(\d{2})\b', value, re.I)
    if not clock:
        return None
    hour = int(clock[1] or clock[4]); minute = int(clock[2] or clock[5] or 0)
    if clock[3]:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if clock[3].lower() == 'pm' else 0)
    if hour > 23 or minute > 59:
        return None
    date = re.search(r'\b(\d{1,2})[./](\d{1,2})(?:[./](20\d\d))?\b', value)
    month = re.search(r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:,?\s+(20\d\d))?', value, re.I)
    try:
        if date:
            target = base.replace(year=int(date[3] or base.year), month=int(date[2]), day=int(date[1]), hour=hour, minute=minute, second=0, microsecond=0)
        elif month:
            num = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].index(month[1].lower())+1
            target = base.replace(year=int(month[3] or base.year), month=num, day=int(month[2]), hour=hour, minute=minute, second=0, microsecond=0)
        else:
            target = base.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if target.timestamp() <= observed:
                target += dt.timedelta(days=1)
        return target.timestamp()
    except ValueError:
        return None


def parse_limit_error(text, observed, fallback_reset=None):
    """Actual terminal/exec errors only. Never match prompts, code, or quotations."""
    latest = None
    for line in text.splitlines():
        line = re.sub(r'\x1b\[[0-9;]*m', '', line).strip()
        message = None
        try:
            row = json.loads(line)
            if isinstance(row, dict):
                if row.get('type') == 'error':
                    message = row.get('message')
                elif row.get('type') == 'turn.failed':
                    error = row.get('error', {})
                    message = error.get('message') if isinstance(error, dict) else error
        except ValueError:
            # A terminal timestamp is optional, ERROR must precede prose.
            cleaned = re.sub(r'^\[?\d{4}-\d\d-\d\d[T ][\d:.]+(?:Z|[+-]\d\d:\d\d)?\]?\s*', '', line)
            if re.match(r'^(?:ERROR(?:\s+(?![=(])|:)|(?i:API Error:|error:))', cleaned) or NOTICE.match(cleaned):
                message = cleaned
        if not isinstance(message, str) or not LIMIT.search(message):
            continue
        line_stamp = re.match(r'^\[?(20\d\d-\d\d-\d\d[T ][\d:.]+(?:Z|[+-]\d\d:\d\d))', line)
        when = epoch(line_stamp[1]) if line_stamp else observed
        reset = reset_time(message, when) or fallback_reset
        if re.search(r'\b429\b', message) and not re.search(r'usage[ _-]?limit|rate[ _-]?limit', message, re.I) and reset is None:
            continue
        latest = {'observedAt': when, 'blocked': True, 'resetsAt': reset}
    return latest


def claude_event(record, fallback=0):
    if not isinstance(record, dict) or record.get('type') not in ('assistant', 'system'):
        return None
    when = epoch(record.get('timestamp')) or fallback
    msg = record.get('message', {})
    content = msg.get('content', []) if isinstance(msg, dict) else []
    text = content if isinstance(content, str) else '\n'.join(c.get('text', '') for c in content if isinstance(c, dict) and c.get('type') == 'text')
    text = text.strip()
    error = record.get('error')
    if record.get('type') == 'system' and record.get('subtype') == 'api_error' and isinstance(error, dict):
        text = error.get('message', '')
        error = error.get('type')
    is_error = record.get('isApiErrorMessage') or error in ('rate_limit', 'rate_limit_error', 'usage_limit')
    if (is_error or NOTICE.match(text)) and LIMIT.search(text):
        return {'observedAt': when, 'blocked': True, 'resetsAt': reset_time(text, when)}
    # An actual successful assistant response supersedes a prior quota error.
    if record.get('type') == 'assistant' and not is_error and isinstance(msg, dict) and msg.get('stop_reason') in ('end_turn', 'tool_use', 'stop_sequence'):
        return {'observedAt': when, 'blocked': False, 'resetsAt': None}
    return None


def reverse_lines(path, with_offsets=False):
    with path.open('rb') as stream:
        stream.seek(0, 2)
        position, pending = stream.tell(), b''
        while position:
            count = min(position, 65536)
            position -= count; stream.seek(position)
            data = stream.read(count) + pending
            pieces = data.split(b'\n')
            pending = pieces[0]
            cursor = position + len(data) + 1
            for line in reversed(pieces[1:]):
                cursor -= len(line) + 1
                if line:
                    decoded = line.decode(errors='replace')
                    yield (decoded, cursor) if with_offsets else decoded
        if pending:
            decoded = pending.decode(errors='replace')
            yield (decoded, 0) if with_offsets else decoded


class LimitObserver:
    def __init__(self):
        self.cache = {}

    def latest(self, paths, parser):
        files = []
        for path in paths:
            try:
                stat = path.stat()
                if path.is_file():
                    files.append((stat.st_mtime, path, stat))
            except OSError:
                continue
        latest = None
        for modified, path, stat in sorted(files, key=lambda x: x[0], reverse=True):
            if latest and modified < latest['observedAt']:
                break
            key = (str(path), parser.__name__)
            identity = (stat.st_ino, stat.st_size, stat.st_mtime_ns)
            cached = self.cache.get(key)
            if cached and cached[0] == identity:
                result = cached[1]
                fingerprint = cached[2]
            else:
                result = None
                fingerprint = None
                try:
                    for line, offset in reverse_lines(path, with_offsets=True):
                        try:
                            result = parser(line, modified)
                        except (ValueError, TypeError, AttributeError):
                            continue
                        if result:
                            fingerprint = (offset, hashlib.sha256(line.encode()).hexdigest())
                            # Appending unrelated output must not move a relative reset
                            # to tomorrow; the original notice remains the same event.
                            if cached and cached[0][0] == stat.st_ino and cached[2] == fingerprint:
                                result = cached[1]
                            break
                except OSError:
                    pass
                self.cache[key] = (identity, result, fingerprint)
            if result and (latest is None or result['observedAt'] > latest['observedAt']):
                latest = result
        # Rotation/deletion must not grow memory forever.
        present = {str(p) for _, p, _ in files}
        self.cache = {k: v for k, v in self.cache.items() if k[1] != parser.__name__ or k[0] in present}
        return latest

    def observe(self, home, work, now=None):
        now = time.time() if now is None else now
        rate = self.latest((home / '.codex/sessions').rglob('*.jsonl'), lambda_rate)
        windows = rate['windows'] if rate else []
        # Only our exec output logs, never unrelated application logs.
        logs = list((work / 'office-bridge').glob('*.log')) + list((work / 'dcm-qa/fixes').rglob('*.log'))
        error = self.latest(logs, lambda_error)
        if error and rate and error['observedAt'] < rate['observedAt']:
            error = None  # a newer quota sample proves the old exec failure recovered
        if error and error['resetsAt'] is None:
            applicable = [w for w in windows if w['resetsAt'] > error['observedAt']]
            blocking = [w for w in applicable if w['usedPercent'] >= 100]
            fallback = max((w['resetsAt'] for w in (blocking or applicable)), default=None)
            error = {**error, 'resetsAt': fallback}
        claude = self.latest((home / '.claude/projects').rglob('*.jsonl'), lambda_claude)
        return {'codex': {'windows': windows, 'error': public_error(error, now)},
                'claude': {'windows': [], 'error': public_error(claude, now)}}


def public_error(error, now):
    if not error or not error['blocked'] or (error['resetsAt'] is not None and error['resetsAt'] <= now):
        return None
    return {'blocked': True, 'resetsAt': error['resetsAt']}


def lambda_rate(line, modified):
    if '"rate_limits"' not in line:
        return None
    return rate_event(json.loads(line), modified)


def lambda_claude(line, modified):
    return claude_event(json.loads(line), modified)


def lambda_error(line, modified):
    if not LIMIT.search(line):
        return None
    return parse_limit_error(line, modified)


observer = LimitObserver()
