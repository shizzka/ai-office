#!/usr/bin/env python3
"""Independent DCM watcher. Standard library only; never imports the production bridge.

API contract: Collector.snapshot() is a fresh, JSON-safe snapshot. Collector.lines
contains immutable Line configs (id, name, path, session). Watcher.lock protects
.state, .save(), .enqueue(key,text,now), and .flush(); persistent outbox entries
are {key,text,at}. enqueue applies the two-hour event throttle. API integration
may set watcher.code_handler (zero arguments -> one-time login code text).
run_api(collector, telegram, watcher) must start its own server thread and return.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request
from dataclasses import dataclass

from ops_language import describe_event, safe_log, presentation, stop_message

BASE = Path(__file__).resolve().parent
ROOT = Path('/home/q/work/dcm-qa')
REPOSITORIES = {'shield': Path('/home/q/work/dcm-local'),
                'smeta': Path('/home/q/work/dcm-local-smeta')}
CONFIG = Path.home() / '.config'
PROXY = 'http://127.0.0.1:12334'
CODE = re.compile(r'(?<![\w-])(?:[A-Z][A-Z0-9]*)(?:-[A-Z0-9]+)*(?![\w-])')
CLOCK = re.compile(r'^\[?(\d\d):(\d\d)(?::(\d\d))?\]?\s+')
ISO = re.compile(r'^\[?(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?)\]?\s+')


@dataclass(frozen=True)
class Line:
    id: str
    name: str
    path: Path
    session: str


def read(path: Path, limit=16384) -> str:
    try:
        with path.open('rb') as source:
            return source.read(limit).decode('utf-8', 'replace')
    except OSError:
        return ''


def hold_reason(line: Line) -> str:
    if not (line.path / 'HOLD').exists():
        return ''
    # HOLD is an explicit, owner-written explanation; render it only as text.
    return ' '.join(read(line.path / 'HOLD', 4096).split())[:1000] or 'Запуск линии отложен владельцем'


def preparation_reason(line: Line) -> str:
    return ('Линия ждёт слияния стопки щита в dev (запуск: dcm-qa/lane2-start.sh)'
            if line.id == 'smeta' else 'Линия ещё не подготовлена: нет BASE или рабочей копии')


def state_status(text: str) -> str:
    value = text.lower()
    if value.startswith('готово'):
        return 'done'
    if any(word in value for word in ('стоп', 'ошиб', 'красн', 'блокер', 'нарушение')):
        return 'stopped'
    if any(word in value for word in ('ревью архитектора', 'ждёт ревью', 'ждет ревью', 'пауза', 'ждёт лимит', 'ждет лимит')):
        return 'review'
    if any(word in value for word in ('в работе', 'регрессия', 'критик', 'ярик', 'ночн')):
        return 'running'
    return 'queued'


def stage_of(text: str) -> str:
    value = text.lower()
    if 'регресси' in value:
        return 'Регрессия'
    if 'критик' in value:
        return 'Критик'
    if any(word in value for word in ('ярик', 'ночн')):
        return 'Ночное ревью'
    if 'ася' in value:
        return 'Ася пишет приёмку'
    if 'лимит' in value:
        return 'Ожидание лимита Codex'
    if 'ревью' in value or 'pause' in value:
        return 'Ревью архитектора'
    if 'готово' in value:
        return 'Завершён'
    return 'Лёха пишет' if 'работе' in value or 'старт' in value else 'Ожидание'


def reason_of(text: str) -> str:
    value = text.lower()
    if 'сеть codex' in value and 'стоп' in value:
        return 'Сеть Codex недоступна 8 часов'
    if 'воркер 12 раз не отдал результат' in value:
        return 'Воркер 12 раз не отдал результат'
    if 'воркер недоступен' in value:
        return 'Воркер недоступен 2 часа'
    if 'цепочка' in value and 'не зелёная' in value:
        return 'Общая ветка не готова к запуску'
    if 'нет задания на исправление' in value or 'не смогла составить' in value:
        return 'Ночная смена не смогла составить исправление'
    if 'красн' in value or 'код 10' in value:
        return 'Красная регрессия'
    if 'блокер' in value or 'код 11' in value:
        return 'Блокер критика'
    if 'acceptance' in value or 'нарушение' in value:
        return 'Изменена защищённая приёмка'
    if 'ошиб' in value or 'код 12' in value:
        return 'Ошибка Codex'
    if 'лимит' in value:
        return 'Ожидание лимита Codex'
    if 'стоп' in value:
        return 'Очередь остановлена'
    if 'ревью' in value or 'pause' in value:
        return 'Ждёт ревью архитектора'
    return 'Пауза владельца' if 'пауза' in value else ''


def parse_log(data: bytes, modified: float, identity: str, start=0, *, codes_by_line=None) -> list[dict]:
    """Date every clock backwards using *all* lines, including unrelated entries."""
    rows, offset = [], start
    for raw in data.splitlines(keepends=True):
        offset += len(raw)
        if raw.endswith(b'\n'):
            rows.append((raw.decode('utf-8', 'replace').rstrip(), offset))
    anchor = dt.datetime.fromtimestamp(modified).astimezone()
    records = []
    for text, end in reversed(rows):
        clock, iso = CLOCK.match(text), ISO.match(text)
        at = None
        try:
            if iso:
                stamp = dt.datetime.fromisoformat(iso[1].replace('Z', '+00:00'))
                anchor = stamp.replace(tzinfo=anchor.tzinfo) if stamp.tzinfo is None else stamp
                at = anchor.timestamp()
            elif clock:
                stamp = anchor.replace(hour=int(clock[1]), minute=int(clock[2]), second=int(clock[3] or 0), microsecond=0)
                if stamp > anchor:
                    stamp -= dt.timedelta(days=1)
                anchor, at = stamp, stamp.timestamp()
        except ValueError:
            continue
        line_id = 'shield' if '[очередь]' in text else 'smeta' if '[смета]' in text else None
        if not line_id:
            continue
        # A tight circle alphabet prevents source text and paths becoming identifiers.
        body = re.split(r'\[(?:очередь|смета)\]\s*', text, maxsplit=1)[-1]
        circle = event_circle(body, (codes_by_line or {}).get(line_id, set()))
        kind, message = 'activity', 'Событие очереди'
        stage = stage_of(body)
        records.append({'id': hashlib.sha256(f'{identity}:{end}'.encode()).hexdigest()[:24],
                        'line': line_id, 'code': circle, 'text': message,
                        'at': at if at is not None else modified, 'kind': kind,
                        'stage': stage,
                        'end': end, 'identity': identity, 'raw': safe_log(text), 'body': body})
    ordered = list(reversed(records))
    for record in ordered:
        body = record.pop('body')
        record.update(describe_event(body, record['code']))
        # Only a named, explicit runner start/continuation may reopen a closed circle.
        restart = re.match(r'^(?:старт|продолжение)\s+(\S+)', body, re.I)
        record['explicitRestart'] = bool(restart and restart[1] == record['code'])
        record['progress'] = False
        record['awaitingReview'] = (record['eventType'] in ('complete', 'review', 'review-info') and
                                    ('ждёт ревью' in body.lower() or 'ждет ревью' in body.lower()))
        event_type = record['eventType']
        stages = {'code': 'Лёха пишет', 'acceptance': 'Ася пишет приёмку', 'regression': 'Регрессия',
                  'critic': 'Критик', 'night': 'Ночное ревью', 'limit': 'Ожидание лимита Codex'}
        if record['phase'] in stages:
            record['stage'] = stages[record['phase']]
        if event_type in ('stop', 'tests-red', 'critic-blockers'):
            record.update(kind='stop', text=reason_of(record['raw']) or 'Очередь остановлена', progress=False)
        elif event_type == 'commit':
            record.update(text='Коммит сохранён', progress=True)
        elif event_type == 'limit':
            record.update(kind='limit', progress=True)
        elif event_type in ('review', 'pause'):
            record.update(kind='review', text='Пауза владельца' if event_type == 'pause' else 'Ждёт ревью архитектора',
                          stage='Пауза владельца' if event_type == 'pause' else 'Ревью архитектора')
        elif event_type in ('complete', 'merged', 'queue-done'):
            record.update(kind='green', text='Круг завершён зелёным')
        elif event_type in ('code-start', 'acceptance-start', 'resume', 'fix-plan', 'tests-green',
                            'tests-waived', 'critic-start', 'critic-green', 'night-start', 'tests-start', 'worker-retry'):
            record.update(kind='activity', progress=True)
    return ordered


def order_circle(code, codes):
    """Resolve only known ORDER names and their exact automatic -FIX suffixes."""
    if code in codes:
        return code
    if code:
        return next((candidate for candidate in sorted(codes, key=len, reverse=True)
                     if code.startswith(candidate) and re.fullmatch(r'(?:-FIX)+', code[len(candidate):])), None)
    return None


def event_circle(body, codes):
    """Use this row's explicit name/branch; never borrow a previous row or parent branch."""
    tokens = re.finditer(r'feat/([a-z0-9]+(?:-[a-z0-9]+)*)(?![\w-])|' + CODE.pattern, body)
    for token in tokens:
        code = token[1].upper() if token[1] else token[0]
        if len(code) == 1 or code in {'BASE', 'EXIT', 'RESULT', 'PASS', 'FAIL', 'DEV'}:
            continue
        return code if order_circle(code, codes) else None
    return None


