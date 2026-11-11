#!/usr/bin/env python3
"""Loopback-only Пульт API. The Next proxy must authenticate its transport.

Telegram algorithm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
No token, owner identifier, initData, code, or cookie is written to disk/logs.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl

from ops_watch import hold_reason, preparation_reason

BASE = Path(__file__).resolve().parent
CONFIG = Path.home() / '.config'
COOKIE = 'ops_session'
SESSION_SECONDS = 1800
MAX_BODY = 16384
CIRCLE = re.compile(r'[A-Z][A-Z0-9-]{0,63}\Z')
ACTIONS = {'start', 'pause', 'approve', 'retry', 'check-workers'}


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def get_transport_key(path=BASE / 'ops-transport.key'):
    """Create once, without exposing its value through command output."""
    path = Path(path)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        pass
    else:
        with os.fdopen(fd, 'w') as stream:
            stream.write(secrets.token_hex(32))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as stream:
        if os.fstat(stream.fileno()).st_mode & 0o077:
            raise ValueError('Unsafe transport key permissions')
        key = stream.read(256).strip()
    if not re.fullmatch('[a-f0-9]{64}', key):
        raise ValueError('Invalid transport key')
    return key


class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


class OpsAPI:
    def __init__(self, collector, telegram, watcher=None, *, transport_key=None,
                 token_file=CONFIG / 'dcm-ops-bot-token', chat_file=CONFIG / 'dcm-ops-chat-id',
                 audit_file=BASE / 'ops-audit.log', repo=None, repo_by_line=None,
                 clock=time.time, run=subprocess.run):
        self.collector, self.telegram, self.watcher = collector, telegram, watcher
        self.transport_key = transport_key if transport_key is not None else get_transport_key()
        self.token_file, self.chat_file = Path(token_file), Path(chat_file)
        self.audit_file = Path(audit_file)
        self.repo_by_line = {'shield': Path('/home/q/work/dcm-local'),
                             'smeta': Path('/home/q/work/dcm-local-smeta')}
        if repo is not None:  # Explicit fixture/development override, never request-controlled.
            self.repo_by_line = {line.id: Path(repo) for line in collector.lines}
        if repo_by_line is not None:
            self.repo_by_line.update({key: Path(value) for key, value in repo_by_line.items()})
        self.clock, self.run = clock, run
        self.lock = threading.RLock()
        self.sessions, self.replays = {}, {}
        self.next_code = 0
        self.failed_attempts = []
        if watcher is not None:
            watcher.code_handler = lambda: 'Откройте Пульт и нажмите «Получить код». Код привязан к этой странице.'

    def _cleanup(self, now):
        self.sessions = {key: value for key, value in self.sessions.items() if value['expires'] > now}
        self.replays = {key: value for key, value in self.replays.items() if value > now}
        self.failed_attempts = [stamp for stamp in self.failed_attempts if stamp > now - 300]

    def _session(self, headers):
        try:
            cookie = SimpleCookie()
            cookie.load(headers.get('cookie', ''))
            raw = cookie[COOKIE].value if COOKIE in cookie else ''
        except Exception:
            raw = ''
        key = digest(raw)
        return key, self.sessions.get(key)

    def _create(self, secure, authenticated=False):
        if len(self.sessions) >= 1024:
            # Dict insertion order is creation order; cleanup preserves it. A
            # bootstrap flood may revoke old anonymous pages, never the owner.
            oldest_anon = next((key for key, value in self.sessions.items()
                                if not value['authenticated']), None)
            if oldest_anon is None:
                raise APIError(429, 'Попробуйте позже')
            self.sessions.pop(oldest_anon)
        raw = secrets.token_urlsafe(32)
        session = {'csrf': secrets.token_urlsafe(32), 'expires': self.clock() + SESSION_SECONDS,
                   'authenticated': authenticated}
        self.sessions[digest(raw)] = session
        same_site = 'None' if secure else 'Strict'
        cookie = f'{COOKIE}={raw}; HttpOnly; SameSite={same_site}; Path=/; Max-Age={SESSION_SECONDS}'
        if secure:
            cookie += '; Secure'
        return session, {'Set-Cookie': cookie}

    def _login(self, key, secure):
        self.sessions.pop(key, None)
        session, headers = self._create(secure, True)
        return 200, {'authenticated': True, 'csrf': session['csrf']}, headers

    def _telegram(self, raw):
        if not isinstance(raw, str) or len(raw) > MAX_BODY:
            raise APIError(401, 'Вход не подтверждён')
        try:
            pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=True, max_num_fields=32)
            data = dict(pairs)
            if len(data) != len(pairs):
                raise ValueError()
            supplied = data.pop('hash')
            if not re.fullmatch('[a-f0-9]{64}', supplied):
                raise ValueError()
            token = self.token_file.read_text().strip()
            owner = int(self.chat_file.read_text().strip())
            secret = hmac.new(b'WebAppData', token.encode(), hashlib.sha256).digest()
            check = '\n'.join(f'{key}={data[key]}' for key in sorted(data))
            expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(supplied, expected):
                raise ValueError()
            auth_date = int(data['auth_date'])
            now = self.clock()
            user = json.loads(data['user'])
            if not isinstance(user, dict) or type(user.get('id')) is not int or user['id'] != owner:
                raise ValueError()
            if auth_date < now - 3600 or auth_date > now + 30:
                raise ValueError()
            # Hash canonical signed data so reordering/URL escaping cannot bypass replay protection.
            replay = digest(expected)
            if replay in self.replays or len(self.replays) >= 4096:
                raise ValueError()
            self.replays[replay] = max(now + 60, auth_date + 3601)
        except (ValueError, KeyError, TypeError, OSError):
            raise APIError(401, 'Вход не подтверждён') from None

    def _issue_code(self, session):
        now = self.clock()
        if now < self.next_code or len(self.failed_attempts) >= 3:
            raise APIError(429, 'Попробуйте позже')
        self.next_code = now + 60
        # One pending challenge globally; issuing in a new browser cannot reset attempts.
        for item in self.sessions.values():
            item.pop('challenge', None)
        code = f'{secrets.randbelow(1000000):06d}'
        session['challenge'] = {'hash': digest(session['csrf'] + ':' + code), 'expires': now + 300, 'attempts': 0}
        try:
            result = self.telegram.send(f'Пульт: код входа {code}. Действует 5 минут, только на странице, где вы запросили код.')
            if result is False:
                raise RuntimeError()
        except Exception:
            session.pop('challenge', None)
            raise APIError(503, 'Не удалось отправить код. Попробуйте позже') from None

    def _check_code(self, session, code):
        now = self.clock()
        challenge = session.get('challenge')
        if len(self.failed_attempts) >= 3:
            raise APIError(429, 'Попробуйте позже')
        if not challenge or challenge['expires'] <= now or challenge['attempts'] >= 3:
            raise APIError(401, 'Код недействителен')
        challenge['attempts'] += 1
        if not isinstance(code, str) or not re.fullmatch(r'\d{6}', code) or not hmac.compare_digest(challenge['hash'], digest(session['csrf'] + ':' + code)):
            self.failed_attempts.append(now)
            if challenge['attempts'] >= 3:
                session.pop('challenge', None)
            raise APIError(401, 'Код недействителен')
        session.pop('challenge', None)

    def _audit(self, key, action, line, circle, result):
        entry = {'time': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(self.clock())),
                 'who': 'owner', 'session': key[:12], 'action': action, 'line': line,
                 'circle': circle, 'result': result}
        fd = os.open(self.audit_file, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'a') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(json.dumps(entry, ensure_ascii=False) + '\n')
            stream.flush()
            os.fsync(stream.fileno())

    def _order(self, line):
        rows = []
        for raw in (line.path / 'ORDER').read_text().splitlines():
            if not raw.strip() or raw.lstrip().startswith('#'):
                continue
            fields = [value.strip() for value in raw.split('|')]
            if len(fields) != 3 or not CIRCLE.fullmatch(fields[1]) or fields[2] not in {'pause', 'dev', 'qa'}:
                raise APIError(409, 'Очередь требует проверки архитектора')
            rows.append((fields[1], fields[2]))
        return rows

    def _safe_file(self, path, content=''):
        if path.parent.is_symlink() or path.parent.resolve() != path.parent.absolute():
            raise APIError(409, 'Небезопасный путь очереди')
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())

    def _current(self, line, rows):
        for circle, kind in rows:
            status = (line.path / 'state' / circle).read_text().strip() if (line.path / 'state' / circle).exists() else 'ждёт'
            if not status.startswith('готово'):
                return circle, kind, status
        return '', '', ''

    def _retry_commit(self, line, circle, state):
        # No safe retry for an incomplete Codex edit or changed acceptance.
        if not ('регрессия' in state or 'критик' in state or re.search(r'код (10|11)\)', state)):
            raise APIError(409, 'Повтор возможен только после остановки регрессии или критика')
        log = (self.collector.root / 'fixes' / 'pipeline.log').read_text(errors='replace')[-4 * 1024 * 1024:]
        tag = '[очередь]' if line.id == 'shield' else '[смета]'
        branch = 'feat/' + circle.lower()
        latest = None
        active_ref = None
        for record in log.splitlines():
            if tag not in record:
                continue
            started = re.search(r'(?:старт|возобновление) ([A-Z][A-Z0-9-]*) .*?на (feat/[a-z0-9-]+)(?:\s|$)', record)
            if started and started[1] in {circle, circle + '-FIX'}:
                active_ref = started[2]
                latest = None
            match = re.search(r'коммит ([a-f0-9]{7,40}) на (feat/[a-z0-9-]+)(?:\s|$)', record)
            if match and match[2] in {branch, branch + '-fix'}:
                latest = match.groups()
        if latest is None or (active_ref is not None and latest[1] != active_ref):
            raise APIError(409, 'Не удалось однозначно определить коммит регрессии')
        short, ref = latest
        result = self.run(['git', '-C', str(self.repo_by_line[line.id]), 'rev-parse', '--verify', f'refs/heads/{ref}^{{commit}}'],
                          capture_output=True, text=True, timeout=10, check=False)
        commit = result.stdout.strip()
        if result.returncode or not re.fullmatch('[a-f0-9]{40}', commit) or not commit.startswith(short):
            raise APIError(409, 'Ветка изменилась после последнего прогона')
        return commit

    def _perform(self, data):
        line = next((item for item in self.collector.lines if item.id == data['line']), None)
        if line is None:
            raise APIError(400, 'Неизвестная линия')
        action, circle = data['action'], data.get('circle', '')
        if action == 'check-workers':
            return {'ok': True, 'status': self.collector.snapshot(fresh=True)}
        if action == 'pause':
            self._safe_file(line.path / 'PAUSE')
            return {'ok': True, 'message': 'Пауза после текущего круга'}
        # Fresh classification and a direct HOLD read precede every start path,
        # including approve/retry, before any approval/resume files are created.
        snapshot = self.collector.snapshot(fresh=True)
        current_line = next((item for item in snapshot['lines'] if item['id'] == line.id), None)
        blocked = hold_reason(line) or ((current_line.get('reason') or preparation_reason(line)) if current_line and current_line['status'] == 'awaiting-start' else '')
        if blocked:
            return {'ok': False, 'outcome': 'deferred', 'message': blocked}
        if current_line and (current_line['status'] == 'running' or current_line.get('tmux') or any(current_line.get('processes', {}).values())):
            return {'ok': False, 'outcome': 'deferred', 'message': 'Очередь уже идёт. Ничего запускать не нужно.'}
        if action in {'approve', 'retry'}:
            if not isinstance(circle, str) or not CIRCLE.fullmatch(circle):
                raise APIError(400, 'Некорректный круг')
            rows = self._order(line)
            current, kind, state = self._current(line, rows)
            if circle != current:
                raise APIError(409, 'Круг не является текущим')
            running = self.run(['tmux', 'has-session', '-t', '=' + line.session], capture_output=True, timeout=5, check=False)
            if running.returncode == 0:
                raise APIError(409, 'Очередь ещё работает')
            if action == 'approve':
                if kind != 'pause' or 'ждёт ревью' not in state:
                    raise APIError(409, 'Круг не ждёт одобрения')
                self._safe_file(line.path / 'state' / (circle + '.approved'))
            else:
                if kind != 'dev':
                    raise APIError(409, 'Регрессия доступна только для dev-круга')
                commit = self._retry_commit(line, circle, state)
                self._safe_file(line.path / 'state' / (circle + '.resume'), commit + '\n')
        result = self.run(['bash', str(line.path / 'dcm-queue.sh'), 'start'],
                          capture_output=True, text=True, timeout=10, check=False)
        if result.returncode == 1:
            # The fixed queue script uses exit 1 for a preparation refusal.
            output = (result.stdout or '').strip() or (result.stderr or '').strip()
            output = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', output)
            message = ' '.join(output.split())[:1000] or 'Запуск очереди отложен. Проверьте подготовку линии.'
            return {'ok': False, 'outcome': 'deferred', 'message': message}
        if result.returncode:
            raise APIError(503, 'Не удалось запустить очередь')
        return {'ok': True}

    def dispatch(self, method, path, headers=None, body=b''):
        """Return (HTTP status, JSON object, response headers), with no exception details."""
        headers = {key.lower(): value for key, value in (headers or {}).items()}
        try:
            if not hmac.compare_digest(headers.get('x-ops-transport', ''), self.transport_key):
                raise APIError(403, 'Доступ запрещён')
            with self.lock:
                self._cleanup(self.clock())
                key, session = self._session(headers)
                secure = headers.get('x-ops-secure') == '1'
                if method == 'GET' and path == '/session':
                    response_headers = {}
                    if session is None:
                        session, response_headers = self._create(secure)
                    return 200, {'authenticated': session['authenticated'], 'csrf': session['csrf']}, response_headers
                if method == 'GET' and path == '/status':
                    if not (session and session['authenticated']) and headers.get('x-ops-local') != '1':
                        raise APIError(401, 'Требуется вход')
                    return 200, self.collector.snapshot(), {}
                if method != 'POST':
                    raise APIError(404, 'Не найдено')
                if len(body) > MAX_BODY:
                    raise APIError(413, 'Слишком большой запрос')
                if headers.get('content-type', '').split(';')[0].strip().lower() != 'application/json':
                    raise APIError(415, 'Требуется JSON')
                if not session or not hmac.compare_digest(headers.get('x-csrf-token', ''), session['csrf']):
                    raise APIError(403, 'Обновите страницу')
                try:
                    data = json.loads(body)
                    if not isinstance(data, dict):
                        raise ValueError()
                except (ValueError, TypeError, UnicodeDecodeError):
                    raise APIError(400, 'Некорректный JSON') from None
                if path == '/auth/telegram':
                    self._telegram(data.get('initData'))
                    return self._login(key, secure)
                if path == '/auth/code/request':
                    self._issue_code(session)
                    return 200, {'ok': True}, {}
                if path == '/auth/code':
                    self._check_code(session, data.get('code'))
                    return self._login(key, secure)
                if path == '/logout':
                    self.sessions.pop(key, None)
                    fresh, response_headers = self._create(secure)
                    return 200, {'authenticated': False, 'csrf': fresh['csrf']}, response_headers
                if path != '/action':
                    raise APIError(404, 'Не найдено')
                if not session['authenticated']:
                    raise APIError(401, 'Требуется вход')
                # Audit accepts only enums and validated circles, never arbitrary request strings.
                raw_action, raw_line = data.get('action'), data.get('line')
                action = raw_action if isinstance(raw_action, str) and raw_action in ACTIONS else 'invalid'
                line = raw_line if isinstance(raw_line, str) and raw_line in {item.id for item in self.collector.lines} else 'invalid'
                circle = data.get('circle', '')
                circle = circle if isinstance(circle, str) and (not circle or CIRCLE.fullmatch(circle)) else ''
                self._audit(key, action, line, circle, 'requested')
                try:
                    if action == 'invalid' or line == 'invalid' or data.get('confirmed') is not True:
                        raise APIError(400, 'Требуется подтверждение допустимого действия')
                    result = self._perform(data)
                except Exception:
                    self._audit(key, action, line, circle, 'failed')
                    raise
                self._audit(key, action, line, circle, result.get('outcome', 'ok'))
                return 200, result, {}
        except APIError as error:
            return error.status, {'error': error.message}, {}
        except Exception:
            return 503, {'error': 'Операция временно недоступна'}, {}


def run_api(collector, telegram, watcher=None):
    api = OpsAPI(collector, telegram, watcher)

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, *_args):
            pass

        def do_GET(self):
            self.respond('GET')

        def do_POST(self):
            self.respond('POST')

        def respond(self, method):
            try:
                raw_length = self.headers.get('Content-Length', '0')
                length = int(raw_length)
                if length < 0 or length > MAX_BODY or self.headers.get('Transfer-Encoding'):
                    status, result, headers = 413, {'error': 'Слишком большой запрос'}, {}
                else:
                    body = self.rfile.read(length) if method == 'POST' else b''
                    status, result, headers = api.dispatch(method, self.path, dict(self.headers), body)
            except (ValueError, TimeoutError, OSError):
                status, result, headers = 400, {'error': 'Некорректный запрос'}, {}
            payload = json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            for key, value in headers.items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(payload)

    class Server(ThreadingHTTPServer):
        daemon_threads = True
        request_queue_size = 16
        slots = threading.BoundedSemaphore(16)

        def process_request(self, request, client_address):
            if not self.slots.acquire(blocking=False):
                request.close()
                return
            try:
                super().process_request(request, client_address)
            except Exception:
                self.slots.release()
                raise

        def process_request_thread(self, request, client_address):
            try:
                super().process_request_thread(request, client_address)
            finally:
                self.slots.release()

        def handle_error(self, request, client_address):
            pass

    server = Server(('127.0.0.1', 3112), Handler)
    server.api = api
    threading.Thread(target=server.serve_forever, name='ops-api', daemon=True).start()
    return server
