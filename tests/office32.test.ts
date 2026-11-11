import test from 'node:test';
import assert from 'node:assert/strict';
import { executePultAction, startBlockReason } from '../src/lib/pult/actions';
import type { PultLine } from '../src/lib/pult/types';

const reason = 'Линия ждёт слияния стопки щита в dev';
const line: PultLine = { id: 'smeta', name: 'Смета', status: 'awaiting-start', reason,
  circle: null, stage: 'Ожидает запуска', lastEventAt: null, idleSeconds: 0,
  tmux: false, processes: { codex: false, worker: false, queue: false }, queue: [], review: [], lastRegression: null };
const command = { line: 'smeta', action: 'start', label: 'Запустить очередь' } as const;

test('awaiting line explains why start is blocked and sends no action request', async () => {
  assert.equal(startBlockReason('start', line), reason);
  let calls = 0;
  const result = await executePultAction(command, line, async () => { calls++; return { ok: true }; });
  assert.equal(calls, 0);
  assert.equal(result.message, reason);
  assert.equal(result.ok, false);
});

test('script refusal reaches the user as the server message without a success notice', async () => {
  const message = 'линия «Смета» ещё не подготовлена: ждёт слияния стопки щита в dev';
  const calls: unknown[] = [];
  const result = await executePultAction(command, { ...line, status: 'stopped' }, async (path, body) => {
    calls.push([path, body]);
    return { ok: false, outcome: 'deferred', message };
  });
  assert.deepEqual(calls, [['action', { line: 'smeta', action: 'start', confirmed: true }]]);
  assert.equal(result.message, message);
  assert.equal(result.ok, false);
});

test('a prepared stopped line can start; pause is available while awaiting', async () => {
  assert.equal(startBlockReason('start', { ...line, status: 'stopped' }), '');
  assert.equal(startBlockReason('pause', line), '');
  const result = await executePultAction(command, { ...line, status: 'stopped' }, async () => ({ ok: true }));
  assert.equal(result.ok, true);
  assert.match(result.message, /запрос принят/);
});
