import assert from 'node:assert/strict';
import test from 'node:test';
import { OFFICE_LAYOUT, DEFAULT_OFFICE_THEME, officeHome, dcmRegression, KITCHEN_PLACES } from '../src/components/office/officeLayout';
import { loftRoute, isLoftWalkable } from '../src/components/office/officeNavigation';

test('loft owns homes by name, cyber keeps persisted positions', () => {
  assert.deepEqual(officeHome('loft', { name: '  ЛЕХА ', positionX: 1, positionY: 2 }), OFFICE_LAYOUT.heroes['Лёха']);
  assert.deepEqual(officeHome('cyber', { name: 'Лёха', positionX: 1, positionY: 2 }), { x: 1, y: 2 });
  assert.deepEqual(officeHome('loft', { name: 'Новый', positionX: 500, positionY: 575 }), { x: 500, y: 575 });
});

test('panel uses only the latest explicit regression result from Motya', () => {
  assert.equal(dcmRegression([{ name: 'Мотя', statusText: 'старый FAIL · Последняя регрессия: зелёная' }]), 'green');
  assert.equal(dcmRegression([{ name: 'Мотя', statusText: 'Последняя регрессия: ⚠ красная' }]), 'red');
  assert.equal(dcmRegression([{ name: 'Ася', statusText: 'Последняя регрессия: зелёная' }]), 'unknown');
  assert.equal(dcmRegression([{ name: 'Мотя', statusText: 'Нет активного задания' }]), 'unknown');
});

test('every home reaches all kitchen places and returns without crossing furniture', () => {
  const homes = Object.values(OFFICE_LAYOUT.heroes);
  for (const home of homes) {
    const others = homes.filter(h => h !== home);
    for (const destination of KITCHEN_PLACES) {
      for (const [from, to] of [[home, destination], [destination, home]]) {
        const route = loftRoute(from, to, others);
        assert.ok(route.length, `No route ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
        assert.deepEqual(route.at(-1), to);
        let previous = from;
        for (const p of route) {
          const steps = Math.ceil(Math.hypot(p.x - previous.x, p.y - previous.y));
          for (let i = 0; i <= steps; i++) {
            const sample = { x: previous.x + (p.x - previous.x) * i / (steps || 1), y: previous.y + (p.y - previous.y) * i / (steps || 1) };
            assert.ok(isLoftWalkable(sample), `Furniture crossed at ${JSON.stringify(sample)}`);
            assert.ok(others.every(h => Math.hypot(h.x - sample.x, h.y - sample.y) >= 30), 'Hero crossed');
          }
          previous = p;
        }
      }
    }
  }
});

test('occupied kitchen places can be bypassed, including the cooler approach', () => {
  const home = OFFICE_LAYOUT.heroes['Ярик'];
  const occupied = [KITCHEN_PLACES[0], KITCHEN_PLACES[1]];
  const route = loftRoute(home, KITCHEN_PLACES[2], occupied);
  assert.ok(route.length);
  assert.equal(loftRoute(home, KITCHEN_PLACES[0], occupied).length, 0, 'Occupied goal must not be entered');
});

test('art is the default, uses feet anchors and corrects the doorway home', () => {
  assert.equal(DEFAULT_OFFICE_THEME, 'art');
  assert.deepEqual(officeHome('art', { name: '  ЛЕХА ', positionX: 1, positionY: 2 }), { x: 271, y: 546 });
  assert.deepEqual(officeHome('art', { name: 'Саня' }), { x: 677.4, y: 493 });
  assert.deepEqual(officeHome('art', { name: 'Новый', positionX: 600, positionY: 420 }), { x: 600, y: 420 });
});
