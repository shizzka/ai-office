import test from 'node:test';
import assert from 'node:assert/strict';
import { resetHeroAmbient } from '../src/components/office/heroAmbient';
import { createRareGesture, advanceRareGesture } from '../src/components/office/heroTiming';
import { createDeskLife, advanceDeskLife } from '../src/components/office/deskLife';
import { createSharedPlayback } from '../src/components/office/sharedScene';
import { createOfficeAttendance, OFFICE_DOOR, type AttendanceActor } from '../src/components/office/officeAttendance';
import { officeHome } from '../src/components/office/officeLayout';

const actor=(name:string):AttendanceActor=>{const h=officeHome('art',{name});return {appearanceName:name,container:{...h},homeX:h.x,homeY:h.y,apiStatus:'idle',moveState:'SITTING',seating:{progress:1}};};
const snapshot=(names:string[],home=false)=>({hour:12,ownerNight:'awake' as const,actors:names.map(name=>({name,status:'idle',idleSince:0,departureAt:home?1:null,home}))});
function advance(engine:ReturnType<typeof createOfficeAttendance>,all:AttendanceActor[],seconds:number,start=10000){
  for(let k=0;k<seconds*20;k++)engine.tick(all,.05,start+k*50,12,false);
}

test('completed and active gestures cannot revive on shared reset, repair or scene end',()=>{
  const heroes=Array.from({length:10},(_,i)=>({eggClock:330,rareGesture:createRareGesture(()=>i/10),deskLife:createDeskLife(()=>0),bugUntil:333,victoryUntil:333,responseUntil:333}));
  for(const h of heroes){advanceRareGesture(h.rareGesture,300,true,()=>0);advanceRareGesture(h.rareGesture,304,true);h.deskLife.action='stretch';h.deskLife.until=333;}
  const reset=()=>heroes.forEach(h=>resetHeroAmbient(h,()=>.5));
  const playback=createSharedPlayback(reset,()=>{},reset);
  const scene={id:'shared',eventId:'cat-wash',seed:1,startedAt:1000,endsAt:23000};
  for(const repair of [()=>playback.sync(scene,1000),()=>playback.sync({...scene},2000),()=>playback.reset(),reset]){
    repair();
    assert.equal(heroes.filter(h=>advanceRareGesture(h.rareGesture,h.eggClock,true)).length,0,'after reset nobody in easter');
    assert.equal(heroes.filter(h=>advanceDeskLife(h.deskLife,h.eggClock,true)==='stretch').length,0);
    assert.ok(heroes.every(h=>h.eggClock===330&&h.victoryUntil===0&&h.rareGesture.next>=510));
  }
});

test('late WS home snapshot walks existing heroes to the door; initial home snapshot stays hidden',()=>{
  const all=['Ася','Тая','Ярик'].map(actor),e=createOfficeAttendance(undefined,undefined,{authoritative:true});
  e.applySnapshot(snapshot(all.map(a=>a.appearanceName)),all);e.tick(all,0,1000,12,false);
  e.applySnapshot(snapshot(all.map(a=>a.appearanceName),true),all);
  assert.ok(all.every(a=>!a.away));
  e.tick(all,.05,10000,12,false);assert.ok(all.every(a=>!a.away&&e.poses.get(a)?.frame==='cup'));
  advance(e,all,30);assert.ok(all.every(a=>a.away));assert.ok(all.every(a=>JSON.stringify(a.container)===JSON.stringify(OFFICE_DOOR)));
  const newcomer=[actor('Ася')],fresh=createOfficeAttendance(undefined,undefined,{authoritative:true});fresh.applySnapshot(snapshot(['Ася'],true),newcomer);assert.ok(newcomer[0].away);
});

test('unrelated scenes preserve home and departing attendance instead of flashing everyone at desks',()=>{
  const all=[actor('Ася'),actor('Тая')],e=createOfficeAttendance(undefined,undefined,{authoritative:true});
  e.applySnapshot(snapshot(['Ася','Тая'],true),all);e.tick(all,0,10000,12,false);
  e.reset(all,true);assert.ok(all.every(a=>a.away));assert.equal(e.people.size,2);
  e.applySnapshot(snapshot(['Ася','Тая']),all);advance(e,all,1);
  const positions=all.map(a=>({...a.container}));e.reset(all,true);
  assert.deepEqual(all.map(a=>a.container),positions);assert.ok(all.every(a=>e.people.get(a.appearanceName.toLowerCase())?.phase==='arriving'));
});

test('quota on/off retains the same actors and exits/enters through the door, including resident Leha',()=>{
  const all=['Ася','Тая','Ярик','Лёха'].map(actor),e=createOfficeAttendance(undefined,undefined,{authoritative:true});
  e.applySnapshot(snapshot(all.map(a=>a.appearanceName)),all);e.tick(all,0,0,12,false);
  all.forEach(a=>{a.quotaAway=true;a.apiStatus='working';});
  advance(e,all,.5);assert.ok(all.every(a=>!a.away));
  advance(e,all,30);assert.ok(all.every(a=>a.away));
  all.forEach(a=>a.quotaAway=false);e.tick(all,0,50000,12,false);
  assert.ok(all.every(a=>!a.away&&e.opacity(a)===0));assert.ok(all.every(a=>JSON.stringify(a.container)===JSON.stringify(OFFICE_DOOR)));
  advance(e,all,30,50000);assert.ok(all.every(a=>!a.away&&a.container.x===a.homeX&&a.container.y===a.homeY));
});

test('quota reversal during departure cancels from the current floor position',()=>{
  const a=actor('Ася'),all=[a],e=createOfficeAttendance();e.tick(all,0,0,12,false);a.quotaAway=true;
  advance(e,all,2);const p={...a.container};a.quotaAway=false;e.tick(all,0,20000,12,false);
  assert.deepEqual(a.container,p);assert.ok(!a.away);assert.equal(e.people.get('ася')?.phase,'arriving');
});
