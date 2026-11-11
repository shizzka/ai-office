import test from 'node:test';
import assert from 'node:assert/strict';
import { canStart, queueActive, linePresentation, nextForYou, groupEvents } from '../src/lib/pult/presentation';
import { executePultAction } from '../src/lib/pult/actions';
import type { PultLine, PultSnapshot, PultEvent } from '../src/lib/pult/types';

const line: PultLine = { id: 'shield', name: 'Щит', status: 'running', circle: 'SHIELD-READ-2', stage: 'Регрессия',
  reason: '', lastEventAt: 100, idleSeconds: 1800, tmux: true, processes: { codex: false, worker: true },
  queue: [], review: [], lastRegression: null };
const snapshot = (lines: PultLine[]): PultSnapshot => ({ updatedAt: 100, lines, events: [], workers: [] });

test('running queue hides start even when Codex is inactive; stale command does not POST', async () => {
  assert.equal(canStart(line), false);
  assert.equal(canStart({ ...line, status: 'stopped', tmux: false }), false);
  assert.equal(queueActive({ ...line, tmux: false, processes: { codex: false, worker: false } }), true);
  let calls = 0;
  const result = await executePultAction({ line: 'shield', action: 'start', label: 'Запустить очередь' }, line,
    async () => { calls++; return { ok: true }; });
  assert.equal(calls, 0);
  assert.match(result.message, /уже идёт/);
  assert.equal(canStart({ ...line, status: 'stopped', tmux: false, processes: { codex: false, worker: false } }), true);
  assert.equal(canStart({ ...line, completed: true }), false);
  assert.equal(canStart({ ...line, status: 'awaiting-start', tmux: false, processes: { codex: false, worker: false } }), false);
});

test('normal regression silence is hidden; only more than twice the typical duration is shown', () => {
  assert.equal(linePresentation(line).showSilence, false);
  assert.equal(linePresentation({ ...line, idleSeconds: 4200 }).showSilence, false);
  assert.equal(linePresentation({ ...line, idleSeconds: 4201 }).showSilence, true);
  assert.equal(linePresentation({ ...line, status: 'waiting', idleSeconds: 9000 }).showSilence, false);
});

test('action badge separates running, limit, review and failure; old watcher has safe fallback', () => {
  assert.equal(linePresentation(line).attention.level, 'none');
  assert.equal(linePresentation({ ...line, status: 'waiting', stage: 'Ожидание лимита Codex' }).attention.level, 'none');
  assert.equal(linePresentation({ ...line, status: 'waiting', reason: 'Ждёт ревью архитектора' }).attention.level, 'decision');
  const stopped = linePresentation({ ...line, status: 'stopped', reason: 'Ошибка Codex' });
  assert.equal(stopped.attention.level, 'intervention');
  assert.match(stopped.attention.text, /Что делать:/);
  assert.doesNotMatch(linePresentation(line).doing, /идёт 30 мин/); // idle is not stage elapsed
});

test('next action prioritizes failures then decisions, while background green reviews do not demand clicks', () => {
  const running = { ...line, review: ['SHIELD-1'] };
  assert.match(nextForYou(snapshot([running])), /вмешательство не нужно/);
  const stopped = { ...line, status: 'stopped' as const, reason: 'Ошибка модели' };
  const review = { ...line, id: 'smeta' as const, name: 'Смета', status: 'waiting' as const, reason: 'Ревью стопки' };
  const next = nextForYou(snapshot([review, stopped]));
  assert.ok(next.indexOf('Щит:') < next.indexOf('Смета:'));
  assert.match(next, /Нужно ваше решение/);
  const view = linePresentation(line);
  assert.match(nextForYou(snapshot([{ ...line, presentation: { ...view, expectedAt: 1000 } }])), /примерно в/);
  assert.doesNotMatch(nextForYou(snapshot([{ ...line, presentation: { ...view, expectedAt: 50 } }])), /примерно в/);
});

test('only adjacent events of the same line, circle and type group; originals stay available', () => {
  const event: PultEvent = { id: '1', line: 'shield', code: 'SHIELD-1', text: 'x', humanText: 'Повтор',
    raw: 'original 1', eventType: 'worker-retry', at: 500 };
  const events = [event, { ...event, id: '2', raw: 'original 2', at: 400 },
    { ...event, id: '3', line: 'smeta' }, { ...event, id: '4' }, { ...event, id: '5', code: 'SHIELD-2' }];
  const grouped = groupEvents(events);
  assert.equal(grouped.length, 4);
  assert.deepEqual(grouped[0].entries.map(entry => entry.raw), ['original 1', 'original 2']);
  assert.equal(groupEvents([{ ...event, eventType: 'unknown', humanText: 'one' },
    { ...event, id: '2', eventType: 'unknown', humanText: 'two' }]).length, 2);
});

test('a stale start command does not run after queue completion or transition to review', async () => {
  for (const changed of [{ ...line, completed: true }, { ...line, status: 'waiting' as const, reason: 'Ждёт ревью' }]) {
    let calls = 0;
    const result = await executePultAction({ line: 'shield', action: 'start', label: 'Запустить очередь' },
      { ...changed, status: changed.completed ? 'waiting' : changed.status, tmux: false, processes: { codex: false, worker: false } },
      async () => { calls++; return { ok: true }; });
    assert.equal(calls, 0);
    assert.equal(result.ok, false);
  }
});
