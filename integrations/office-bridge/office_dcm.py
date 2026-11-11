"""Small read-only, public DCM signals; raw source text never leaves this module."""
from __future__ import annotations

import datetime as dt
import hashlib
import os
from pathlib import Path
import random
import re
import time

CACHE_SECONDS = 300
FRESH_SECONDS = 1800
HEADING = re.compile(r'^\s{0,3}#{1,6}\s+B(\d+)\s*(?:[·:—-]\s*)(.+?)\s*#*\s*$')
SEVERITY = re.compile(r'^(?:critical|blocker|major|minor|ux|low|medium|high)\s*[·:—-]\s*', re.I)
# Fail closed on source titles with locations, contacts, account data, or person names.
PRIVATE = re.compile(r'https?://|www\.|[/\\]|@|\b(?:\d[\s()+-]*){7,}\b|\b(?:[\w-]+\.)+(?:ru|com|org|net|io)\b|\b(?:password|token|secret|пароль\s*[:=]|телефон\s*[:=]|логин\s*[:=])\b|\b(?:Евгений|Евгения|Александр|Александра|Марина|Иван|Ивана|Алексей|Михаил|Сергей|Дмитрий|Наталья|Ольга|Анна|Ирина|Елена|Петров|Иванов|Сидоров)\b|\b[A-ZА-ЯЁ]\.[A-ZА-ЯЁ]\.', re.I)
CLOCK = re.compile(r'^(\d\d):(\d\d):(\d\d)\s+')
ISO = re.compile(r'^\[?(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?)\]?\s+')


def safe_title(title: str) -> str | None:
    title = SEVERITY.sub('', title).strip()
    if not title or len(title) > 240 or PRIVATE.search(title):
        return None
    # Markdown/code, control characters and arbitrary markup are never public.
    if any(ord(c) < 32 for c in title) or re.search(r'[`<>\[\]{}]', title):
        return None
    if re.search(r'(?<=\s)[А-ЯЁ][а-яё]{2,}\b', title):
        return None
    return title


def parse_bugs(text: str) -> tuple[int, list[str]]:
    """Count unique real B headings, excluding references, feature IDs and fences."""
    bugs: dict[str, str | None] = {}
    fence = None
    for line in text.splitlines():
        marker = re.match(r'^\s*(`{3,}|~{3,})', line)
        if marker:
            char = marker[1][0]
            fence = None if fence == char else char if fence is None else fence
            continue
        if fence:
            continue
        match = HEADING.match(line)
        if match:
            code = 'B' + str(int(match[1]))
            title = safe_title(match[2])
            bugs.setdefault(code, f'🐞 {code}: {title}' if title else None)
    return len(bugs), [title for title in bugs.values() if title]


def parse_regression(text: str, modified: float, now: float) -> dict:
    return _regression_record(text.splitlines(), modified, now)[0]


def _regression_record(lines: list[str], modified: float, now: float) -> tuple[dict, int | None]:
    """Reconstruct undated pipeline clocks backwards from its file date (local time)."""
    result = {'status': 'unknown', 'timestamp': None, 'fresh': False}
    anchor = dt.datetime.fromtimestamp(modified).astimezone()
    for index in range(len(lines) - 1, -1, -1):
        line = lines[index]
        iso, clock = ISO.match(line), CLOCK.match(line)
        stamp = None
        try:
            if iso:
                stamp = dt.datetime.fromisoformat(iso[1].replace('Z', '+00:00'))
                if stamp.tzinfo is None:
                    stamp = stamp.replace(tzinfo=anchor.tzinfo)
                anchor = stamp
            elif clock:
                stamp = anchor.replace(hour=int(clock[1]), minute=int(clock[2]), second=int(clock[3]), microsecond=0)
                if stamp > anchor:
                    stamp -= dt.timedelta(days=1)
                anchor = stamp
        except ValueError:
            continue
        if not re.search(r'регресс|regression', line, re.I):
            continue
        # Explicit result / colour wins over incidental mention of an earlier FAIL.
        explicit = re.search(r'RESULT\s+(True|False)', line, re.I)
        colour = re.search(r'зел[её]н\w*|красн\w*', line, re.I)
        status = ('pass' if explicit[1].lower() == 'true' else 'fail') if explicit else (
            'pass' if re.match(r'зел', colour[0], re.I) else 'fail') if colour else None
        if status is None:
            verdict = re.search(r'\b(PASS|FAIL)\b', line, re.I)
            status = verdict[1].lower() if verdict else None
        if status:
            result['status'] = status
            if stamp:
                result['timestamp'] = stamp.astimezone(dt.timezone.utc).isoformat()
                result['fresh'] = 0 <= now - stamp.timestamp() <= FRESH_SECONDS
            return result, index
    return result, None


class Observer:
    def __init__(self):
        self._cache: dict[Path, tuple[float, int | None, list[str]]] = {}
        # Baseline each source at process boot: an existing green is not an event.
        # Keep eligibility for repeated polls so clients cannot miss a one-tick pulse.
        self._seen: dict[Path, tuple[str | None, bool]] = {}

    def observe(self, work: Path, *, now: float | None = None, monotonic: float | None = None) -> dict:
        now = time.time() if now is None else now
        monotonic = time.monotonic() if monotonic is None else monotonic
        backlog = work / 'dcm-local/BACKLOG.md'
        cached = self._cache.get(backlog)
        if cached is None or not 0 <= monotonic - cached[0] < CACHE_SECONDS:
            try:
                count, titles = parse_bugs(backlog.read_text(encoding='utf-8'))
            except (OSError, UnicodeError):
                count, titles = None, []
            cached = (monotonic, count, titles)
            self._cache[backlog] = cached
        regression = {'status': 'unknown', 'timestamp': None, 'fresh': False,
                      'recordId': None, 'green': False, 'new': False}
        pipeline = work / 'dcm-qa/fixes/pipeline.log'
        try:
            # Bound observer work and avoid loading historical raw logs into memory.
            with pipeline.open('rb') as source:
                stat = os.fstat(source.fileno())
                end = stat.st_size
                source.seek(max(0, end - 512 * 1024))
                if end > 512 * 1024:
                    source.readline()
                start = source.tell()
                data = source.read(max(0, end - start))
            lines, ends, offset = [], [], start
            for raw in data.splitlines(keepends=True):
                offset += len(raw)
                if not raw.endswith(b'\n'):
                    break  # A writer may still be appending the verdict.
                lines.append(raw.decode('utf-8', errors='replace').rstrip('\r\n'))
                ends.append(offset)
            parsed, index = _regression_record(lines, stat.st_mtime, now)
            regression.update(parsed)
            if index is not None:
                line = lines[index]
                token = f'{stat.st_dev}:{stat.st_ino}:{ends[index]}:{line}'
                record_id = hashlib.sha256(token.encode()).hexdigest()[:24]
                previous = self._seen.get(pipeline)
                is_new = False
                if previous is not None:
                    is_new = previous[1] if previous[0] == record_id else parsed['fresh']
                self._seen[pipeline] = (record_id, is_new)
                regression.update(recordId=record_id,
                                  green=parsed['status'] == 'pass' and bool(re.search(r'регрессия\b.*\bЗЕЛ[ЕЁ]НАЯ\b', line, re.I)),
                                  new=is_new and parsed['fresh'])
        except OSError:
            pass
        self._seen.setdefault(pipeline, (None, False))
        return {'bugCount': cached[1], 'bugTitle': random.choice(cached[2]) if cached[2] else None,
                'regression': regression}


observer = Observer()
