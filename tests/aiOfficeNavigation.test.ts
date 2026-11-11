import assert from 'node:assert/strict';
import test from 'node:test';
import layout from '../office-art/layout-ai.json';
import { ART_HOMES, ART_KITCHEN_PLACES, artFootprintsOverlap, artRoute, isArtWalkable } from '../src/components/office/aiOfficeNavigation';
import type { Point } from '../src/components/office/officeLayout';
import { officeHome, officeFixture, OFFICE_LAYOUT } from '../src/components/office/officeLayout';

// Independent artwork landmarks: paths must never enter these furniture
// interiors, even if the floor mesh is accidentally expanded later.
const furniture = [
  [75, 258, 550, 362], [68, 390, 545, 528],
  [135, 330, 232, 369], [701, 420, 804, 438], // cable spools + chair legs // desk banks
  [735, 140, 895, 255], // shared upper desk and chair
  [646, 80, 731, 276], [701, 301, 804, 430], // server + right desk
  [808, 391, 874, 438], [807, 379, 885, 443], // bed + bowl
  [649, 502, 748, 565], [754, 480, 847, 568], // tripod table + door
  [891, 370, 945, 467], [895, 496, 950, 538], // coffee counter + side table
];
function verify(from: Point, to: Point, blockers: readonly Point[] = []) {
  const route = artRoute(from, to, blockers);
  assert.ok(route.length, `No route ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
  assert.deepEqual(route.at(-1), to);
  let previous = from;
  for (const waypoint of route) {
    const steps = Math.max(1, Math.ceil(Math.hypot(waypoint.x - previous.x, waypoint.y - previous.y) * 2));
    for (let i = 0; i <= steps; i++) {
      const sample = { x: previous.x + (waypoint.x - previous.x) * i / steps, y: previous.y + (waypoint.y - previous.y) * i / steps };
      assert.ok(isArtWalkable(sample), `Off floor: ${JSON.stringify(sample)}`);
      assert.ok(!furniture.some(([l, t, r, b]) => sample.x >= l && sample.x <= r && sample.y >= t && sample.y <= b), `Furniture crossed: ${JSON.stringify(sample)}`);
      assert.ok(blockers.every(b => Math.hypot((sample.x - b.x) / 31, (sample.y - b.y) / 10) >= 1 - 1e-9), `Occupied feet crossed: ${JSON.stringify(sample)}`);
    }
    previous = waypoint;
  }
  return route;
}

test('all nine human art homes reach every kitchen place and return around occupied homes', () => {
  const homes = Object.values(ART_HOMES);
  assert.equal(homes.length, 9);
  for (const home of homes) {
    const others = homes.filter(h => h !== home);
    for (const destination of ART_KITCHEN_PLACES) {
      verify(home, destination, others);
      verify(destination, home, others);
    }
  }
});

test('all human homes use canonical floor anchors clear of furniture, including stationary humans', () => {
  for (const [name, p] of Object.entries(layout.heroes)) {
    if (['Коржик','Масяня'].includes(name)) continue;
    assert.ok(isArtWalkable(p), `${name}: feet must be on floor`);
    assert.ok(!furniture.some(([l,t,r,b]) => p.x >= l && p.x <= r && p.y >= t && p.y <= b), `${name}: furniture under feet`);
    if (name in ART_HOMES) assert.deepEqual(ART_HOMES[name as keyof typeof ART_HOMES], p);
  }
  // Spools below the tool desk reach y369; boots stand below them.
  assert.ok(layout.heroes['Иваныч'].y >= 376);
  assert.ok(layout.heroes['Марина'].y >= 444, 'clear chair legs');
  const humanHomes = Object.entries(layout.heroes).filter(([name]) => !(['Коржик','Масяня'].includes(name)));
  for (const [i, [name, p]] of humanHomes.entries()) {
    for (const [other, q] of humanHomes.slice(i + 1)) {
      assert.ok(Math.hypot(p.x-q.x, (p.y-q.y)*3.1) >= 64, `${name}/${other}: enlarged bodies need space`);
    }
  }
});

test('Marina owns the QA desk on the floor near the owner, with stale DB coordinates ignored', () => {
  const marina = officeHome('art', { name: ' Марина ', positionX: 572, positionY: 550 });
  assert.deepEqual(marina, {x:752,y:450});
  assert.ok(Math.hypot(marina.x-layout.heroes.Евгений.x,marina.y-layout.heroes.Евгений.y)<210);
  assert.ok('Марина' in layout.keyboards);
  assert.ok(!('Люда' in layout.heroes) && !('Шарик' in layout.heroes));
  const others = Object.entries(ART_HOMES).filter(([name]) => name !== 'Марина').map(([,p]) => p);
  for (const destination of ART_KITCHEN_PLACES) { verify(marina,destination,others); verify(destination,marina,others); }
});

test('waiting places have distinct feet footprints and preserve the cooler anchor', () => {
  assert.deepEqual(ART_KITCHEN_PLACES[0], layout.destinations.cooler);
  assert.ok(ART_KITCHEN_PLACES.length >= 4);
  for (const [index, p] of ART_KITCHEN_PLACES.entries()) {
    assert.ok(isArtWalkable(p));
    for (const q of ART_KITCHEN_PLACES.slice(index + 1)) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 40);
  }
});

test('dynamic blockers force a detour and occupied endpoints cannot be entered', () => {
  const start = { x: 600, y: 400 }, goal = { x: 660, y: 450 }, blocker = { x: 630, y: 425 };
  assert.equal(artRoute(start, goal).length, 1);
  assert.ok(verify(start, goal, [blocker]).length > 1);
  assert.deepEqual(artRoute(start, goal, [goal]), []);
  assert.deepEqual(artRoute(start, goal, [start]), []);
  verify(ART_HOMES['Ярик'], ART_KITCHEN_PLACES[3], ART_KITCHEN_PLACES.slice(0, 2));
});

test('furniture, outside art, and invalid coordinates are not walkable or snapped through', () => {
  for (const p of [{ x: 150, y: 450 }, { x: 840, y: 415 }, { x: 800, y: 520 }, { x: 680, y: 520 }, { x: -1, y: 400 }, { x: 600, y: 570 }, { x: NaN, y: 420 }]) {
    assert.equal(isArtWalkable(p), false);
    assert.deepEqual(artRoute(p, ART_KITCHEN_PLACES[0]), []);
    assert.deepEqual(artRoute(ART_KITCHEN_PLACES[0], p), []);
  }
  const closedPassage = [{ x: 810, y: 471 }];
  verify(ART_HOMES['Ярик'], ART_KITCHEN_PLACES[0], closedPassage); // removed bowl opens a bypass
});

test('runtime footprint helper matches the perspective clearance used by routes', () => {
  const p = { x: 600, y: 420 };
  assert.equal(artFootprintsOverlap(p, { x: 630, y: 420 }), true);
  assert.equal(artFootprintsOverlap(p, { x: 631, y: 420 }), false);
  assert.equal(artFootprintsOverlap(p, { x: 600, y: 429 }), true);
  assert.equal(artFootprintsOverlap(p, { x: 600, y: 430 }), false);
  assert.equal(artFootprintsOverlap(p, { x: 620, y: 428 }), false);
});


test('Motya is a background fixture with no floor home, keyboard or route endpoint', () => {
  assert.ok(!('Мотя' in layout.heroes));
  assert.ok(!('Мотя' in ART_HOMES));
  assert.ok(!('Мотя' in layout.keyboards));
  const rack = officeFixture('art', ' Мотя ');
  assert.equal(rack?.kind, 'server-rack');
  assert.equal(officeFixture('loft', 'Мотя'), undefined);
  assert.ok(rack!.name_anchor.y < rack!.rect[1]);
  assert.deepEqual(artRoute({ x: 688, y: 180 }, layout.heroes['Евгений']), []);
});

test('both shared-desk homes and cat approaches bypass the rack on the floor', () => {
  const owner = layout.heroes['Евгений'], marina = layout.heroes['Марина'];
  assert.ok(owner.x >= 735 && marina.x >= 700);
  assert.ok(owner.y > 255 && owner.y < 258);
  assert.deepEqual(layout.keyboards['Евгений'], { x: 814, y: 216 });
  assert.ok(Math.hypot(owner.x-layout.heroes['Иваныч'].x, owner.y-layout.heroes['Иваныч'].y) > 500);
  for (const home of Object.values(layout.cat_beds)) {
    verify(home.exit, owner);
    verify(owner, home.exit);
  }
});

test('Sanya leaves the chair along floor behind his desk and returns without crossing its surface', () => {
  const home=layout.heroes['Саня'];
  assert.deepEqual(home,{x:677.4,y:493});
  const blockers=Object.entries(ART_HOMES).filter(([name])=>name!=='Саня').map(([,p])=>p);
  for(const destination of ART_KITCHEN_PLACES) {
    verify(home,destination,blockers); verify(destination,home,blockers);
  }
  for(const p of [{x:677,y:510},{x:620,y:540},{x:740,y:550}]) assert.equal(isArtWalkable(p),false,'desk is furniture');
});
