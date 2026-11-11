import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerFeatures, createOwnerSchedule, OWNER_SCENES, OWNER_PLACES, ownerFloor, type OwnerActor } from '../src/components/office/ownerFeatures';
import { isArtWalkable, artFootprintsOverlap } from '../src/components/office/aiOfficeNavigation';
import { createCat } from '../src/components/office/catBehavior';
import { publicDcm } from '../src/lib/officeDcm';
import layout from '../office-art/layout-ai.json';
const roster=():OwnerActor[]=>Object.entries(layout.heroes).map(([appearanceName,p])=>({appearanceName,container:{...p},homeX:p.x,homeY:p.y,apiStatus:'idle',moveState:'SITTING',seating:{progress:['Коржик','Масяня'].includes(appearanceName)?0:1},...(['Коржик','Масяня'].includes(appearanceName)?{cat:createCat(appearanceName,p)}:{})}));
for(const mode of OWNER_SCENES)test(`${mode}: completes, uses floor, restores paused positions and power`,()=>{
  const actors=roster(),before=actors.map(a=>({...a.container})),events:string[]=[];
  const engine=createOwnerFeatures(m=>events.push(m));engine.launch(mode,actors,true);
  let dark=false,prop=false,review=false,green=false,point=false,eat=false,spark=false;
  for(let t=0;t<240&&engine.busy;t+=.05){
    engine.tick(actors,.05,true);dark ||= engine.dark>0;prop ||=!!engine.pizza;review ||=engine.review;green ||=engine.review&&engine.reviewGreen;spark ||=engine.spark>0;
    for(const a of actors){if(!a.cat)assert.ok(isArtWalkable(a.container),`${a.appearanceName} on furniture: ${JSON.stringify(a.container)}`);const p=engine.poses.get(a);point ||=p?.frame==='owner_point_back';eat ||=p?.frame==='owner_eat';}
  }
  assert.equal(engine.busy,false,'scene timed out');assert.equal(engine.dark,0);assert.equal(engine.pizza,null);
  assert.deepEqual(actors.map(a=>a.container),before);assert.deepEqual(actors.map(a=>a.moveState),actors.map(()=> 'SITTING'));
  if(['breaker','short'].includes(mode))assert.ok(dark);
  if(mode==='short')assert.ok(spark);
  if(mode==='standup')assert.ok(point);
  if(mode==='pizza'){assert.ok(prop&&eat);assert.ok(events.includes('🍕 Зелёная регрессия — пицца за счёт ГИПа'));}
  if(mode==='review')assert.ok(review&&green);
});
test('stop during power failure restores actors, props and light; next launch succeeds',()=>{
  const a=roster(),e=createOwnerFeatures();e.launch('short',a);for(let t=0;t<5;t+=.05)e.tick(a,.05);
  assert.ok(e.dark);e.stop();assert.equal(e.dark,0);assert.equal(e.busy,false);assert.equal(e.spark,0);e.launch('standup',a);assert.ok(e.busy);
});
test('working norm controller carries chair, checks beside owner, returns to bench when idle',()=>{
  const a=roster(),e=createOwnerFeatures(),i=a.find(a=>a.appearanceName==='Иваныч')!,owner=a.find(a=>a.appearanceName==='Евгений')!;i.apiStatus='working';
  let carried=false,red=false,green=false;
  for(let t=0;t<40;t+=.05){e.tick(a,.05);carried ||= e.poses.get(i)?.frame?.startsWith('chair_walk')??false;red ||=e.review&&!e.reviewGreen;green ||=e.review&&e.reviewGreen;assert.ok(isArtWalkable(i.container));}
  assert.ok(carried&&red&&green);assert.equal(e.review,true);assert.deepEqual(i.container,OWNER_PLACES.review);assert.equal(e.atBench,false);
  assert.equal(artFootprintsOverlap(i.container,owner.container),false);
  i.apiStatus='idle';for(let t=0;t<30;t+=.05)e.tick(a,.05);
  assert.equal(e.review,false);assert.equal(e.atBench,true);assert.deepEqual(i.container,{x:i.homeX,y:i.homeY});
});
test('Ivanych stays at bench when owner absent; review stops when owner leaves',()=>{
  const a=roster(),e=createOwnerFeatures(),i=a.find(a=>a.appearanceName==='Иваныч')!,o=a.find(a=>a.appearanceName==='Евгений')!;i.apiStatus='working';o.container={x:600,y:420};
  for(let t=0;t<40;t++)e.tick(a,1);assert.equal(e.review,false);assert.ok(e.atBench);
  o.container={x:o.homeX,y:o.homeY};for(let t=0;t<40;t++)e.tick(a,1);assert.ok(e.review);
  o.container={x:600,y:420};for(let t=0;t<40;t++)e.tick(a,1);assert.equal(e.review,false);assert.ok(e.atBench);
});
test('standup fallback and party slots keep elliptical clearance on floor',()=>{
  const blocked=[OWNER_PLACES.standup];const selected=ownerFloor(OWNER_PLACES.standup,blocked);assert.ok(isArtWalkable(selected));assert.equal(artFootprintsOverlap(selected,blocked[0]),false);
  for(let n=0;n<10;n++){const p=ownerFloor({x:630,y:410},blocked);assert.ok(isArtWalkable(p));assert.ok(blocked.every(b=>!artFootprintsOverlap(b,p)));blocked.push(p);}
});
test('automatic timings and local laptop 10:00 each enqueue once; short waits for bench',()=>{
  const e=createOwnerSchedule(true,()=>0),events:string[]=[];e.tick(0,new Date(2026,10,2,9),null,s=>events.push(s));e.tick(1200,new Date(2026,10,2,9,20),null,s=>events.push(s),false);
  assert.deepEqual(events,['breaker']);e.tick(3600,new Date(2026,10,2,10),null,s=>events.push(s));assert.ok(['standup','pizza','rounds','short'].every(s=>events.includes(s)));
  const day=createOwnerSchedule(false,()=>0),meetings:string[]=[];for(let n=0;n<3;n++)day.tick(n,new Date(2026,10,2,10,n),null,s=>meetings.push(s));assert.deepEqual(meetings,['standup']);
  day.tick(3,new Date(2026,10,3,10),null,s=>meetings.push(s));assert.deepEqual(meetings,['standup','standup']);
});
test('pizza requires new explicit green record, ignores baseline/red/stale and persists 3h cooldown',()=>{
  const e=createOwnerSchedule(false,()=>1),events:string[]=[];let clock=Date.parse('2026-11-02T09:00:00Z');
  const signal=(n:number,extra={})=>publicDcm({regression:{status:'pass',timestamp:new Date(clock).toISOString(),recordId:n.toString(16).padStart(24,'0'),green:true,new:true,...extra}},clock);
  e.tick(0,new Date(clock),signal(1),s=>events.push(s));assert.equal(events.length,0);
  e.tick(1,new Date(clock),signal(2),s=>events.push(s));assert.equal(events.join(','),'pizza');
  clock+=1000;e.tick(2,new Date(clock),signal(3),s=>events.push(s));assert.equal(events.length,1);
  clock+=3*3600_000;e.tick(3,new Date(clock),signal(4,{status:'fail'}),s=>events.push(s));e.tick(4,new Date(clock),signal(5,{green:false}),s=>events.push(s));e.tick(5,new Date(clock),signal(6,{new:false}),s=>events.push(s));assert.equal(events.length,1);
  e.tick(6,new Date(clock),signal(7),s=>events.push(s));assert.equal(events.length,2);
});

