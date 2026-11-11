import assert from 'node:assert/strict';
import test from 'node:test';
import { createRareGesture, advanceRareGesture } from '../src/components/office/heroTiming';

test('rare gestures start 3–5 minutes apart, independent of pose or status changes', () => {
  const clock = createRareGesture(() => 0.5);
  assert.equal(clock.next, 240);
  assert.equal(advanceRareGesture(clock, 239, true), false);
  assert.equal(advanceRareGesture(clock, 240, true, () => 0), true);
  assert.equal(advanceRareGesture(clock, 241, false), true);
  assert.equal(advanceRareGesture(clock, 243, true), false);
  assert.equal(advanceRareGesture(clock, 419, true), false);
  assert.equal(advanceRareGesture(clock, 420, true, () => 1), true);
  assert.equal(clock.next, 720);
});

test('a review gesture waits until the reviewer is working', () => {
  const clock = createRareGesture(() => 0);
  assert.equal(advanceRareGesture(clock, 300, false), false);
  assert.equal(advanceRareGesture(clock, 400, true, () => 0), true);
  assert.equal(clock.next, 580);
  assert.equal(advanceRareGesture(clock, 579, true), false);
});
