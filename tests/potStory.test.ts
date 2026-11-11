import test from 'node:test';
import assert from 'node:assert/strict';
import layout from '../office-art/layout-ai.json';
import { createCat, advanceCats, nearestFreeBed } from '../src/components/office/catBehavior';
import { isArtWalkable } from '../src/components/office/aiOfficeNavigation';
import { startPotStory, advancePotStory, cancelPotStory, nextPotScene, nextHeroLaser, potMarinaFrame } from '../src/components/office/potStory';

const pair=()=>['Коржик','Масяня'].map(n=>createCat(n,layout.heroes[n as 'Коржик'|'Масяня']));
test('both pot locations finish with a new plant, clean floor, a home cat and Marina back at work',()=>{
  for(const location of ['sill','desk'] as const) {
    const cats=pair(),person={position:{x:875,y:468},home:{...layout.heroes.Марина},present:true,atDesk:false};
    const s=startPotStory(cats,person,0,()=>0,location)!;assert.ok(s);
    const phases=new Set<string>(),frames=new Set<string>(),events:string[]=[];
    let sawBroken=false,sawCleanBeforeReplacement=false;
    for(let i=1;i<=2400&&!s.complete;i++) {
      const previous={...person.position};
      events.push(...advancePotStory(s,cats,.05,i*.05,()=>0).map(e=>e.message));
      phases.add(s.phase);frames.add(potMarinaFrame(s,i*.05)||'');
      if(s.broken)sawBroken=true;
      if(sawBroken&&!s.broken&&!s.whole)sawCleanBeforeReplacement=true;
      assert.ok(isArtWalkable(person.position),'Marina stays on the floor');
      if(person.position.x!==previous.x||person.position.y!==previous.y){
        for(let k=1;k<5;k++)assert.ok(isArtWalkable({x:previous.x+(person.position.x-previous.x)*k/5,y:previous.y+(person.position.y-previous.y)*k/5}));
      }
    }
    assert.ok(s.complete);assert.ok(s.whole);assert.equal(s.broken,false);
    assert.ok(sawBroken&&sawCleanBeforeReplacement);assert.equal(s.cat.phase,'home');
    assert.deepEqual(person.position,person.home);
    for(const phase of ['swipe','falling','guilty','angry','sweep','fetch','carry','happy','return'])assert.ok(phases.has(phase),phase);
    for(const frame of ['scene_angry','scene_sweep','scene_carry','scene_happy'])assert.ok(frames.has(frame),frame);
    assert.equal(events.length,2);assert.match(events[0],/Коржик уронил горшок/);assert.equal(events[1],'🪴 Новый горшок на месте');
  }
});
test('occupied desk and reserved cats cannot start a pot scene',()=>{
  const cats=pair(),marina={position:{...layout.heroes.Марина},home:{...layout.heroes.Марина},atDesk:true,present:true};
  assert.equal(startPotStory(cats,marina,0,()=>0,'desk'),null);
  cats[0].visit='outbound';cats[1].phase='chasing';
  assert.equal(startPotStory(cats,marina,0),null);
});
test('absent Marina waits 10–30 seconds after the crash before coming to clean',()=>{
  for(const random of [0,1]){
    const cats=pair(),marina={position:{...layout.heroes.Марина},home:{...layout.heroes.Марина},atDesk:false,present:false};
    const s=startPotStory(cats,marina,0,()=>random,'sill')!;
    let now=0;
    while(s.phase!=='guilty'&&now<30){now+=.05;advancePotStory(s,cats,.05,now,()=>random);}
    assert.equal(s.phase,'guilty');assert.ok(Math.abs(s.marinaDue-now-(10+random*20))<1e-8);
    const position={...marina.position};
    while(now<s.marinaDue-.1){now+=.05;advancePotStory(s,cats,.05,now,()=>random);}
    assert.deepEqual(marina.position,position);
  }
});
test('scene and hero laser schedules have the requested normal and stream ranges',()=>{
  assert.equal(nextPotScene(0,false,()=>0),1200);assert.equal(nextPotScene(0,false,()=>1),2400);
  assert.equal(nextPotScene(0,true,()=>0),300);assert.equal(nextPotScene(0,true,()=>1),600);
  assert.equal(nextHeroLaser(0,false,()=>0),600);assert.equal(nextHeroLaser(0,false,()=>1),1500);
  assert.ok(nextHeroLaser(0,true,()=>1)<nextHeroLaser(0,false,()=>1));
});
test('escaping scene cat reserves its bed while ordinary movement sees every cat',()=>{
  const cats=pair();
  cats[0].phase='chasing';cats[0].chaseReturning=true;cats[0].bed='qa';
  cats[0].home={...layout.cat_beds.qa.place};cats[0].position={x:820,y:460};
  cats[1].position={x:830,y:460};cats[1].phase='returning';cats[1].chaseReturning=true;
  assert.notEqual(nearestFreeBed(cats[1],cats)?.[0],'qa');
  const before={...cats[0].position};
  const people=Object.entries(layout.heroes).map(([name,position])=>({name,position}));
  advanceCats(cats,people,.2,0,new Set([cats[0]]));
  assert.deepEqual(cats[0].position,before);assert.notEqual(cats[1].bed,'qa');
});
test('canceling a story restores decor and releases a surviving cat through floor waypoints',()=>{
  const cats=pair(),marina={position:{...layout.heroes.Марина},home:{...layout.heroes.Марина},atDesk:true,present:true};
  const s=startPotStory(cats,marina,0,()=>0,'sill')!;
  cancelPotStory(s,cats);
  assert.ok(s.whole&&!s.broken&&s.complete);assert.equal(s.cat.phase,'returning');
  assert.ok(s.cat.chaseReturning);assert.ok(s.cat.route.some(isArtWalkable));
  const people=Object.entries(layout.heroes).map(([name,position])=>({name,position}));
  const arrived=()=>s.cat.phase==='home';
  for(let i=0;i<600&&!arrived();i++)advanceCats(cats,people,.05,i*.05);
  assert.equal(s.cat.phase,'home');
});