test('initial async signal is baseline even after null polling frames; stop cancels chair transport',()=>{
 const schedule=createOwnerSchedule(false,()=>1),queued:string[]=[];const clock=Date.parse('2026-11-02T09:00:00Z');
 schedule.tick(0,new Date(clock),null,id=>queued.push(id));
 const signal=publicDcm({regression:{status:'pass',timestamp:new Date(clock).toISOString(),recordId:'a'.repeat(24),green:true,new:true}},clock);
 schedule.tick(1,new Date(clock),signal,id=>queued.push(id));assert.equal(queued.length,0);
 const actors=roster(),engine=createOwnerFeatures(),i=actors.find(a=>a.appearanceName==='Иваныч')!;i.apiStatus='working';
 engine.tick(actors,.1);assert.ok(engine.transportingChair);engine.reset();assert.equal(engine.owns(i),false);assert.equal(engine.transportingChair,false);assert.ok(engine.atBench);
});
test('query launch before first seating tick still addresses seated listeners on their desks',()=>{
 const actors=roster();actors.forEach(a=>{a.seating.progress=0;});const engine=createOwnerFeatures();engine.launch('rounds',actors);
 let peek=false;for(let t=0;t<100&&engine.busy;t+=.1){engine.tick(actors,.1);peek ||= [...engine.poses.values()].some(p=>p.frame==='owner_peek');}
 assert.ok(peek);assert.equal(engine.busy,false);
});
test('scene pauses preserve walking Marina and displaced cats, without pre-launch teleport',()=>{
 const actors=roster(),m=actors.find(a=>a.appearanceName==='Марина')!,c=actors.find(a=>a.cat)!;
 m.container={x:650,y:420};m.moveState='WALKING_TO';m.seating.progress=0;
 c.container={x:600,y:420};c.cat!.position={...c.container};c.cat!.phase='returning';
 const original=actors.map(a=>({...a.container})),engine=createOwnerFeatures();engine.launch('breaker',actors);
 assert.deepEqual(actors.map(a=>a.container),original);
 let retreated=false;for(let t=0;t<100&&engine.busy;t+=.1){engine.tick(actors,.1);retreated ||=engine.dark>0&&Math.hypot(c.container.x-c.homeX,c.container.y-c.homeY)<1;}
 assert.equal(engine.busy,false);assert.ok(retreated);assert.deepEqual(actors.map(a=>a.container),original);assert.equal(m.moveState,'WALKING_TO');
});

