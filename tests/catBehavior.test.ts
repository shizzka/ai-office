import test from 'node:test';
import assert from 'node:assert/strict';
import layout from '../office-art/layout-ai.json';
import { advanceCats, createCat, catHome, catKeyboard, type DeskPresence } from '../src/components/office/catBehavior';
import { isArtWalkable } from '../src/components/office/aiOfficeNavigation';
const people = (): DeskPresence[] => Object.keys(layout.keyboards).map(name => ({ name, position: { ...layout.heroes[name as keyof typeof layout.heroes] } }));
const cats = () => ['Коржик','Масяня'].map(n => createCat(n, layout.heroes[n as 'Коржик' | 'Масяня']));
function away(heroes: DeskPresence[], name: string) { heroes.find(h => h.name === name)!.position = { x: 875, y: 468 }; }

test('cats sleep in separate reserved beds while every keyboard has a physically present hero', () => {
  const pair = cats(); advanceCats(pair, people(), 300, 300);
  assert.ok(pair.every(c => c.phase === 'home' && c.desk === null));
});
test('only a vacant desk is claimed immediately, arrival is exactly on its keyboard', () => {
  const pair = cats(), heroes = people(); away(heroes, 'Лёха');
  advanceCats(pair, heroes, 0, 0);
  assert.equal(pair[0].desk, 'Лёха'); assert.equal(pair[0].phase, 'walking'); assert.equal(pair[1].desk, null);
  const events = advanceCats(pair, heroes, 30, 30);
  assert.deepEqual(pair[0].position, catKeyboard('Лёха')); assert.equal(pair[0].phase, 'keyboard');
  assert.equal(events[0].message, '🐈 Коржик лёг на клавиатуру Лёхи');
});
test('cat jumps off on owner return and walks back to a free bed', () => {
  const pair = cats(), heroes = people(); away(heroes, 'Лёха'); advanceCats(pair, heroes, 30, 30);
  const previous = { ...pair[0].position };
  advanceCats(pair, people(), .05, 31);
  assert.equal(pair[0].desk, null); assert.equal(pair[0].phase, 'returning');
  assert.ok(Math.hypot(pair[0].position.x - previous.x, pair[0].position.y - previous.y) <= 95 * .05 + 1e-6);
  advanceCats(pair, people(), 30, 61);
  assert.equal(pair[0].phase, 'home'); assert.deepEqual(pair[0].position, pair[0].home);
});
test('two cats never reserve the same desk, including mid-walk retargeting', () => {
  const pair = cats(), heroes = people(); away(heroes, 'Лёха'); away(heroes, 'Ася');
  for (let i = 0; i < 800; i++) {
    if (i === 50) heroes.find(h => h.name === 'Лёха')!.position = { ...layout.heroes['Лёха'] };
    if (i === 70) away(heroes, 'Ярик');
    advanceCats(pair, heroes, .05, i * .05);
    const claimed = pair.flatMap(c => c.desk ? [c.desk] : []);
    assert.equal(claimed.length, new Set(claimed).size);
    for (const cat of pair) if (cat.desk) assert.ok(heroes.filter(h => h.name === cat.desk).every(h => Math.hypot(h.position.x-layout.heroes[cat.desk as keyof typeof layout.heroes].x,h.position.y-layout.heroes[cat.desk as keyof typeof layout.heroes].y)>=36));
  }
  assert.ok(pair.every(c => c.phase === 'keyboard'));
});
test('keyboard events are limited to one per 30 seconds per cat', () => {
  const pair = cats(), heroes = people(); away(heroes, 'Лёха');
  assert.equal(advanceCats(pair, heroes, 30, 30).length, 1);
  advanceCats(pair, people(), 30, 31);
  assert.equal(advanceCats(pair, heroes, 30, 32).length, 0);
  advanceCats(pair, people(), 30, 60);
  assert.equal(advanceCats(pair, heroes, 30, 61).length, 1);
});
test('every mapped physical keyboard can be reached and released', () => {
  for (const name of Object.keys(layout.keyboards)) {
    const pair = cats(), heroes = people(); away(heroes, name);
    advanceCats(pair, heroes, 30, 30);
    assert.equal(pair[0].desk, name); assert.equal(pair[0].phase, 'keyboard');
    assert.deepEqual(pair[0].position, catKeyboard(name));
    advanceCats(pair, people(), 30, 60);
    assert.equal(pair[0].phase, 'home'); assert.deepEqual(pair[0].position, pair[0].home);
  }
});