def read_order(path):
    result = []
    for row in read(path, 262144).splitlines():
        parts = row.strip().split('|')
        if (len(parts) == 3 and not row.lstrip().startswith('#') and
                re.fullmatch(r'[A-Z0-9]{1,24}', parts[0]) and
                re.fullmatch(r'[A-Z0-9]+(?:-[A-Z0-9]+)*', parts[1]) and
                parts[2] in ('dev', 'qa', 'pause')):
            result.append(parts)
    return result


def incident_records(records, codes):
    """Collapse the child failure plus generic parent STOP into one incident."""
    result, stops = [], {}
    for source in records:
        event = dict(source)
        event['code'] = order_circle(event['code'], codes)
        key = (event['line'], event['code'])
        previous_index = stops.get(key)
        if event['kind'] == 'stop':
            if previous_index is not None and 0 <= event['at'] - result[previous_index]['at'] <= 5:
                previous = result[previous_index]
                # Keep one incident identity even if its parent STOP arrives
                # in the next poll; its end still advances the log cursor.
                event['id'] = previous['id']
                if event['text'] == 'Очередь остановлена' and previous['text'] != 'Очередь остановлена':
                    event['text'] = previous['text']
                result[previous_index] = event
                continue
            stops[key] = len(result)
        elif event['progress'] or event['kind'] in ('green', 'review'):
            stops.pop(key, None)
        result.append(event)
    return result