test('daily standup targets 10:00, not a later page load anywhere in the tenth hour',()=>{
 const schedule=createOwnerSchedule(false,()=>1),queued:string[]=[];
 schedule.tick(0,new Date(2026,10,2,10,45),null,id=>queued.push(id));assert.equal(queued.length,0);
 schedule.tick(1,new Date(2026,10,3,10,0),null,id=>queued.push(id));assert.equal(queued.join(','),'standup');
});

test('exclusive scene keeps the joint chair seat while pausing normal control',()=>{
 const actors=roster(),engine=createOwnerFeatures(),i=actors.find(a=>a.appearanceName==='Иваныч')!;i.apiStatus='working';
 for(let t=0;t<30;t+=.1)engine.tick(actors,.1);assert.ok(engine.review);
 engine.launch('breaker',actors);assert.deepEqual(engine.poses.get(i)?.seat,OWNER_PLACES.reviewChair);assert.equal(engine.review,false);
 engine.stop();engine.tick(actors,.1);assert.equal(engine.review,true);assert.deepEqual(engine.poses.get(i)?.seat,OWNER_PLACES.reviewChair);
});
test('rounds returns owner to his own desk even when launched during a coffee walk',()=>{
 const actors=roster(),engine=createOwnerFeatures(),e=actors.find(a=>a.appearanceName==='Евгений')!;
 e.container={x:650,y:420};e.moveState='WALKING_TO';e.seating.progress=0;engine.launch('rounds',actors);
 for(let t=0;t<120&&engine.busy;t+=.1)engine.tick(actors,.1);
 assert.equal(engine.busy,false);assert.deepEqual(e.container,{x:e.homeX,y:e.homeY});
});
