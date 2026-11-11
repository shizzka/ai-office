import test from 'node:test';
import assert from 'node:assert/strict';
import layout from '../office-art/layout-ai.json';
import { advanceCats, advanceCatLife, catHome, catPose, chooseCatAction, createCat, createCatLife, isCatNight,
  nextCatAction, nextCatChase, startCatChase, startCatVisit, tapCat, type CatDemo, type CatLife } from '../src/components/office/catBehavior';
import { isArtWalkable } from '../src/components/office/aiOfficeNavigation';

const pair = () => ['Коржик', 'Масяня'].map(name => createCat(name, layout.heroes[name as 'Коржик' | 'Масяня']));
const people = () => Object.keys(layout.keyboards).map(name => ({ name, position: { ...layout.heroes[name as keyof typeof layout.heroes] } }));

test('actions never repeat consecutively, window is only offered in the sill bed, timing stays in range', () => {
  const cats = pair();
  assert.equal(chooseCatAction(cats[0], () => 1), 'window');
  for (const cat of cats) {
    const seen = new Set();
    for (let i=0; i<100; i++) {
      const action = chooseCatAction(cat, () => (i%7)/6);
      assert.notEqual(action, cat.previousActivity); seen.add(action); cat.previousActivity = action;
    }
    assert.deepEqual([...seen].sort(), cat.name === 'Коржик' ? ['stretch','wash','window'] : ['belly','stretch','wash']);
  }
  for (const bed of [layout.cat_beds.qa, layout.cat_beds.floor]) {
    const cat = createCat('Коржик', bed.place);
    for (const value of [0,.5,1]) assert.notEqual(chooseCatAction(cat, () => value), 'window');
  }
  assert.equal(nextCatAction(10,false,()=>0),50); assert.equal(nextCatAction(10,false,()=>1),130);
  assert.equal(nextCatAction(10,true,()=>0),130); assert.equal(nextCatAction(10,true,()=>1),370);
  assert.equal(nextCatChase(10,()=>0),130); assert.equal(nextCatChase(10,()=>1),250);
});

test('life schedules actions for 40–120 seconds, window lasts 20–40; night boundaries use local hour', () => {
  assert.deepEqual([0,6,7,12,22,23].map(isCatNight),[true,true,false,false,false,true]);
  const cats=pair(), heroes=people(), life=createCatLife(()=>0);
  advanceCatLife(cats,heroes,0,0,life,{hour:12,random:()=>0});
  assert.equal(cats[0].nextActivity,40);
  advanceCatLife(cats,heroes,0,39.9,life,{hour:12,random:()=>1});
  assert.equal(cats[0].activity,undefined);
  advanceCatLife(cats,heroes,0,40,life,{hour:12,random:()=>1});
  assert.equal(cats[0].activity,'window'); assert.equal(cats[0].activityUntil,80);
  advanceCatLife(cats,heroes,0,41,life,{hour:23,random:()=>0});
  assert.equal(cats[0].activity,undefined); assert.equal(cats[0].nextActivity,161);
  assert.equal(catPose(cats[0],41,true),'cup');
  advanceCatLife(cats,heroes,0,42,life,{hour:7,random:()=>0});
  assert.equal(catPose(cats[0],42,false),'work'); assert.equal(cats[0].nextActivity,82);
});

test('keyboard capture interrupts an action immediately without moving feet or skipping the descent', () => {
  const cats=pair(), heroes=people(); cats[0].activity='window'; cats[0].activityUntil=90;
  const before={...cats[0].position};
  heroes.find(h=>h.name==='Лёха')!.position={x:875,y:468};
  advanceCats(cats,heroes,0,1);
  assert.equal(cats[0].desk,'Лёха'); assert.equal(cats[0].activity,undefined);
  assert.deepEqual(cats[0].position,before);
  assert.deepEqual(cats[0].route.slice(0,2),[...catHome(cats[0]).access,catHome(cats[0]).exit]);
  assert.equal(catPose(cats[0],1,false),'walk');
});