def process_table() -> list[dict]:
    result = []
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            args = (path / 'cmdline').read_bytes().decode('utf-8', 'replace').strip('\0').split('\0')
            stat = (path / 'stat').read_text().rsplit(')', 1)[1].split()
            if stat[0] == 'Z':
                continue
            fds = []
            for fd in ('0', '1', '2'):
                try:
                    fds.append(os.readlink(path / 'fd' / fd))
                except OSError:
                    pass
            result.append({'pid': int(path.name), 'ppid': int(stat[1]), 'args': args, 'fds': fds})
        except (OSError, ValueError, IndexError):
            continue
    return result


def process_flags(line: Line, processes: list[dict], pane_pids=(), *, include_queue=False) -> dict:
    by_pid = {p['pid']: p for p in processes}
    # Only actual queue script argv, not shell prompt strings mentioning the script.
    roots = {p['pid'] for p in processes if str(line.path / 'dcm-queue.sh') in p['args'][:3]}
    roots.update(pane_pids)
    flags = {'codex': False, 'worker': False}
    if include_queue:
        flags['queue'] = False
    for process in processes:
        chain, seen = process, set()
        associated = any(str(fd).startswith(str(line.path / 'out') + '/') for fd in process.get('fds', []))
        while chain['pid'] not in seen:
            seen.add(chain['pid'])
            if chain['pid'] in roots:
                associated = True
                break
            chain = by_pid.get(chain['ppid'])
            if chain is None:
                break
        if not associated:
            continue
        if include_queue:
            flags['queue'] = True
        args = process['args']
        for index, arg in enumerate(args[:3]):
            if Path(arg).name in ('codex', 'codex.js') and index + 1 < len(args) and args[index + 1] == 'exec':
                flags['codex'] = True
            if arg == str(line.path.parent / 'worker-run.sh'):
                flags['worker'] = True
    return flags


def tmux_panes() -> dict[str, list[int]]:
    try:
        output = subprocess.run(['tmux', 'list-panes', '-a', '-F', '#{session_name}\t#{pane_pid}'],
                                capture_output=True, text=True, timeout=4, check=False).stdout
    except (OSError, subprocess.TimeoutExpired):
        return {}
    result = {}
    for row in output.splitlines():
        parts = row.split('\t')
        if len(parts) == 2 and parts[1].isdigit():
            result.setdefault(parts[0], []).append(int(parts[1]))
    return result