test('return during the final climb preserves the jump-down waypoint', () => {
  const pair = cats(), heroes = people(); away(heroes, 'Лёха');
  for (let i = 0; i < 500 && !(pair[0].phase === 'walking' && pair[0].route.length === 1); i++) advanceCats(pair, heroes, .05, i * .05);
  assert.equal(pair[0].route.length, 1);
  advanceCats(pair, people(), 0, 26);
  assert.equal(pair[0].desk, null);
  assert.deepEqual(pair[0].route[0], layout.heroes['Лёха']);
  advanceCats(pair, people(), 30, 56);
  assert.deepEqual(pair[0].position, pair[0].home);
});

test('cats descend via the sill edge and floor landing, then climb into a free bed', () => {
  const pair = cats(), heroes = people(); away(heroes, 'Лёха');
  advanceCats(pair, heroes, 0, 0);
  assert.deepEqual(pair[0].route.slice(0, 2), [...catHome(pair[0]).access, catHome(pair[0]).exit]);
  assert.ok(isArtWalkable(catHome(pair[0]).exit));
  advanceCats(pair, heroes, 30, 30);
  advanceCats(pair, people(), 0, 31);
  assert.deepEqual(pair[0].route.slice(-3), [catHome(pair[0]).exit, ...[...catHome(pair[0]).access].reverse(), pair[0].home]);
  advanceCats(pair, people(), 30, 61);
  assert.equal(pair[0].phase, 'home');
});

test('owner return and retargeting mid-descent preserve the complete landing route', () => {
  for (const retarget of [false, true]) {
    const pair = cats(), heroes = people(); away(heroes, 'Лёха');
    advanceCats(pair, heroes, .1, .1);
    heroes.find(h => h.name === 'Лёха')!.position = { ...layout.heroes['Лёха'] };
    if (retarget) away(heroes, 'Ярик');
    const before = { ...pair[0].position };
    advanceCats(pair, heroes, 0, .2);
    assert.deepEqual(pair[0].position, before, 'no jump by replanning');
    assert.deepEqual(pair[0].route.slice(0, 2), [...catHome(pair[0]).access, catHome(pair[0]).exit]);
    advanceCats(pair, heroes, 30, 31);
    assert.equal(pair[0].phase, retarget ? 'keyboard' : 'home');
    assert.deepEqual(pair[0].position, retarget ? catKeyboard('Ярик') : pair[0].home);
  }
});

test('both cats use their current bed landing and return to distinct free beds', () => {
  const pair = cats(), heroes = people(); away(heroes, 'Лёха'); away(heroes, 'Ася');
  assert.notDeepEqual(pair[0].home, pair[1].home);
  assert.equal(catHome(pair[0]).kind, 'windowsill-bed');
  assert.equal(catHome(pair[1]).kind, 'floor-bed');
  advanceCats(pair, heroes, 0, 0);
  for (const cat of pair) {
    const home = catHome(cat);
    assert.deepEqual(cat.route.slice(0, 2), [...home.access, home.exit]);
    assert.ok(isArtWalkable(home.exit));
    assert.deepEqual(cat.home, layout.heroes[cat.name as keyof typeof layout.heroes]);
  }
  advanceCats(pair, heroes, 30, 30);
  assert.ok(pair.every(c => c.phase === 'keyboard'));
  advanceCats(pair, people(), 0, 31);
  for (const cat of pair) {
    const home = catHome(cat);
    assert.deepEqual(cat.route.slice(-3), [home.exit, ...[...home.access].reverse(), cat.home]);
  }
  advanceCats(pair, people(), 30, 61);
  for (const cat of pair) {
    assert.equal(cat.phase, 'home'); assert.deepEqual(cat.position, catHome(cat).place);
  }
});