test('Marina visit and full-office holiday interrupt activities and belly reactions', () => {
  const cats=pair(), heroes=people(), life=createCatLife();
  cats[0].activity='wash'; tapCat(cats[0],0); tapCat(cats[0],.2); tapCat(cats[0],.4);
  assert.ok(startCatVisit(cats,{x:818,y:257},()=>0));
  assert.equal(cats[0].activity,undefined); assert.equal(catPose(cats[0],.5,false),'walk');
  assert.equal(cats[0].reaction!.belly,false);
  cats[1].activity='belly';
  advanceCatLife(cats,heroes,0,1,life,{hour:12,holiday:true,demo:'wash'});
  assert.equal(cats[1].activity,undefined); assert.equal(catPose(cats[1],1,false,true),'cup');
});

test('chase requires both cats home and available; it respects night and holiday', () => {
  for (const invalid of ['one-away','keyboard','visit','one-cat','night','holiday']) {
    const cats=pair(), heroes=people(), life=createCatLife(); life.nextChase=0;
    if (invalid==='one-away') cats[1].phase='returning';
    if (invalid==='keyboard') { cats[1].phase='keyboard'; cats[1].desk='Лёха'; }
    if (invalid==='visit') cats[1].visit='sitting';
    if (invalid==='one-cat') cats.pop();
    const events=advanceCatLife(cats,heroes,0,1,life,{hour:invalid==='night'?23:12,holiday:invalid==='holiday'});
    assert.equal(life.chase,undefined,invalid); assert.equal(events.length,0,invalid);
  }
});

test('awake home cats start at the seeded 120–240s deadline with vacant keyboards and return before capturing', () => {
  for (const randomValue of [0, .5, 1]) {
    const cats = pair(), life = createCatLife(() => randomValue);
    const due = life.nextChase;
    assert.equal(due, 120 + randomValue * 120);
    assert.deepEqual(advanceCatLife(cats, [], 0, due - .001, life, { hour: 12, random: () => randomValue }), []);
    assert.equal(life.chase, undefined);
    // OFFICE-26: automatic play waits for sleepers. Wake both to exercise the
    // original chase deadline, floor circuit and return reservation contract.
    cats.forEach(cat => tapCat(cat, due - .001, () => randomValue));
    const events = advanceCatLife(cats, [], 0, due, life, { hour: 12, random: () => randomValue });
    advanceCats(cats, [], 0, due);
    assert.equal(events.length, 1);
    assert.ok(cats.every(c => c.phase === 'chasing' && !c.desk));
    let started = 0, ended = 0;
    for (let i = 1; i < 1600; i++) {
      const now = due + i * .025;
      const previous = cats.map(cat => ({ ...cat.position }));
      assert.deepEqual(advanceCatLife(cats, [], .025, now, life, { hour: 12, random: () => randomValue }), []);
      advanceCats(cats, [], .025, now);
      assert.ok(cats.every(c => !c.desk), 'a vacancy cannot capture a cat during play or its return');
      if ((life as CatLife).chase?.stage === 'running') {
        started ||= now;
        cats.forEach(cat => assert.ok(isArtWalkable(cat.position)));
        if (now - started > .6) cats.forEach((cat, j) => assert.ok(
          Math.hypot(cat.position.x - previous[j].x, cat.position.y - previous[j].y) > .001,
          `${cat.name} must keep running until the ${6 + randomValue * 4}s deadline`));
      }
      if (started && !life.chase) ended ||= now;
      if (ended && cats.every(c => c.phase === 'home')) break;
    }
    assert.ok(Math.abs(ended - started - (6 + randomValue * 4)) < .026);
    assert.ok(cats.every(c => c.phase === 'home'));
    assert.notEqual(cats[0].bed, cats[1].bed);
    cats.forEach(c => assert.deepEqual(c.position, catHome(c).place));
  }
});