def tcp_available(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=2):
            return True
    except OSError:
        return False


class Collector:
    def __init__(self, root=ROOT, *, clock=time.time, processes=process_table,
                 tmux=tmux_panes, tcp=tcp_available, repo_by_line=None):
        self.root = Path(root)
        self.lines = (Line('shield', 'Щит', self.root / 'queue', 'dcm-queue'),
                      Line('smeta', 'Смета', self.root / 'queue-smeta', 'dcm-smeta'))
        self.repo_by_line = {**REPOSITORIES, **(repo_by_line or {})}
        self.clock, self.processes, self.tmux, self.tcp = clock, processes, tmux, tcp
        self.lock = threading.RLock()
        self.records = []
        self.log_identity, self.log_end = '', 0
        self.worker_down = {}
        self._cached = None
        self._cache_at = 0

    def snapshot(self, *, fresh=False) -> dict:
        with self.lock:
            now = self.clock()
            if self._cached is not None and not fresh and now - self._cache_at < 5:
                return json.loads(json.dumps(self._cached))
            orders = {line.id: read_order(line.path / 'ORDER') for line in self.lines}
            codes_by_line = {key: {row[1] for row in rows} for key, rows in orders.items()}
            pipeline = self.root / 'fixes/pipeline.log'
            try:
                with pipeline.open('rb') as source:
                    stat = os.fstat(source.fileno())
                    start = max(0, stat.st_size - 4 * 1024 * 1024)
                    source.seek(start)
                    if start:
                        source.readline()
                    start = source.tell()
                    data = source.read()
                    # A line may have run before the bounded display tail. Its
                    # earlier marker still prevents a false 'never started'.
                    history_lines = set()
                    if start:
                        source.seek(0)
                        remaining, overlap = start, b''
                        while remaining:
                            chunk = source.read(min(65536, remaining))
                            if not chunk:
                                break
                            remaining -= len(chunk)
                            scan = overlap + chunk
                            for identity, marker in (('shield', '[очередь]'), ('smeta', '[смета]')):
                                if marker.encode() in scan:
                                    history_lines.add(identity)
                            overlap = scan[-32:]
                self.log_identity = f'{stat.st_dev}:{stat.st_ino}'
                self.records = parse_log(data, stat.st_mtime, self.log_identity, start, codes_by_line=codes_by_line)
                self.log_end = start + (data.rfind(b'\n') + 1)
            except OSError:
                self.records, self.log_identity, self.log_end = [], '', 0
                history_lines = set()
            processes, panes = self.processes(), self.tmux()
            lines = []
            for line in self.lines:
                queue, activity, raw_times = [], [], {}
                records = [r for r in self.records if r['line'] == line.id]
                state_running = set()
                closed_at = {}
                for block, code, kind in orders[line.id]:
                    raw = read(line.path / 'state' / code, 2048).strip()
                    try:
                        modified = (line.path / 'state' / code).stat().st_mtime
                    except OSError:
                        modified = 0
                    raw_times[code] = modified
                    approved = line.path / 'state' / (code + '.approved')
                    if raw.lower().startswith('готово') or approved.exists():
                        closed_at[code] = max(modified, approved.stat().st_mtime if approved.exists() else 0)
                    status = 'running' if 'лимит' in raw.lower() or 'перегруз' in raw.lower() else state_status(raw)
                    if code in closed_at:
                        status = 'done'
                    elif status == 'running':
                        state_running.add(code)
                    label = {'queued': 'В очереди', 'running': stage_of(raw), 'review': reason_of(raw) or 'Ждёт ревью',
                             'stopped': reason_of(raw), 'done': 'Готово'}[status]
                    queue.append({'code': code, 'block': block[:24], 'type': kind[:24], 'state': label, 'status': status})
                    if raw:
                        try:
                            activity.append((line.path / 'state' / code).stat().st_mtime)
                        except OSError:
                            pass
                codes = {q['code'] for q in queue}
                latest_by_code = {}
                pending_review = set()
                circle_records = [r for r in incident_records(records, codes) if r['code']]
                for record in circle_records:
                    mapped = record['code']
                    if record['awaitingReview']:
                        pending_review.add(mapped)
                    if mapped in closed_at:
                        if record['explicitRestart'] and record['at'] > closed_at[mapped]:
                            del closed_at[mapped]
                        else:
                            continue
                    if record['progress'] or record['kind'] in ('stop', 'green', 'review'):
                        latest_by_code[mapped] = record
                for q in queue:
                    if q['code'] in closed_at:
                        continue
                    event = latest_by_code.get(q['code'])
                    if not event:
                        continue
                    # State files are authoritative unless a newer event advances
                    # the phase. A same-second stop also overrides an in-flight
                    # regression state left behind by the runner.
                    if q['status'] == 'stopped' and q['state'] == 'Очередь остановлена' and event['kind'] == 'stop':
                        q['state'] = event['text']
                    newer = event['at'] > raw_times[q['code']]
                    same_stop = event['kind'] in ('stop', 'limit') and q['status'] == 'running' and event['at'] >= raw_times[q['code']] - 1
                    if not raw_times[q['code']] or newer or same_stop:
                        inferred = {'stop': 'stopped', 'green': 'done', 'review': 'review'}.get(event['kind'])
                        if inferred is None and event['progress']:
                            inferred = 'running'
                        if inferred:
                            q['status'] = inferred
                            q['state'] = {'stopped': event['text'], 'done': 'Готово', 'review': 'Пауза владельца' if event['eventType'] == 'pause' else 'Ждёт ревью архитектора', 'running': event['stage']}[inferred]
                last = records[-1] if records else None
                live = process_flags(line, processes, panes.get(line.session, []), include_queue=True)
                # Only meaningful state files and this line's events advance its clock.
                last_at = max(activity + [last['at']] if last else activity, default=None)
                # An in-flight state wins over ORDER position and old log-only work.
                running = [q for q in queue if q['code'] in state_running and q['status'] != 'done']
                active = max(running, key=lambda q: raw_times[q['code']], default=None)
                if active is None:
                    candidates = [q for q in queue if q['status'] not in ('done', 'queued')]
                    active = max(candidates, key=lambda q: max(raw_times[q['code']], latest_by_code.get(q['code'], {}).get('at', 0)), default=None)
                circle = active['code'] if active else None
                stage = active['state'] if active else 'Завершён' if queue and all(q['status'] == 'done' for q in queue) else 'Ожидание'
                reason = ''
                status = 'running' if line.session in panes or any(live.values()) else 'stopped'
                if active and active['status'] == 'review':
                    status, reason = 'waiting', active['state']
                elif active and active['status'] == 'stopped':
                    status, reason = 'stopped', active['state']
                elif (line.path / 'PAUSE').exists() and not (line.session in panes or any(live.values())):
                    status, reason = 'waiting', 'Пауза владельца'
                elif last and last['code'] and order_circle(last['code'], codes) not in closed_at and last['kind'] in ('stop', 'review') and (not active or active['status'] == 'queued'):
                    status = 'stopped' if last['kind'] == 'stop' else 'waiting'
                    reason, stage = last['text'], last['stage']
                    circle = last['code'] or circle
                held = hold_reason(line)
                unprepared = (not read(line.path / 'state/BASE').strip() or
                              not (Path(self.repo_by_line[line.id]) / '.git').exists())
                if held or (line.session not in panes and not any(live.values()) and not records and line.id not in history_lines and unprepared):
                    status, reason, stage, circle = 'awaiting-start', held or preparation_reason(line), 'Ожидает запуска', None
                if status == 'stopped' and not reason:
                    reason = 'Нет сессии очереди'
                # A stale 'waiting for limit' state cannot hide a dead runner.
                completed = bool(queue) and all(q['status'] == 'done' for q in queue)
                if completed and status != 'awaiting-start':
                    status, reason, stage = 'waiting', 'Очередь завершена', 'Завершён'
                if status == 'running' and 'лимит' in stage.lower():
                    status = 'waiting'
                    reason = 'Ожидание лимита Codex'
                if status == 'stopped' and 'лимит' in stage.lower():
                    reason = 'Нет сессии очереди'
                # State files record stage transitions not emitted by older runners.
                active_at = raw_times.get(circle, 0)
                regression = next((r for r in reversed(circle_records) if r['eventType'] in ('tests-green', 'tests-red', 'tests-waived', 'complete')), None)
                line_view = {'id': line.id, 'name': line.name, 'status': status, 'circle': circle,
                             'stage': stage, 'reason': reason, 'lastEventAt': last_at,
                             'idleSeconds': max(0, int(now - last_at)) if last_at is not None else 0,
                             'tmux': line.session in panes, 'processes': live, 'queue': queue,
                             'pauseRequested': (line.path / 'PAUSE').exists(), 'completed': completed}
                line_view['presentation'] = presentation(line_view, circle_records, now, active_at)
                line_view.update({
                    'review': [q['code'] for q in queue if q['status'] == 'review' or (q['code'] in pending_review and q['status'] == 'done' and q['type'] != 'pause' and not (line.path / 'state' / (q['code'] + '.approved')).exists())],
                    'lastRegression': {'code': regression['code'], 'result': 'red' if regression['eventType'] == 'tests-red' else 'green', 'text': regression['humanText']} if regression else None})
                lines.append(line_view)
            workers = []
            for worker_id, name, host in (('acer', 'Acer', '192.168.21.136'), ('llm', 'LLM-ноут', '192.168.21.102')):
                available = self.tcp(host, 22)
                if available:
                    self.worker_down.pop(worker_id, None)
                else:
                    self.worker_down.setdefault(worker_id, now)
                workers.append({'id': worker_id, 'name': name, 'host': host, 'port': 22,
                                'available': available, 'checkedAt': now, 'downSince': self.worker_down.get(worker_id)})
            events = [{k: r[k] for k in ('id', 'line', 'code', 'text', 'at', 'raw', 'humanText', 'eventType')} for r in reversed(self.records[-30:])]
            self._cached = {'updatedAt': now, 'lines': lines, 'events': events, 'workers': workers}
            self._cache_at = now
            return json.loads(json.dumps(self._cached))


