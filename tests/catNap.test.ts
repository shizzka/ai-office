import test from 'node:test';
import assert from 'node:assert/strict';
import layout from '../office-art/layout-ai.json';
import { advanceCatLife, advanceCats, advanceCatVisits, CAT_NAP, catPose, catSleepZzzAlpha,
  createCat, createCatLife, startCatChase, startCatVisit, tapCat } from '../src/components/office/catBehavior';
import { sceneRandom } from '../src/components/office/sharedScene';

const pair = () => ['Коржик', 'Масяня'].map(name => createCat(name, layout.heroes[name as 'Коржик' | 'Масяня']));
const people = () => Object.keys(layout.keyboards).map(name => ({name, position: {...layout.heroes[name as keyof typeof layout.heroes]}}));

test('one daytime hour: 55–80% sleep, independent deadlines and bounded complete blocks', () => {
  for (const seed of [1, 26, 123, 12345, 20261102]) {
    const cats = pair(), heroes = people(), random = sceneRandom(seed), life = createCatLife(random);
    const sleeping = [0, 0], blocks = [0, 0]; let together = 0, simultaneousStarts = 0;
    const actions = new Set<string>();
    const starts: number[][] = [[], []];
    for (let now = 0; now < 3600; now++) {
      const previous = cats.map(cat => cat.nap?.startedAt);
      // This is the real OFFICE-25 idle mode: scene timers are disabled.
      advanceCatLife(cats, heroes, 1, now, life, {hour: 12, autonomous: false, random});
      cats.forEach((cat, i) => {
        const nap = cat.nap!;
        const duration = nap.until - nap.startedAt;
        assert.ok(duration >= (nap.sleeping ? CAT_NAP.sleep.min : CAT_NAP.awake.min) - 1e-6);
        assert.ok(duration <= (nap.sleeping ? CAT_NAP.sleep.max : CAT_NAP.awake.max) + 1e-6);
        if (nap.sleeping) {
          sleeping[i]++;
          assert.equal(catPose(cat, now, false), 'cup');
          assert.equal(cat.activity, undefined);
          if (nap.startedAt !== previous[i]) { blocks[i]++; starts[i].push(nap.startedAt); }
        } else {
          assert.notEqual(catPose(cat, now, false), 'cup');
          if (cat.activity) actions.add(cat.activity);
        }
      });
      if (cats.every(cat => cat.nap?.sleeping)) together++;
    }
    for (const start of starts[0]) if (starts[1].some(other => Math.abs(start - other) < 1)) simultaneousStarts++;
    sleeping.forEach(seconds => assert.ok(seconds / 3600 >= .55 && seconds / 3600 <= .8, `${seed}: ${seconds / 3600}`));
    assert.ok(together / 3600 <= .55, `${seed}: shared sleep ${together / 3600}`);
    assert.ok(simultaneousStarts / Math.min(...blocks) < .5);
    assert.ok(blocks.every(count => count >= 8));
    assert.ok(actions.has('wash') && actions.has('stretch'));
    console.log(JSON.stringify({seed, sleep: sleeping.map(seconds => seconds / 3600), together: together / 3600, blocks}));
  }
});

test('the injected random reaches both duration limits, advances exact deadlines, and separates initial offsets', () => {
  for (const value of [0, 1]) {
    const cats = pair(), life = createCatLife(() => value), random = () => value;
    advanceCatLife(cats, people(), 0, 10, life, {hour: 12, autonomous: false, random});
    assert.notEqual(cats[0].nap!.until, cats[1].nap!.until);
    const cat = cats[0], start = cat.nap!.until;
    advanceCatLife([cat], people(), 0, start, life, {hour: 12, autonomous: false, random});
    assert.equal(cat.nap!.sleeping, true);
    assert.equal(cat.nap!.until - start, value ? 480 : 180);
    const end = cat.nap!.until;
    advanceCatLife([cat], people(), 0, end, life, {hour: 12, autonomous: false, random});
    assert.equal(cat.nap!.sleeping, false);
    assert.equal(cat.nap!.until - end, value ? 30 : 90);
    advanceCatLife([cat], people(), 0, end + 900, life, {hour: 12, autonomous: false, random});
    assert.ok(cat.nap!.until > end + 900, 'long frames catch up from deadlines');
  }
});

function sleepers() {
  const cats = pair(), life = createCatLife(() => 0);
  advanceCatLife(cats, people(), 0, 0, life, {hour: 12, autonomous: false, random: () => 0});
  advanceCatLife(cats, people(), 0, 100, life, {hour: 12, autonomous: false, random: () => 0});
  assert.ok(cats.every(cat => catPose(cat, 100, false) === 'cup'));
  return {cats, life};
}

