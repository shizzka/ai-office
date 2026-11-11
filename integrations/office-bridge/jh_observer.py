"""Privacy boundary for routine JH runs. Reads logs/proc only; emits fixed prose/numbers.

Never return raw log records, filenames, profile IDs, run IDs, errors or payload text.
Analytics tails are bounded. Partial run evidence cannot produce invented zero counters.
"""
from __future__ import annotations
from dataclasses import dataclass, field
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Europe/Moscow')
SCHEDULE = re.compile(r'(\d{2}\.\d{2} \d{2}:\d{2}) (start|end) ([\w-]+)(?: rc=(\d+))?')
LIMIT = 32 * 1024 * 1024
_CACHE = {}


def stamp(value):
    try:
        result = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        return result.replace(tzinfo=TZ) if result.tzinfo is None else result.astimezone(TZ)
    except (ValueError, TypeError, AttributeError):
        return None


def integer(value):
    return value if type(value) is int and 0 <= value <= 10**9 else None


def tail_lines(path, limit=LIMIT):
    try:
        with path.open('rb') as stream:
            size = os.fstat(stream.fileno()).st_size
            stream.seek(max(0, size - limit))
            if size > limit:
                stream.readline()  # discard incomplete first record
            for raw in stream:
                if raw.endswith(b'\n'):
                    yield raw.decode(errors='replace').rstrip('\r\n')
    except OSError:
        return


@dataclass
class Run:
    start: dt.datetime | None
    end: dt.datetime | None = None
    rc: int | None = None
    metrics: dict = field(default_factory=dict)


def scheduled(path, profile, now):
    runs = []
    for line in tail_lines(path, 4 * 1024 * 1024):
        match = SCHEDULE.fullmatch(line)
        if not match or match[3] != profile or (match[2] == 'end') != (match[4] is not None):
            continue
        try:
            when = dt.datetime.strptime(f'{now.year} {match[1]}', '%Y %d.%m %H:%M').replace(tzinfo=TZ)
            if when > now + dt.timedelta(days=1):
                when = when.replace(year=now.year - 1)
        except ValueError:
            continue
        if match[2] == 'start':
            runs.append(Run(when))
        else:
            if not runs or runs[-1].end is not None:
                runs.append(Run(None))
            runs[-1].end, runs[-1].rc = when, int(match[4])
    return runs


def analytics(path, profile, shared=False):
    """Only fixed numeric projections survive parsing. Run IDs live in RAM only."""
    try:
        stat = path.stat()
        identity = (stat.st_ino, stat.st_size, stat.st_mtime_ns)
    except OSError:
        return {}
    cache_key = (str(path), profile, shared)
    if cache_key in _CACHE and _CACHE[cache_key][0] == identity:
        return _CACHE[cache_key][1]
    result = {}
    for line in tail_lines(path):
        try:
            r = json.loads(line)
        except ValueError:
            continue
        if not isinstance(r, dict) or (shared and r.get('profile_id') != profile):
            continue
        # A profile-scoped file is authoritative; profile_id may be an internal
        # account identifier unrelated to the directory name. Never expose it.
        key, event = r.get('run_id'), r.get('event')
        when = stamp(r.get('created_at'))
        if not isinstance(key, str) or not when or event not in ('search_started', 'search_finished', 'decision', 'application_result', 'stage_failed'):
            continue
        item = result.setdefault(key, {'start': None, 'end': None, 'metrics': {}, 'scored': set(), 'sent': set(), 'errors': set()})
        if event == 'search_started':
            item['start'] = when
        elif event == 'search_finished':
            item['end'] = when
            funnel = r.get('funnel') if isinstance(r.get('funnel'), dict) else {}
            for name, value in [('найдено', r.get('found')), ('оценено', funnel.get('evaluated')), ('откликов', r.get('applied'))]:
                if integer(value) is not None:
                    item['metrics'][name] = value
        elif event == 'decision' and r.get('evaluation_present') is True:
            item['scored'].add(str(r.get('vacancy_id'))) if r.get('vacancy_id') is not None else None
        elif event == 'application_result' and r.get('outcome') == 'sent':
            item['sent'].add(str(r.get('application_id'))) if r.get('application_id') is not None else None
        elif event == 'stage_failed':
            # Failure IDs deduplicate repeated observations of one failure.
            item['errors'].add(str(r.get('failure_id') or r.get('event_id') or when.isoformat()))
    for item in result.values():
        if item['start']:
            item['metrics'].setdefault('оценено', len(item['scored']))
            item['metrics'].setdefault('откликов', len(item['sent']))
            item['metrics']['ошибок этапов'] = len(item['errors'])
    # Keep only numbers/times in the cache, never raw identifiers/payloads.
    safe = {hashlib.sha256(key.encode()).hexdigest(): {
        'start': item['start'], 'end': item['end'], 'metrics': item['metrics']}
        for key, item in result.items()}
    if len(_CACHE) > 32:
        _CACHE.clear()
    _CACHE[cache_key] = (identity, safe)
    return safe