class Telegram:
    """All traffic uses the required HTTP proxy, including owner long polling."""
    def __init__(self, token_file=CONFIG / 'dcm-ops-bot-token', chat_file=CONFIG / 'dcm-ops-chat-id'):
        self._token = read(Path(token_file), 512).strip()
        owner = read(Path(chat_file), 64).strip()
        if not self._token or not owner.isdigit():
            raise ValueError('Bot configuration is unavailable')
        self.owner = int(owner)
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({'http': PROXY, 'https': PROXY}))

    def call(self, method, payload):
        # urllib's environment NO_PROXY must never bypass our explicit proxy.
        url = f'https://api.telegram.org/bot{self._token}/{method}'
        request = urllib.request.Request(url, json.dumps(payload).encode(), {'Content-Type': 'application/json'})
        request.set_proxy('127.0.0.1:12334', 'http')
        with self.opener.open(request, timeout=40) as response:
            result = json.load(response)
        if not result.get('ok'):
            raise RuntimeError('Telegram request failed')
        return result.get('result')

    def send(self, text):
        return self.call('sendMessage', {'chat_id': self.owner, 'text': text[:4000]})


class Watcher:
    def __init__(self, collector, telegram, state_path=BASE / 'ops-watch.state.json', *, clock=time.time):
        self.collector, self.telegram, self.state_path, self.clock = collector, telegram, Path(state_path), clock
        self.lock = threading.RLock()
        self._flush_lock = threading.Lock()
        try:
            self.state = json.loads(self.state_path.read_text())
        except (OSError, ValueError):
            self.state = {}
        for key, default in (('outbox', []), ('sent', {}), ('lines', {}), ('workers', {}), ('updateOffset', 0)):
            self.state.setdefault(key, default)
        self.collector.worker_down.update({k: v['downSince'] for k, v in self.state['workers'].items() if v.get('downSince') is not None})
        self.code_handler = None

    def save(self):
        with self.lock:
            self.state_path.parent.mkdir(parents=True, exist_ok=True)
            fd, name = tempfile.mkstemp(prefix='.ops-watch-', dir=self.state_path.parent)
            try:
                os.fchmod(fd, 0o600)
                with os.fdopen(fd, 'w') as target:
                    json.dump(self.state, target, ensure_ascii=False)
                    target.flush()
                    os.fsync(target.fileno())
                os.replace(name, self.state_path)
            finally:
                if os.path.exists(name):
                    os.unlink(name)

    def enqueue(self, key, text, now=None):
        with self.lock:
            now = self.clock() if now is None else now
            if key in self.state['sent'] and now - self.state['sent'][key] < 7200:
                return False
            if any(message['key'] == key for message in self.state['outbox']):
                return False
            self.state['outbox'].append({'key': key, 'text': text[:3500], 'at': now})
            self.state['sent'][key] = now
            self.save()
            return True

    def flush(self):
        # Polling and collection share a sender mutex, but API state access never
        # waits for Telegram's network timeout.
        if not self._flush_lock.acquire(blocking=False):
            return
        try:
            while True:
                with self.lock:
                    if not self.state['outbox']:
                        return
                    message = dict(self.state['outbox'][0])
                try:
                    self.telegram.send(message['text'])
                except Exception:
                    # Do not log urllib exceptions: their URL contains the token.
                    return
                with self.lock:
                    self.state['outbox'] = [item for item in self.state['outbox'] if item['key'] != message['key']]
                    self.save()
        finally:
            self._flush_lock.release()

    def notify(self, event, line, code, state, text, now):
        key = '|'.join((event, line, code or '-', state))
        link = os.environ.get('DCM_PULT_URL', '').strip()
        self.enqueue(key, f'{text}' + (f'\nПульт: {link}' if link.startswith(('http://', 'https://')) else '\nПульт: /pult'), now)

    def tick(self):
        snapshot = self.collector.snapshot(fresh=True)
        now = self.clock()
        with self.lock:
            awaiting = {line['id'] for line in snapshot['lines'] if line['status'] == 'awaiting-start'}
            # Discard obsolete alerts left offline by the old classification.
            self.state['outbox'] = [message for message in self.state['outbox']
                                    if not any(message['key'].startswith(f'{kind}|{identity}|')
                                               for identity in awaiting for kind in ('stop', 'tmux', 'silence'))]
            log_stops = set()
            cursor = self.state.get('logCursor')
            if cursor:
                reset = cursor['identity'] != self.collector.log_identity or self.collector.log_end < cursor['end']
                canonical = []
                for line in snapshot['lines']:
                    codes = {q['code'] for q in line['queue']}
                    canonical.extend(incident_records([r for r in self.collector.records if r['line'] == line['id']], codes))
                for event in sorted(canonical, key=lambda r: r['end']):
                    if not reset and event['identity'] == cursor['identity'] and event['end'] <= cursor['end']:
                        continue
                    # On log replacement, only recent new records may trigger alerts.
                    if reset and event['at'] < now - 120:
                        continue
                    if event['line'] not in awaiting and event['kind'] in ('stop', 'review', 'green'):
                        name = next(line.name for line in self.collector.lines if line.id == event['line'])
                        message = (stop_message(name, event['code'], event['text']) if event['kind'] == 'stop'
                                   else f'{name}: {event["humanText"]}' + (' — разберите вместе с архитектором.' if event['kind'] == 'review' else ''))
                        self.notify(event['kind'], event['line'], event['code'],
                                    'log:' + event['id'] if event['kind'] == 'stop' else event['text'], message, now)
                        if event['kind'] == 'stop':
                            log_stops.add((event['line'], event['code']))
                        if event['kind'] == 'green' and event['awaitingReview']:
                            self.notify('review', event['line'], event['code'], 'Ждёт ревью архитектора', f'{name} · {event["code"] or "очередь"}: ждёт ревью архитектора', now)
            self.state['logCursor'] = {'identity': self.collector.log_identity, 'end': self.collector.log_end}
            for line in snapshot['lines']:
                previous = self.state['lines'].get(line['id'])
                label = f'{line["name"]} · {line["circle"] or "очередь"}'
                view = line['presentation']
                changed = not previous or (previous['status'], previous.get('circle'), previous.get('reason')) != (line['status'], line['circle'], line['reason'])
                if changed and view['attention']['level'] in ('intervention', 'decision'):
                    # Baseline only an empty, prepared line with no history. Every
                    # actual stop (including no circle / no log) is actionable.
                    if previous or line['lastEventAt'] is not None:
                        kind = 'stop' if line['status'] == 'stopped' else 'review'
                        message = (stop_message(line['name'], line['circle'], line['reason']) if kind == 'stop'
                                   else f'{line["name"]}: {view["attention"]["text"]}. {view["attention"]["action"]}')
                        if kind != 'stop' or (line['id'], line['circle']) not in log_stops:
                            self.notify(kind, line['id'], line['circle'],
                                        'transition:' + str(now) if kind == 'stop' else line['reason'], message, now)
                if previous and previous['status'] == 'awaiting-start' and line['status'] == 'running':
                    self.notify('started', line['id'], None, str(now), f'{line["name"]}: линия запущена', now)
                if view['showSilence'] and not any(line['processes'].values()):
                    self.notify('silence', line['id'], line['circle'], 'silent',
                                f'{label}: нет событий уже {line["idleSeconds"] // 60} мин — дольше двойной нормы стадии. '
                                'Что делать: попросите архитектора проверить, продолжает ли работать очередь.', now)
                self.state['lines'][line['id']] = {**line, 'observedAt': (previous or {}).get('observedAt', now)}
            for worker in snapshot['workers']:
                previous = self.state['workers'].get(worker['id'], {})
                alerted = previous.get('alerted', False)
                if not worker['available'] and now - worker['downSince'] > 900:
                    self.notify('worker-down', worker['id'], None, 'down', f'{worker["name"]}: нет связи больше 15 минут. Что делать: проверьте питание и сеть рабочей машины.', now)
                    alerted = True
                if worker['available'] and alerted:
                    self.notify('worker-up', worker['id'], None, 'up', f'{worker["name"]}: связь восстановлена', now)
                    alerted = False
                self.state['workers'][worker['id']] = {**worker, 'alerted': alerted}
            self.save()
        self.flush()
        self.configure_menu()
        return snapshot

    def configure_menu(self):
        # Publication belongs to the architect. Configure only an explicitly
        # supplied HTTPS address; persist success and throttle unavailable API.
        url = os.environ.get('DCM_PULT_URL', '').strip()
        now = self.clock()
        with self.lock:
            if not url.startswith('https://') or self.state.get('menuUrl') == url:
                return
            if now - self.state.get('menuAttemptAt', 0) < 900:
                return
            self.state['menuAttemptAt'] = now
            self.save()
        try:
            self.telegram.call('setChatMenuButton', {'chat_id': self.telegram.owner,
                'menu_button': {'type': 'web_app', 'text': 'Пульт', 'web_app': {'url': url}}})
        except Exception:
            return
        with self.lock:
            self.state['menuUrl'] = url
            self.save()

    def handle_update(self, update):
        message = update.get('message', {})
        chat, sender = message.get('chat', {}), message.get('from', {})
        if chat.get('type') != 'private' or chat.get('id') != self.telegram.owner or sender.get('id') != self.telegram.owner:
            return
        command = message.get('text', '').split(' ', 1)[0].split('@', 1)[0]
        if command == '/help':
            text = '/status — обе линии\n/queue — круги в работе и на ревью\n/code — одноразовый код входа\n/help — помощь'
        elif command == '/code' and self.code_handler:
            text = self.code_handler()
        elif command in ('/status', '/queue'):
            snap = self.collector.snapshot()
            parts = []
            for line in snap['lines']:
                if command == '/status':
                    view = line['presentation']
                    parts.append(f'{line["name"]}: {view["doing"]}. {view["attention"]["text"]}')
                else:
                    rows = [f'{q["code"]}: {q["state"]}' for q in line['queue'] if q['status'] != 'done']
                    parts.append(line['name'] + '\n' + ('\n'.join(rows) or 'Очередь завершена'))
            text = '\n\n'.join(parts)
        else:
            return
        # API login handlers may send their code directly and return None.
        if text is None:
            return
        # Persist replies too; a temporary Telegram outage must not discard them.
        self.enqueue('reply|' + str(update.get('update_id', self.clock())), text)

    def poll(self):
        while True:
            try:
                updates = self.telegram.call('getUpdates', {'offset': self.state['updateOffset'], 'timeout': 25, 'allowed_updates': ['message']})
                for update in updates or []:
                    self.handle_update(update)
                    with self.lock:
                        self.state['updateOffset'] = max(self.state['updateOffset'], update['update_id'] + 1)
                        self.save()
                self.flush()
            except Exception:
                time.sleep(5)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--interval', type=int, default=60)
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    try:
        telegram = Telegram()
    except ValueError:
        raise SystemExit('Bot configuration is unavailable') from None
    collector = Collector()
    watcher = Watcher(collector, telegram)
    try:
        from ops_api import run_api
    except ImportError:
        pass
    else:
        run_api(collector, telegram, watcher)
    if not args.once:
        threading.Thread(target=watcher.poll, daemon=True, name='telegram-poll').start()
    while True:
        try:
            watcher.tick()
        except Exception:
            # Exception strings can contain private source text or transport URLs.
            print('ops-watch: collection failed; retrying', flush=True)
        if args.once:
            return
        time.sleep(max(1, args.interval))


if __name__ == '__main__':
    main()
