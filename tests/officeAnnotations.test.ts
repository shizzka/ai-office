import test from 'node:test';
import assert from 'node:assert/strict';
import { placeAnnotation, overlaps, heroNamePosition, heroStatusColor, type Rect } from '../src/components/office/officeAnnotations';
import { ART_OFFICE_LAYOUT, OFFICE_LAYOUT } from '../src/components/office/officeLayout';

test('all ten enlarged heroes have separate cards above/around their silhouettes', () => {
  const homes = Object.values(OFFICE_LAYOUT.heroes);
  const occupied: Rect[] = homes.map(h => ({ x: h.x - 28.8, y: h.y - 101.7, width: 57.6, height: 86.4 }));
  for (const h of homes) {
    const rect = placeAnnotation({ x: h.x - 65, y: h.y - 180, width: 130, height: 70 }, occupied, 960, 600);
    assert.ok(occupied.every(other => !overlaps(rect, other)), JSON.stringify(rect));
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 960 && rect.y + rect.height <= 600);
    occupied.push(rect);
  }
});

test('moving hero card avoids an occupied preferred row at the canvas edge', () => {
  const obstacles = [{ x: 820, y: 100, width: 135, height: 65 }, { x: 830, y: 180, width: 58, height: 87 }];
  const rect = placeAnnotation({ x: 850, y: 100, width: 130, height: 65 }, obstacles, 960, 600);
  assert.ok(obstacles.every(other => !overlaps(rect, other)));
  assert.ok(rect.x + rect.width <= 960);
});

// Source art uses wider 96×100 cells and true feet rather than legacy anchors.
test('art status cards clear every hero cell, including the owner and Marina, and each other', () => {
  const homes = Object.values(ART_OFFICE_LAYOUT.heroes);
  const occupied: Rect[] = homes.map(h => ({ x: h.x - 43.2, y: h.y - 86.4, width: 86.4, height: 90 }));
  for (const h of homes) {
    const card = placeAnnotation({ x: h.x - 70, y: h.y - 170, width: 140, height: 75 }, occupied, 960, 600);
    assert.ok(occupied.every(other => !overlaps(card, other)), JSON.stringify(card));
    occupied.push(card);
  }
});


test('name follows feet and the current head pose without collision displacement', () => {
  const initial = heroNamePosition({ x: 291, y: 550 }, -72, 1.53, 18);
  const moved = heroNamePosition({ x: 501, y: 430 }, -72, 1.53, 18);
  assert.equal(moved.x - initial.x, 210);
  assert.equal(moved.y - initial.y, -120);
  assert.equal(initial.y + 18 + 6, 550 - 72 * 1.53);
  const sleeping = heroNamePosition({ x: 496, y: 192 }, -14, 1.53, 18);
  const walking = heroNamePosition({ x: 496, y: 192 }, -24, 1.53, 18);
  assert.ok(sleeping.y > walking.y, 'cat plate follows its sleeping head');
});

test('compact status dots distinguish work, idle, and actual errors', () => {
  assert.equal(heroStatusColor('working'), 0x22c55e);
  assert.equal(heroStatusColor('idle'), 0x87908c);
  assert.equal(heroStatusColor('offline'), 0x87908c);
  assert.equal(heroStatusColor('working', 'Последняя регрессия: ⚠ красная'), 0xef4444);
  assert.equal(heroStatusColor('idle', 'Ошибка: нет связи'), 0xef4444);
  assert.equal(heroStatusColor('idle', 'ошибок этапов 0'), 0x87908c);
});

test('nameplates clear monitor screens with the smallest local displacement', async () => {
  const { ART_MONITORS, avoidNameMonitors } = await import('../src/components/office/officeAnnotations');
  for (const x of [122,291,465,749]) {
    const original = { x: x-35, y: x===749 ? 320 : 412, width: 70, height: 18 };
    const resolved = avoidNameMonitors(original, ART_MONITORS);
    assert.ok(ART_MONITORS.every(m=>!overlaps(resolved,m)));
    assert.ok(resolved.y <= original.y, 'avoidance must never move a name into the face');
    assert.ok(Math.hypot(resolved.x-original.x,resolved.y-original.y) < 65);
  }
  const clear = {x:580,y:300,width:50,height:18};
  assert.deepEqual(avoidNameMonitors(clear,ART_MONITORS),clear);
});