test('the shared desk belongs to Evgeny: one cat walks around the rack, releases and returns to a free bed', () => {
  for (const name of ['Коржик', 'Масяня']) {
    const cat = createCat(name, layout.heroes[name as 'Коржик' | 'Масяня']);
    const heroes = people();
    advanceCats([cat], heroes, 30, 30);
    assert.equal(cat.phase, 'home', 'present owner keeps his keyboard');
    away(heroes, 'Евгений');
    advanceCats([cat], heroes, 0, 31);
    assert.equal(cat.desk, 'Евгений');
    const floorRoute = cat.route.slice(catHome(cat).access.length, -1);
    assert.deepEqual(floorRoute.at(-1), layout.heroes['Евгений']);
    for (let k = 1; k < floorRoute.length; k++) {
      const a = floorRoute[k-1], b = floorRoute[k];
      const steps = Math.ceil(Math.hypot(b.x-a.x, b.y-a.y)*2);
      for (let i = 0; i <= steps; i++) {
        const p = { x: a.x+(b.x-a.x)*i/steps, y: a.y+(b.y-a.y)*i/steps };
        assert.ok(isArtWalkable(p));
        assert.ok(!(p.x>=646 && p.x<=731 && p.y>=80 && p.y<=276), 'no rack jump');
      }
    }
    const events = advanceCats([cat], heroes, 30, 61);
    assert.equal(cat.phase, 'keyboard');
    assert.deepEqual(cat.position, catKeyboard('Евгений'));
    assert.match(events[0].message, /клавиатуру Евгения$/);
    advanceCats([cat], people(), 30, 91);
    assert.equal(cat.phase, 'home');
    assert.deepEqual(cat.position, catHome(cat).place);
  }
  const pair = cats(), heroes = people(); away(heroes, 'Евгений');
  advanceCats(pair, heroes, 30, 30);
  assert.equal(pair.filter(c=>c.desk === 'Евгений').length, 1);
  assert.equal(pair[1].phase, 'home');
  advanceCats(pair, people(), 30, 60);
  assert.deepEqual(pair.map(c=>c.position), pair.map(c=>catHome(c).place));
});

test('all three beds are shared: a cat returns to the nearest free one and skips an occupied nearest bed', () => {
  const pair = cats();
  pair[0].position = {x:781,y:450}; pair[0].phase = 'returning'; pair[0].route = [];
  advanceCats(pair, people(), 30, 30);
  assert.equal(pair[0].bed, 'qa');
  assert.deepEqual(pair[0].position, layout.cat_beds.qa.place);
  pair[1].position = {x:781,y:450}; pair[1].phase = 'returning'; pair[1].route = [];
  advanceCats(pair, people(), 0, 31);
  assert.notEqual(pair[1].bed, 'qa', 'closest bed is already reserved');
  advanceCats(pair, people(), 30, 61);
  assert.equal(pair[1].phase, 'home');
  assert.notEqual(pair[0].bed, pair[1].bed);
});

test('simultaneous returns reserve different beds before walking, including interrupted climbs', () => {
  const pair = cats();
  for (let cycle=0; cycle<8; cycle++) {
    for (const cat of pair) { cat.phase='returning'; cat.desk=null; cat.position={x:781,y:450}; cat.route=[]; }
    for (let i=0;i<400;i++) {
      advanceCats(pair, people(), .05, cycle*30+i*.05);
      const reserved=pair.filter(c=>!c.desk && ['home','returning'].includes(c.phase)).map(c=>c.bed);
      assert.equal(new Set(reserved).size,reserved.length);
    }
    assert.ok(pair.every(c=>c.phase==='home'));
  }
});
