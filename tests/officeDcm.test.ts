import test from 'node:test';
import assert from 'node:assert/strict';
import { publicDcm } from '../src/lib/officeDcm';

const now = Date.parse('2026-11-01T18:00:00Z');
test('DCM public response defaults and stale bridge failure expires', () => {
  assert.deepEqual(publicDcm(null, now), { bugCount: null, bugTitle: null, regression: { status: 'unknown', timestamp: null, fresh: false } });
  const input = { bugCount: 18, bugTitle: '🐞 B1: Окно молчит', regression: { status: 'fail', timestamp: '2026-11-01T17:30:00Z', fresh: true }, raw: '/private' };
  const result = publicDcm(input, now);
  assert.equal(result.bugCount, 18);
  assert.equal(result.bugTitle, input.bugTitle);
  assert.equal(result.regression.fresh, true);
  assert.equal(publicDcm(input, now + 1).regression.fresh, false);
  assert.equal('raw' in result, false);
});

test('DCM public boundary rejects malformed fields and private text', () => {
  for (const bugTitle of ['🐞 B1: /home/q/private', '🐞 B1: user@example.org', '🐞 B1: <script>', '🐞 B1: +79991234567']) {
    assert.equal(publicDcm({ bugCount: -1, bugTitle, regression: { status: 'FAIL', timestamp: 'garbage', fresh: true } }, now).bugTitle, null);
  }
  assert.equal(publicDcm({ bugCount: NaN }).bugCount, null);
  assert.equal(publicDcm({ regression: { status: 'fail', timestamp: '2026-11-01T19:00:00Z', fresh: true } }, now).regression.fresh, false);
});
