"""Offline authentication and queue-control boundary regressions."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
from types import SimpleNamespace
from urllib.parse import urlencode

import pytest

from ops_api import OpsAPI, COOKIE, get_transport_key


class Telegram:
    def __init__(self):
        self.messages = []
        self.fail = False

    def send(self, message):
        if self.fail:
            raise RuntimeError('must never expose transport exception')
        self.messages.append(message)
        return {'message_id': 1}


@pytest.fixture
def setup(tmp_path):
    lines = []
    for identity, directory, session in [('shield', 'queue', 'dcm-queue'), ('smeta', 'queue-smeta', 'dcm-smeta')]:
        path = tmp_path / directory
        (path / 'state').mkdir(parents=True)
        (path / 'out').mkdir()
        (path / 'ORDER').write_text('1|G1|dev\n1|REVIEW|pause\n2|G2|dev\n')
        (path / 'state/G1').write_text('регрессия на воркере (G1)')
        lines.append(SimpleNamespace(id=identity, path=path, session=session))
    (tmp_path / 'fixes').mkdir()
    commit = 'b' * 40
    (tmp_path / 'fixes/pipeline.log').write_text('10:00:00 [очередь] коммит bbbbbbb на feat/g1\n')
    collector = SimpleNamespace(root=tmp_path, lines=lines, snapshot=lambda **kw: {'lines': [], 'fresh': kw.get('fresh', False)})
    token = tmp_path / 'token'
    chat = tmp_path / 'owner'
    # Synthetic credentials; actual secret paths are never accessed by tests.
    token.write_text('synthetic-token-fixture')
    chat.write_text('12345')
    now = [1800000000.0]
    calls = []
    def run(args, **kwargs):
        calls.append((args, kwargs))
        return SimpleNamespace(returncode=1 if args[0] == 'tmux' else 0, stdout=commit + '\n')
    telegram = Telegram()
    api = OpsAPI(collector, telegram, transport_key='test-transport', token_file=token, chat_file=chat,
                 audit_file=tmp_path / 'audit', repo=tmp_path / 'repo', clock=lambda: now[0], run=run)
    return SimpleNamespace(api=api, telegram=telegram, now=now, calls=calls, root=tmp_path, commit=commit)


class Browser:
    def __init__(self, api, local=False, secure=False):
        self.api = api
        self.headers = {'x-ops-transport': 'test-transport', 'content-type': 'application/json',
                        'x-ops-local': '1' if local else '0', 'x-ops-secure': '1' if secure else '0'}
        self.last_cookie = ''
        self.request('GET', '/session')

    def request(self, method, path, data=None):
        result = self.api.dispatch(method, path, self.headers, json.dumps(data or {}).encode())
        status, body, headers = result
        if 'Set-Cookie' in headers:
            self.last_cookie = headers['Set-Cookie']
            self.headers['cookie'] = self.last_cookie.split(';')[0]
        if 'csrf' in body:
            self.headers['x-csrf-token'] = body['csrf']
        return result

    def login(self, telegram):
        assert self.request('POST', '/auth/code/request')[0] == 200
        code = re.search(r'\b\d{6}\b', telegram.messages[-1])[0]
        assert self.request('POST', '/auth/code', {'code': code})[0] == 200
        return code


def init_data(setup, *, user=12345, date=None, extra=None):
    data = {'auth_date': str(int(setup.now[0]) if date is None else date), 'user': json.dumps({'id': user}),
            'query_id': 'synthetic-query'}
    data.update(extra or {})
    secret = hmac.new(b'WebAppData', b'synthetic-token-fixture', hashlib.sha256).digest()
    check = '\n'.join(f'{key}={data[key]}' for key in sorted(data))
    data['hash'] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(data)


def test_transport_required_even_local(setup):
    assert setup.api.dispatch('GET', '/status', {'x-ops-local': '1'})[0] == 403
    assert setup.api.dispatch('GET', '/session', {'x-ops-transport': 'spoof'})[0] == 403
    assert not setup.api.sessions


def test_only_local_anonymous_reads(setup):
    remote = Browser(setup.api)
    assert remote.request('GET', '/status')[0] == 401
    local = Browser(setup.api, local=True)
    assert local.request('GET', '/status')[0] == 200
    assert local.request('POST', '/action', {'line': 'shield', 'action': 'pause', 'confirmed': True})[0] == 401
    assert not setup.calls


def test_cookie_csrf_and_rotation(setup):
    browser = Browser(setup.api, secure=True)
    assert 'HttpOnly' in browser.last_cookie and 'SameSite=None' in browser.last_cookie
    assert 'Secure' in browser.last_cookie and 'Max-Age=1800' in browser.last_cookie
    raw = browser.headers['cookie'].split('=', 1)[1]
    assert raw not in repr(setup.api.sessions)
    assert all(len(key) == 64 for key in setup.api.sessions)
    old_csrf = browser.headers['x-csrf-token']
    old_cookie = browser.headers['cookie']
    browser.login(setup.telegram)
    assert browser.headers['cookie'] != old_cookie
    assert browser.headers['x-csrf-token'] != old_csrf
    browser.headers['x-csrf-token'] = old_csrf
    assert browser.request('POST', '/logout')[0] == 403


@pytest.mark.parametrize('variation', ['forged', 'foreign', 'expired', 'future', 'duplicate', 'id-string'])
def test_telegram_rejects_invalid(setup, variation):
    browser = Browser(setup.api)
    raw = init_data(setup)
    if variation == 'forged':
        raw += '0'
    elif variation == 'foreign':
        raw = init_data(setup, user=777)
    elif variation == 'expired':
        raw = init_data(setup, date=int(setup.now[0]) - 3601)
    elif variation == 'future':
        raw = init_data(setup, date=int(setup.now[0]) + 31)
    elif variation == 'duplicate':
        raw += '&auth_date=1'
    elif variation == 'id-string':
        raw = init_data(setup, user='12345')
    assert browser.request('POST', '/auth/telegram', {'initData': raw})[0] == 401
    assert browser.request('GET', '/status')[0] == 401


def test_telegram_valid_and_replay_after_logout(setup):
    browser = Browser(setup.api)
    raw = init_data(setup, extra={'start_param': 'encoded value+and&symbols'})
    assert browser.request('POST', '/auth/telegram', {'initData': raw})[0] == 200
    assert browser.request('GET', '/status')[0] == 200
    browser.request('POST', '/logout')
    assert browser.request('POST', '/auth/telegram', {'initData': raw})[0] == 401
    assert Browser(setup.api).request('POST', '/auth/telegram', {'initData': raw})[0] == 401


def test_code_bound_consumed_and_expired(setup):
    one, two = Browser(setup.api), Browser(setup.api)
    one.request('POST', '/auth/code/request')
    code = re.search(r'\b\d{6}\b', setup.telegram.messages[-1])[0]
    assert two.request('POST', '/auth/code', {'code': code})[0] == 401
    assert one.request('POST', '/auth/code', {'code': code})[0] == 200
    one.request('POST', '/logout')
    assert one.request('POST', '/auth/code', {'code': code})[0] == 401
    setup.now[0] += 61
    one.request('POST', '/auth/code/request')
    code = re.search(r'\b\d{6}\b', setup.telegram.messages[-1])[0]
    setup.now[0] += 301
    assert one.request('POST', '/auth/code', {'code': code})[0] == 401


def test_code_attempt_budget_survives_new_browser(setup):
    first = Browser(setup.api)
    assert first.request('POST', '/auth/code/request')[0] == 200
    code = re.search(r'\b\d{6}\b', setup.telegram.messages[-1])[0]
    bad = '111111' if code != '111111' else '222222'
    for _ in range(3):
        assert first.request('POST', '/auth/code', {'code': bad})[0] == 401
    setup.now[0] += 61
    second = Browser(setup.api)
    assert second.request('POST', '/auth/code/request')[0] == 429
    assert second.request('POST', '/auth/code', {'code': code})[0] == 429
    assert len(setup.telegram.messages) == 1


def test_code_global_issue_cooldown_and_send_failure(setup):
    one, two = Browser(setup.api), Browser(setup.api)
    setup.telegram.fail = True
    response = one.request('POST', '/auth/code/request')
    assert response[0] == 503
    assert 'transport exception' not in json.dumps(response)
    assert all('challenge' not in session for session in setup.api.sessions.values())
    assert two.request('POST', '/auth/code/request')[0] == 429


def test_post_validation_and_expired_session(setup):
    browser = Browser(setup.api)
    browser.headers['content-type'] = 'text/plain'
    assert browser.request('POST', '/auth/code/request')[0] == 415
    browser.headers['content-type'] = 'application/json'
    assert setup.api.dispatch('POST', '/auth/code/request', browser.headers, b'{')[0] == 400
    assert setup.api.dispatch('POST', '/auth/code/request', browser.headers, b' ' * 16385)[0] == 413
    browser.headers['x-csrf-token'] = 'forged'
    assert browser.request('POST', '/auth/code/request')[0] == 403
    setup.now[0] += 1801
    assert browser.request('POST', '/auth/code/request')[0] == 403


def owner(setup):
    browser = Browser(setup.api)
    assert browser.request('POST', '/auth/telegram', {'initData': init_data(setup)})[0] == 200
    return browser


def action(browser, name, circle=None, confirmed=True, line='shield'):
    data = {'line': line, 'action': name, 'confirmed': confirmed}
    if circle is not None:
        data['circle'] = circle
    return browser.request('POST', '/action', data)


def test_action_allowlist_confirmation_and_audit(setup):
    browser = owner(setup)
    assert action(browser, 'start', confirmed=False)[0] == 400
    assert action(browser, 'rm -rf /')[0] == 400
    assert action(browser, 'start', line='../queue')[0] == 400
    assert not setup.calls
    assert action(browser, 'pause')[0] == 200
    assert (setup.root / 'queue/PAUSE').exists()
    assert action(browser, 'start')[0] == 200
    assert setup.calls[-1][0] == ['bash', str(setup.root / 'queue/dcm-queue.sh'), 'start']
    records = [json.loads(row) for row in (setup.root / 'audit').read_text().splitlines()]
    assert [row['result'] for row in records[-4:]] == ['requested', 'ok', 'requested', 'ok']
    assert all(row['who'] == 'owner' for row in records)
    assert 'rm -rf' not in (setup.root / 'audit').read_text()
    assert os.stat(setup.root / 'audit').st_mode & 0o777 == 0o600


def test_approve_current_pause_only_and_no_traversal(setup):
    browser = owner(setup)
    assert action(browser, 'approve', 'G1')[0] == 409
    assert action(browser, 'approve', '../G1')[0] == 400
    assert action(browser, 'approve', 'REVIEW')[0] == 409
    (setup.root / 'queue/state/G1').write_text('готово')
    (setup.root / 'queue/state/REVIEW').write_text('ждёт ревью архитектора')
    assert action(browser, 'approve', 'REVIEW')[0] == 200
    assert (setup.root / 'queue/state/REVIEW.approved').exists()


def test_retry_exact_failed_fix_commit_preserves_fix(setup):
    browser = owner(setup)
    (setup.root / 'queue/state/G1').write_text('СТОП после автоисправления (код 10)')
    (setup.root / 'fixes/pipeline.log').write_text('10:00:00 [очередь] коммит aaaaaaa на feat/g1\n11:00:00 [очередь] коммит bbbbbbb на feat/g1-fix\n')
    assert action(browser, 'retry', 'G1')[0] == 200
    assert (setup.root / 'queue/state/G1.resume').read_text() == setup.commit + '\n'
    assert setup.calls[-2][0][-1] == 'refs/heads/feat/g1-fix^{commit}'
    assert setup.calls[-1][0] == ['bash', str(setup.root / 'queue/dcm-queue.sh'), 'start']


def test_retry_unsafe_states_branch_movement_and_running_rejected(setup):
    browser = owner(setup)
    (setup.root / 'queue/state/G1').write_text('ошибка Codex (G1)')
    assert action(browser, 'retry', 'G1')[0] == 409
    (setup.root / 'queue/state/G1').write_text('регрессия на воркере (G1)')
    setup.api.run = lambda args, **kw: SimpleNamespace(returncode=1 if args[0] == 'tmux' else 0, stdout='c' * 40)
    assert action(browser, 'retry', 'G1')[0] == 409
    setup.api.run = lambda args, **kw: SimpleNamespace(returncode=0, stdout=setup.commit)
    assert action(browser, 'retry', 'G1')[0] == 409
    assert not (setup.root / 'queue/state/G1.resume').exists()


def test_symlink_control_target_fails_without_writing(setup):
    browser = owner(setup)
    target = setup.root / 'outside'
    target.write_text('unchanged')
    (setup.root / 'queue/PAUSE').symlink_to(target)
    assert action(browser, 'pause')[0] == 503
    assert target.read_text() == 'unchanged'
    assert json.loads((setup.root / 'audit').read_text().splitlines()[-1])['result'] == 'failed'


def test_check_workers_uses_fresh_snapshot_no_command(setup):
    browser = owner(setup)
    response = action(browser, 'check-workers')
    assert response[0] == 200 and response[1]['status']['fresh']
    assert not setup.calls


def test_bootstrap_limit_evicts_oldest_anonymous_and_preserves_owner(setup):
    signed_in = owner(setup)
    oldest = Browser(setup.api)
    newest = None
    for _ in range(1022):
        newest = Browser(setup.api)
    assert len(setup.api.sessions) == 1024
    assert setup.api.dispatch('GET', '/session', {'x-ops-transport': 'test-transport'})[0] == 200
    assert len(setup.api.sessions) == 1024
    # The old page's bearer and CSRF were revoked; newer pages and owner remain.
    assert oldest.request('POST', '/auth/code/request')[0] == 403
    assert newest.request('POST', '/auth/code/request')[0] == 200
    assert signed_in.request('GET', '/status')[0] == 200
    setup.now[0] += 1801
    assert setup.api.dispatch('GET', '/session', {'x-ops-transport': 'test-transport'})[0] == 200
    assert len(setup.api.sessions) == 1


def test_session_cap_never_evicts_authenticated_owner(setup):
    signed_in = owner(setup)
    # Simulate an already full authenticated pool without creating real logins.
    sample = next(iter(setup.api.sessions.values()))
    for index in range(1023):
        setup.api.sessions[f'fixture-{index}'] = dict(sample)
    assert setup.api.dispatch('GET', '/session', {'x-ops-transport': 'test-transport'})[0] == 429
    assert len(setup.api.sessions) == 1024
    assert signed_in.request('GET', '/status')[0] == 200


def test_transport_key_permissions_and_reuse(tmp_path):
    path = tmp_path / 'transport'
    first = get_transport_key(path)
    assert len(first) == 64 and get_transport_key(path) == first
    assert os.stat(path).st_mode & 0o777 == 0o600
    path.chmod(0o644)
    with pytest.raises(ValueError):
        get_transport_key(path)


def test_retry_does_not_reuse_previous_commit_after_incomplete_fix(setup):
    browser = owner(setup)
    (setup.root / 'queue/state/G1').write_text('критик (Ася): G1-FIX')
    (setup.root / 'fixes/pipeline.log').write_text(
        '10:00:00 [очередь] коммит bbbbbbb на feat/g1\n'
        '11:00:00 [очередь] старт G1-FIX на feat/g1-fix (поверх feat/g1)\n')
    assert action(browser, 'retry', 'G1')[0] == 409
    assert not (setup.root / 'queue/state/G1.resume').exists()


@pytest.mark.parametrize('action_value,line_value', [([], 'shield'), ('pause', {}), (None, 'shield')])
def test_malformed_control_types_audited_without_mutation(setup, action_value, line_value):
    browser = owner(setup)
    assert action(browser, action_value, line=line_value)[0] == 400
    assert not setup.calls
    assert not (setup.root / 'queue/PAUSE').exists()
    assert json.loads((setup.root / 'audit').read_text().splitlines()[-1])['result'] == 'failed'


def test_green_dev_review_cannot_be_approved_as_pause(setup):
    browser = owner(setup)
    (setup.root / 'queue/state/G1').write_text('готово (bbbbbbb), Ярик: РЕКОМЕНДУЮ В DEV')
    (setup.root / 'queue/state/REVIEW').write_text('ждёт ревью архитектора')
    assert action(browser, 'approve', 'G1')[0] == 409
    assert not (setup.root / 'queue/state/G1.approved').exists()


def test_smeta_retry_uses_its_own_repository_and_log_tag(setup):
    setup.api.repo_by_line = {'shield': setup.root / 'shield-repo', 'smeta': setup.root / 'smeta-repo'}
    browser = owner(setup)
    (setup.root / 'fixes/pipeline.log').write_text(
        '10:00:00 [смета] коммит bbbbbbb на feat/g1\n'
        '11:00:00 [очередь] коммит aaaaaaa на feat/g1-fix\n')
    assert action(browser, 'retry', 'G1', line='smeta')[0] == 200
    assert setup.calls[-2][0][:3] == ['git', '-C', str(setup.root / 'smeta-repo')]
    assert setup.calls[-2][0][-1] == 'refs/heads/feat/g1^{commit}'
    assert (setup.root / 'queue-smeta/state/G1.resume').read_text() == setup.commit + '\n'
    assert not (setup.root / 'queue/state/G1.resume').exists()


def test_http_local_cookie_retains_strict_same_site_without_secure(setup):
    browser = Browser(setup.api, local=True)
    assert 'HttpOnly' in browser.last_cookie
    assert 'SameSite=Strict' in browser.last_cookie
    assert '; Secure' not in browser.last_cookie


def test_awaiting_start_server_checks_fresh_collector_without_script(setup):
    from ops_watch import Collector
    s = setup
    collector = Collector(s.root, clock=lambda: s.now[0], processes=lambda: [], tmux=lambda: {},
                          tcp=lambda *_: True, repo_by_line=s.api.repo_by_line)
    s.api.collector = collector
    browser = owner(s)
    status, body, _ = action(browser, 'start', line='smeta')
    assert status == 200
    assert body['ok'] is False and body['outcome'] == 'deferred'
    assert 'слияния стопки щита' in body['message']
    assert not s.calls
    assert json.loads((s.root / 'audit').read_text().splitlines()[-1])['result'] == 'deferred'
    # Ready after preparation: a fresh read must unblock without waiting for cache TTL.
    (s.api.repo_by_line['smeta'] / '.git').mkdir(parents=True)
    (s.root / 'queue-smeta/state/BASE').write_text('smeta/base')
    assert action(browser, 'start', line='smeta')[1]['ok'] is True
    assert len(s.calls) == 1


@pytest.mark.parametrize('name,circle', [('start', None), ('approve', 'REVIEW'), ('retry', 'G1')])
def test_hold_blocks_every_start_path_before_mutation(setup, name, circle):
    s = setup
    browser = owner(s)
    reason = 'Линия ждёт слияния стопки щита'
    (s.root / 'queue-smeta/HOLD').write_text(reason)
    status, body, _ = action(browser, name, circle, line='smeta')
    assert status == 200 and body == {'ok': False, 'outcome': 'deferred', 'message': reason}
    assert not s.calls
    assert not (s.root / 'queue-smeta/state/REVIEW.approved').exists()
    assert not (s.root / 'queue-smeta/state/G1.resume').exists()


@pytest.mark.parametrize('stream', ['stdout', 'stderr'])
def test_script_preparation_refusal_is_readable_notice(setup, stream):
    s = setup
    browser = owner(s)
    reason = 'линия «Смета» ещё не подготовлена: ждёт слияния стопки щита в dev (запуск: dcm-qa/lane2-start.sh)'
    s.api.run = lambda *args, **kw: SimpleNamespace(returncode=1, stdout=reason + '\n' if stream == 'stdout' else '',
                                                  stderr=reason + '\n' if stream == 'stderr' else '')
    status, body, _ = action(browser, 'start', line='smeta')
    assert status == 200
    assert body == {'ok': False, 'outcome': 'deferred', 'message': reason}
    assert 'error' not in body


def test_unexpected_script_failure_remains_an_error(setup):
    s = setup
    browser = owner(s)
    s.api.run = lambda *args, **kw: SimpleNamespace(returncode=2, stdout='private debug', stderr='traceback')
    status, body, _ = action(browser, 'start', line='smeta')
    assert status == 503 and body == {'error': 'Не удалось запустить очередь'}


@pytest.mark.parametrize('action', ['start', 'retry', 'approve'])
def test_active_queue_blocks_start_paths_before_control_files_or_script(setup, action):
    s = setup
    # A queue process counts even when tmux is absent.
    s.api.collector.snapshot = lambda **kw: {'lines': [{'id': 'shield', 'status': 'running',
                                                       'tmux': False, 'processes': {'queue': True}}]}
    browser = Browser(s.api)
    browser.login(s.telegram)
    s.calls.clear()
    status, body, _ = browser.request('POST', '/action', {'line': 'shield', 'action': action,
                                                       'circle': 'G1', 'confirmed': True})
    assert status == 200 and body['outcome'] == 'deferred'
    assert 'Очередь уже идёт' in body['message']
    assert not s.calls
    assert not (s.root / 'queue/state/G1.resume').exists()
    assert not (s.root / 'queue/state/G1.approved').exists()