test('sleep is interrupted before keyboard, Marina and chase departures: sit, hold, then walk', () => {
  for (const kind of ['keyboard', 'visit', 'chase']) {
    const {cats, life} = sleepers(), cat = cats[0], before = {...cat.position};
    const heroes = people(); heroes.find(hero => hero.name === 'Лёха')!.position = {x: 875, y: 468};
    if (kind === 'keyboard') advanceCats(cats, heroes, .1, 100);
    if (kind === 'visit') assert.equal(startCatVisit(cats, {x: 818, y: 257}, () => 0, 100), true);
    if (kind === 'chase') assert.equal(startCatChase(cats, people(), life, 100, () => 0), true);
    const advance = (dt: number, now: number) => {
      if (kind === 'keyboard') advanceCats(cats, heroes, dt, now);
      if (kind === 'visit') advanceCatVisits(cats, dt, now);
      if (kind === 'chase') advanceCatLife(cats, people(), dt, now, life, {hour: 12, autonomous: false, random: () => 0});
    };
    assert.equal(cat.nap, undefined);
    assert.equal(catPose(cat, 100, false), 'work');
    advance(.4, 100.4);
    assert.deepEqual(cat.position, before);
    assert.equal(catSleepZzzAlpha(cat, 100.4, false), 0);
    advance(.5, 100.9);
    assert.equal(catPose(cat, 100.9, false), 'walk');
    assert.notDeepEqual(cat.position, before);
    assert.ok(Math.hypot(cat.position.x - before.x, cat.position.y - before.y) <= (kind === 'chase' ? 210 : 95) * .1 + 1e-6);
  }
});

test('tap wakes a sleeping cat for a full awake block, clears activity and retains triple-tap belly reaction', () => {
  const {cats, life} = sleepers(), cat = cats[0], before = {...cat.position};
  const reaction = tapCat(cat, 100, () => 0);
  assert.equal(reaction.phrase, 'Мяу. Баг найден.');
  assert.equal(cat.nap!.sleeping, false);
  assert.equal(cat.nap!.until, 190);
  for (const now of [100, 103, 104, 150, 189]) {
    advanceCatLife(cats, people(), 0, now, life, {hour: 12, autonomous: false, random: () => 0});
    assert.notEqual(catPose(cat, now, false), 'cup');
    assert.equal(catSleepZzzAlpha(cat, now, false), 0);
  }
  tapCat(cat, 190, () => 0); tapCat(cat, 190.5, () => 0);
  assert.equal(tapCat(cat, 191, () => 0).belly, true);
  assert.equal(catPose(cat, 191, false), 'belly');
  assert.deepEqual(cat.position, before);
});

test('daytime Zzz uses the same pulse style less often and vanishes during reactions and visits', () => {
  const {cats} = sleepers(), cat = cats[0];
  cat.nap!.zzzOffset = 0;
  assert.equal(catSleepZzzAlpha(cat, 101.5, false), 1);
  assert.equal(catSleepZzzAlpha(cat, 105, false), 0);
  assert.equal(catSleepZzzAlpha(cat, 121.5, false), 1);
  assert.equal(catSleepZzzAlpha(cat, 109.5, true), 1);
  cat.visit = 'sitting'; assert.equal(catSleepZzzAlpha(cat, 101.5, false), 0);
  cat.visit = undefined; tapCat(cat, 100, () => 0);
  assert.equal(catSleepZzzAlpha(cat, 101.5, false), 0);
});

test('night, holiday and every explicit demo override daytime naps without carrying stale sleep into morning', () => {
  for (const mode of ['night', 'holiday', 'wash', 'stretch', 'belly', 'window', 'chase'] as const) {
    const {cats, life} = sleepers();
    advanceCatLife(cats, people(), 0, 101, life, {hour: mode === 'night' ? 0 : 12,
      holiday: mode === 'holiday', demo: mode === 'holiday' ? undefined : mode, random: () => 0});
    assert.ok(cats.every(cat => !cat.nap));
    if (mode === 'night' || mode === 'holiday') {
      assert.equal(catPose(cats[0], 101, mode === 'night', mode === 'holiday'), 'cup');
      advanceCatLife(cats, people(), 0, 102, life, {hour: 12, autonomous: false, random: () => 0});
      assert.equal(catPose(cats[0], 102, false), 'work');
    }
  }
});

test('automatic play waits for sleeping cats, while another cat visiting does not erase a home nap', () => {
  const {cats, life} = sleepers(); life.nextChase = 100;
  advanceCatLife(cats, people(), 0, 101, life, {hour: 12, random: () => 0});
  assert.equal(life.chase, undefined);
  cats[1].visit = 'sitting';
  advanceCatLife(cats, people(), 0, 102, life, {hour: 12, random: () => 0});
  assert.equal(catPose(cats[0], 102, false), 'cup');
});
