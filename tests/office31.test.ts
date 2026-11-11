import test from 'node:test';
import assert from 'node:assert/strict';
import http, { type IncomingMessage } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signPeer, verifyPeer } from '../src/lib/pult/transport';
import { peerFromSocket, installPultPeerProof } from '../src/lib/pult/peer';

const key = 'office31-fixture-transport-key-for-tests-only';
const at = Date.now();
function request(address: string, headers: Record<string, string> = {}) {
  return { method: 'GET', url: '/pult/api/status', socket: { remoteAddress: address },
    headers: { host: '127.0.0.1:3000', ...headers } } as unknown as IncomingMessage;
}

test('Pult local read uses socket address; forged Host and proxy headers grant nothing', () => {
  assert.equal(peerFromSocket(request('127.0.0.1')).local, true);
  assert.equal(peerFromSocket(request('192.168.21.102')).local, false);
  assert.equal(peerFromSocket(request('127.0.0.1', { 'x-forwarded-for': '127.0.0.1' })).local, false);
  assert.equal(peerFromSocket(request('127.0.0.1', { host: 'pult.example.com' })).local, false);
  assert.equal(peerFromSocket(request('192.168.21.102', { 'x-forwarded-proto': 'https' })).secure, false);
});

test('Pult proof rejects tampering, expiry, other URL, method and host', () => {
  const proof = { ...peerFromSocket(request('127.0.0.1')), at };
  const h = new Headers({ host: proof.host, 'x-pult-peer-proof': signPeer(proof, key) });
  assert.equal(verifyPeer(h, 'GET', proof.target, key, at)?.local, true);
  assert.equal(verifyPeer(h, 'POST', proof.target, key, at), null);
  assert.equal(verifyPeer(h, 'GET', '/pult/api/session', key, at), null);
  assert.equal(verifyPeer(h, 'GET', proof.target, key, at + 31_000), null);
  assert.equal(verifyPeer(h, 'GET', proof.target, key + 'bad', at), null);
  h.set('host', 'attacker.example');
  assert.equal(verifyPeer(h, 'GET', proof.target, key, at), null);
});

test('Pult HTTP hook overwrites client proof, preserves unrelated request headers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'office31-peer-'));
  const before = process.env.OPS_TRANSPORT_KEY_FILE;
  process.env.OPS_TRANSPORT_KEY_FILE = join(dir, 'key');
  writeFileSync(process.env.OPS_TRANSPORT_KEY_FILE, key, { mode: 0o600 });
  installPultPeerProof();
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.headers));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}`;
    const headers = await (await fetch(url + '/pult/api/status', {
      headers: { 'x-pult-peer-proof': 'forged', 'x-forwarded-for': '127.0.0.1' },
    })).json();
    const h = new Headers(headers);
    assert.equal(verifyPeer(h, 'GET', '/pult/api/status', key)?.local, false);
    const unrelated = await (await fetch(url + '/api/tasks', {
      headers: { 'x-pult-peer-proof': 'untouched' },
    })).json();
    assert.equal(unrelated['x-pult-peer-proof'], 'untouched');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (before === undefined) delete process.env.OPS_TRANSPORT_KEY_FILE;
    else process.env.OPS_TRANSPORT_KEY_FILE = before;
    rmSync(dir, { recursive: true });
  }
});