test('chase follows navigable floor for 6–10 seconds, emits once, returns to different reserved beds', () => {
  const cats=pair(), heroes=people(), life=createCatLife(()=>0), events=[];
  life.nextChase=0; let floorAt=0, finishedAt=0;
  for (let i=0;i<1000;i++) {
    const now=i*.05, previous=cats.map(c=>({...c.position}));
    events.push(...advanceCatLife(cats,heroes,.05,now,life,{hour:12,random:()=>0}));
    advanceCats(cats,heroes,.05,now);
    cats.forEach((cat,j)=>assert.ok(Math.hypot(cat.position.x-previous[j].x,cat.position.y-previous[j].y)<=210*.05+1e-5));
    if (life.chase?.stage==='running') {
      floorAt ||= now;
      cats.forEach(cat=>assert.ok(isArtWalkable(cat.position)));
    }
    if (floorAt && !life.chase) finishedAt ||= now;
  }
  assert.equal(events.length,1); assert.equal(events[0].message,'🐈 Коржик и Масяня устроили догонялки');
  assert.ok(finishedAt-floorAt>=6 && finishedAt-floorAt<=6.1);
  assert.ok(cats.every(c=>c.phase==='home'));
  assert.notEqual(cats[0].bed,cats[1].bed);
  cats.forEach(c=>assert.deepEqual(c.position,catHome(c).place));
});

test('Marina interrupts chase without teleporting, including mid-descent', () => {
  for (const dt of [.05, 3]) {
    const cats=pair(), heroes=people(), life=createCatLife(()=>0);
    assert.ok(startCatChase(cats,heroes,life,0,()=>0));
    advanceCatLife(cats,heroes,dt,dt,life,{hour:12});
    const before=cats.map(c=>({...c.position}));
    assert.equal(startCatVisit(cats,{x:818,y:257}),false);
    advanceCatLife(cats,heroes,0,.1,life,{hour:12});
    assert.equal(life.chase,undefined);
    cats.forEach((c,i)=>assert.deepEqual(c.position,before[i]));
    assert.ok(cats.every(c=>c.phase!=='chasing'));
  }
});

test('one tap purrs with a nonrepeating personal phrase; three taps in two seconds show belly for four seconds', () => {
  for (const cat of pair()) {
    const before={...cat.position}, first=tapCat(cat,0,()=>0);
    assert.equal(first.belly,false); assert.equal(first.until,4);
    assert.equal(first.phrase,cat.name==='Коржик'?'Мяу. Баг найден.':'Мур? Мур.');
    assert.notEqual(tapCat(cat,1,()=>0).phrase,first.phrase);
    const third=tapCat(cat,2,()=>0);
    assert.equal(third.phrase,'Пузико! (но трогать нельзя)'); assert.equal(third.belly,true);
    assert.equal(catPose(cat,5.999,false),'belly'); assert.equal(catPose(cat,6,false),'work');
    assert.deepEqual(cat.position,before); assert.deepEqual(cat.taps,[]);
  }
  const cat=pair()[0]; tapCat(cat,0); tapCat(cat,1); assert.equal(tapCat(cat,2.01).belly,false);
});

test('keyboard tap has its own line; tap during travel or Marina visit keeps the priority pose', () => {
  const cat=pair()[0]; cat.phase='keyboard'; cat.desk='Лёха';
  assert.equal(tapCat(cat,0).phrase,'Не мешай, у меня код-ревью 😼');
  tapCat(cat,.1); tapCat(cat,.2); assert.equal(catPose(cat,.3,false),'belly');
  cat.phase='walking'; assert.equal(catPose(cat,.3,false),'walk');
  cat.phase='home'; cat.visit='sitting'; assert.equal(catPose(cat,.3,false),'work');
});

test('all six demo modes are reachable without mutating hero presence', () => {
  for (const demo of ['wash','stretch','belly','window','chase','night'] as CatDemo[]) {
    const cats=pair(), heroes=people(), before=JSON.stringify(heroes), life=createCatLife();
    advanceCatLife(cats,heroes,0,0,life,{hour:demo==='night'?0:12,demo});
    assert.equal(JSON.stringify(heroes),before);
    assert.equal(catPose(cats[0],0,demo==='night'),demo==='stretch'?'cat_stretch':demo==='chase'?'walk':demo==='night'?'cup':demo);
  }
});