def active_profiles(procs):
    searches, daemons = set(), set()
    for p in procs:
        args = p.args
        # Executable/script position only: never recognize a shell command/prompt.
        executable = next((i for i in range(min(2, len(args))) if Path(args[i]).name in ('run.sh', 'bot-daemon')), None)
        if executable is None:
            known_module = any(a in ('job_hunter', 'job_hunter.cli', 'job_hunter.main') for a in args[:4])
            known_cwd = 'job-hunter' in Path(p.cwd).parts
            if not (args and Path(args[0]).name in ('python', 'python3', 'uv', 'job-hunter') and (known_module or known_cwd)):
                continue
            executable = 0
        args = args[executable:]
        profile = next((args[i+1] for i, a in enumerate(args[:-1]) if a == '--profile'), None)
        profile = profile or next((a.split('=', 1)[1] for a in args if a.startswith('--profile=')), None)
        if profile:
            if 'search' in args:
                searches.add(profile)
            if 'bot-daemon' in args or Path(args[0]).name == 'bot-daemon':
                daemons.add(profile)
    return searches, daemons


def locked_profiles(profiles, procs, lock_root=Path('/tmp'), locks=Path('/proc/locks')):
    """Observe kernel's held locks. Never open/acquire/create JH lock files."""
    pids = {p.pid for p in procs}
    held = set()
    try:
        for line in locks.read_text().splitlines():
            parts = line.split()
            if len(parts) >= 6 and parts[1] != '->' and parts[4].isdigit() and int(parts[4]) in pids:
                dev = parts[5].split(':')
                if len(dev) == 3:
                    held.add((int(dev[0], 16), int(dev[1], 16), int(dev[2])))
    except (OSError, ValueError):
        return set()
    active = set()
    for profile in profiles:
        try:
            s = (lock_root / f'jh-search-{profile}.lock').stat()
            if (os.major(s.st_dev), os.minor(s.st_dev), s.st_ino) in held:
                active.add(profile)
        except OSError:
            pass
    return active


def observe(root, procs, now=None, lock_root=Path('/tmp'), locks=Path('/proc/locks')):
    now = now or dt.datetime.now(TZ)
    try:
        profiles = sorted(p.name for p in (root / 'profiles').iterdir() if p.is_dir() and re.fullmatch(r'[\w-]+', p.name))
    except OSError:
        profiles = []
    searches, daemons = active_profiles(procs)
    searches |= locked_profiles(profiles, procs, lock_root, locks)
    clients = {p: f'клиент {i+1}' for i, p in enumerate(p for p in profiles if p.startswith('client_'))}
    aliases = {**clients, 'qa': 'основной', 'qa-dev': 'dev', 'marina-dev': 'dev'}
    events, summaries, active = [], [], []
    for profile in profiles:
        alias = aliases.get(profile)
        if not alias:
            continue  # no raw fallback for an unfamiliar profile
        runs = scheduled(root / 'profiles' / profile / 'scheduled-search.log', profile, now)
        data = analytics(root / 'profiles' / profile / 'analytics_events.jsonl', profile)
        if not data:
            # Shared analytics require an explicit matching profile_id.
            data = analytics(root / 'analytics_events.jsonl', profile, shared=True)
        for run in runs:
            if run.start:
                candidates = [a for a in data.values() if a['start'] and run.start <= a['start'] < run.start + dt.timedelta(minutes=2)
                              and (not run.end or a['start'] <= run.end + dt.timedelta(minutes=1))]
            else:
                candidates = [a for a in data.values() if a['end'] and run.end <= a['end'] < run.end + dt.timedelta(minutes=1)]
            if len(candidates) == 1:
                run.metrics = candidates[0]['metrics']
        def totals(run):
            return ', '.join(f'{key} {integer(value)}' for key, value in run.metrics.items() if integer(value) is not None)
        for run in runs:
            for phase, when in [('start', run.start), ('end', run.end)]:
                if when is None:
                    continue
                token = hashlib.sha256(f'{profile}:{phase}:{when}'.encode()).hexdigest()[:32]
                message = f'{"Старт" if phase == "start" else "Конец"} прогона · {alias} · {when:%d.%m %H:%M}'
                if phase == 'end':
                    message += f' · {"⚠ " if run.rc else ""}rc={run.rc}'
                    if totals(run):
                        message += '; ' + totals(run)
                events.append((token, message, when.astimezone(dt.timezone.utc).strftime('%Y-%m-%d %H:%M:%S')))
        last = runs[-1] if runs else None
        if profile in searches:
            text = f'Прогон · {alias}'
            if last and last.end is None:
                text += f' {last.start:%H:%M}' if last.start else ''
                if totals(last):
                    text += ': ' + totals(last)
            active.append(text)
        elif last:
            when = last.end or last.start
            text = f'Последний прогон · {alias} {when:%d.%m %H:%M}'
            text += f', {"⚠ " if last.rc else ""}rc={last.rc}' if last.rc is not None else ' · завершение не подтверждено'
            if totals(last):
                text += '; ' + totals(last)
            summaries.append((when, text))
    daemon_aliases = sorted({aliases[p] for p in daemons if p in aliases})
    chat = ' · чат: ' + ', '.join(daemon_aliases) if daemon_aliases else ' · чат: нет подтверждённого процесса'
    if active:
        status = ('working', ' | '.join(active) + chat)
    else:
        status = ('idle', ('⚠ ' if any('⚠' in text for _, text in summaries) else '') + ' | '.join(text for _, text in sorted(summaries, reverse=True)) +
                  ('; следующий — утро/вечер по расписанию' if summaries else 'Нет данных о плановых прогонах') + chat)
    return status, sorted(events, key=lambda e: (e[2], e[0]))
