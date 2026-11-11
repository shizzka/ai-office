import test from 'node:test';
import assert from 'node:assert/strict';
import layout from '../office-art/layout-ai.json';
import { advanceCats, advanceCatVisits, startCatVisit, catHome, createCat, marinaVisitTarget } from '../src/components/office/catBehavior';
import { createDeliveryQueue, ingestDeliveries, takeDelivery, registerTap, nextCatVisit } from '../src/components/office/officeMoments';
import { isArtWalkable } from '../src/components/office/aiOfficeNavigation';
import { publicMoments } from '../src/lib/officeMoments';

const pair = () => ['Коржик','Масяня'].map(n => createCat(n, layout.heroes[n as 'Коржик' | 'Масяня']));
const people = () => Object.entries(layout.heroes).map(([name, position]) => ({ name, position: { ...position } }));
const target = marinaVisitTarget(layout.heroes.Марина)!;
test('one randomly chosen visitor walks from its bed, sits ten seconds and returns to a free bed', () => {
  for (const random of [0, .999]) {
    const cats = pair(), chosen = random ? 1 : 0;
    assert.ok(startCatVisit(cats, target, () => random));
    assert.equal(cats.filter(c => c.visit).length, 1);
    assert.equal(cats[chosen].visit, 'outbound');
    assert.deepEqual(cats[chosen].route.slice(0,2), [...catHome(cats[chosen]).access, catHome(cats[chosen]).exit]);
    assert.equal(startCatVisit(cats, target), false);
    const sitting = () => cats[chosen].visit === 'sitting';
    for (let i = 0; i < 500 && !sitting(); i++) {
      advanceCatVisits(cats, .05, i*.05);
      advanceCats(cats, people(), .05, i*.05);
    }
    assert.equal(cats[chosen].visit, 'sitting');
    assert.deepEqual(cats[chosen].position, target);
    const until = cats[chosen].visitUntil!;
    // Even an empty keyboard cannot steal a visitor's reservation.
    advanceCats(cats, [], 0, until-1);
    assert.equal(cats[chosen].desk, null);
    advanceCatVisits(cats, 0, until-.001);
    assert.equal(cats[chosen].visit, 'sitting');
    advanceCatVisits(cats, 0, until);
    assert.equal(cats[chosen].visit, 'returning');
    assert.deepEqual(cats[chosen].route.slice(-2), [...catHome(cats[chosen]).access].reverse().concat(cats[chosen].home));
    advanceCatVisits(cats, 30, until+30);
    assert.equal(cats[chosen].visit, undefined);
    assert.equal(cats[chosen].phase, 'home');
    assert.deepEqual(cats[chosen].position, catHome(cats[chosen]).place);
  }
});
test('keyboard capture and descent prevent visits; natural intervals are 4–8 minutes', () => {
  const cats = pair(); cats[1].desk = 'Лёха'; cats[1].phase = 'keyboard';
  assert.equal(startCatVisit(cats, target), false);
  cats[1].desk = null; cats[1].phase = 'returning';
  assert.equal(startCatVisit(cats, target), false);
  assert.equal(nextCatVisit(50, () => 0), 290);
  assert.equal(nextCatVisit(50, () => 1), 530);
});
test('real deliveries coalesce, deduplicate totals, survive reload and respect ten minutes', () => {
  let q = createDeliveryQueue();
  ingestDeliveries(q, 100); assert.equal(takeDelivery(q, 0, false), 0, 'no historical replay');
  ingestDeliveries(q, 103); assert.equal(takeDelivery(q, 1000, false), 3);
  ingestDeliveries(q, 105); ingestDeliveries(q, 109); ingestDeliveries(q, 109);
  assert.equal(takeDelivery(q, 600999, false), 0);
  q = JSON.parse(JSON.stringify(q));
  assert.equal(takeDelivery(q, 601000, true), 0, 'busy presentation keeps queue');
  assert.equal(takeDelivery(q, 601000, false), 6);
  assert.equal(takeDelivery(q, 1201000, false), 0);
  ingestDeliveries(q, 0); ingestDeliveries(q, 109);
  assert.equal(q.pending, 0, 'transient missing state cannot replay totals');
});
test('five taps in a sliding three-second window trigger once and reset', () => {
  const taps: number[] = [];
  for (const time of [0, 500, 1000, 2000]) assert.equal(registerTap(taps,time), false);
  assert.equal(registerTap(taps,3000), true); assert.equal(taps.length, 0);
  for (const time of [4000, 5000, 6000, 7001]) assert.equal(registerTap(taps,time), false);
  assert.equal(registerTap(taps,7002), false);
  assert.equal(registerTap(taps,7003), true);
});
test('public moments whitelist excludes cursor metadata and malformed values', () => {
  assert.deepEqual(publicMoments({ bugs: 0, total: 3, latestCount: 2, cursors: 'private' }), { bugs: 0, total: 3, latestCount: 2 });
  assert.deepEqual(publicMoments({ bugs: {}, total: -2, latestCount: '2' }), { bugs: 'вагон 🚃', total: 0, latestCount: 0 });
});

test('every cat visit ends at Marina’s feet on floor clear of all furniture masks', () => {
  const blocked = Object.values(layout.furniture_masks);
  for (const bed of Object.values(layout.cat_beds)) for (const random of [0,.999]) {
    const cats=pair(); cats[0]=createCat('Коржик',bed.place);
    if (cats[0].bed===cats[1].bed) cats[1]=createCat('Масяня',layout.cat_beds.qa.place);
    const goal=marinaVisitTarget(layout.heroes.Марина)!;
    assert.ok(startCatVisit(cats,goal,()=>random));
    const visitor=cats.find(c=>c.visit)!;
    assert.deepEqual(visitor.route.at(-1),goal);
    assert.ok(isArtWalkable(goal));
    assert.ok(!blocked.some(([x,y,w,h])=>goal.x>=x&&goal.x<=x+w&&goal.y>=y&&goal.y<=y+h));
    const floorRoute=visitor.route.slice(catHome(visitor).access.length);
    let last=catHome(visitor).exit;
    for (const point of floorRoute) {
      const steps=Math.max(1,Math.ceil(Math.hypot(point.x-last.x,point.y-last.y)*2));
      for(let i=0;i<=steps;i++) assert.ok(isArtWalkable({x:last.x+(point.x-last.x)*i/steps,y:last.y+(point.y-last.y)*i/steps}));
      last=point;
    }
  }
  assert.equal(startCatVisit(pair(),{x:850,y:320}),false,'board cannot be a visit destination');
});
