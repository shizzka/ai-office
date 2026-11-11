import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createOfficeAttendance, HOME_IDLE_MS, departureDelay, onShift, RUSH_SPEED, OFFICE_DOOR, MATTRESS_RECT, mattressFits, type AttendanceActor } from '../src/components/office/officeAttendance';
import { officeHome } from '../src/components/office/officeLayout';
import { isArtWalkable } from '../src/components/office/aiOfficeNavigation';
import { catHome, createCat } from '../src/components/office/catBehavior';
import { heroHoliday, officeHoliday, demoQuotas } from '../src/components/office/officeHoliday';
const actor=(name:string):AttendanceActor=>{const p=officeHome('art',{name});return {appearanceName:name,container:{...p},homeX:p.x,homeY:p.y,apiStatus:'idle',moveState:'SITTING',seating:{progress:1},...(['Коржик','Масяня'].includes(name)?{cat:createCat(name,p)}:{})};};
function fixture(names=['Ася','Иваныч','whoami','Марина','Лёха','Евгений','Коржик','Масяня']) {
  const all=names.map(actor),events:string[]=[];let now=0,hour=20;
  const engine=createOfficeAttendance((n,m)=>events.push(m));
  const tick=(seconds=.1,red=false)=>{for(let t=0;t<seconds-1e-6;t+=.1){now+=100;engine.tick(all,.1,now,hour,red);}};
  return {all,events,engine,tick,setHour:(h:number)=>{hour=h;},get:(n:string)=>all.find(a=>a.appearanceName===n)!};
}

test('shifts respect laptop hours, Ivanych 18:00, whoami noon through 02:00, Leha all day',()=>{
  assert.equal(onShift('Ася',8.99),false);assert.equal(onShift('Ася',9),true);assert.equal(onShift('Ася',19),false);
  assert.equal(onShift('Иваныч',18),false);assert.equal(onShift('whoami',11.99),false);assert.equal(onShift('whoami',12),true);
  assert.equal(onShift('whoami',1.99),true);assert.equal(onShift('whoami',2),false);
  for(let h=0;h<24;h++)assert.equal(onShift('Лёха',h),true);
  const delays=['Ася','Марина','Ярик','Иваныч','Тая','Саня','whoami'].map(departureDelay);
  assert.ok(delays.every(d=>d>=120_000&&d<=900_000));assert.equal(new Set(delays).size,delays.length);
});
test('idle eligibility is wall time, farewell/cup then real door route then hidden home; workers and cats stay',()=>{
  const f=fixture();f.get('Марина').apiStatus='working';f.tick();
  f.engine.tick(f.all,.1,HOME_IDLE_MS-1,20,false);assert.equal(f.engine.people.get('ася')!.phase,'present');
  f.engine.tick(f.all,.1,HOME_IDLE_MS+departureDelay('Ася')+101,20,false);
  assert.equal(f.engine.people.get('ася')!.phase,'farewell');assert.equal(f.engine.poses.get(f.get('Ася'))?.frame,'cup');
  let sawDoor=false;for(let i=0;i<200;i++){f.engine.tick(f.all,.1,2_000_000+i*100,20,false);const a=f.get('Ася');if(a.away){assert.deepEqual(a.container,OFFICE_DOOR);sawDoor=true;break;}assert.ok(isArtWalkable(a.container));}
  assert.ok(sawDoor);assert.ok(f.events.includes('🚪 Ася ушла домой'));
  assert.ok(!f.get('Лёха').away&&!f.get('Евгений').away&&!f.get('Марина').away);
  assert.ok(f.all.filter(a=>a.cat).every(a=>!a.away));
});
test('bridge working brings a home hero through door at ×1.8 gait and seats at desk, then leaves again',()=>{
  const f=fixture(['Ася','Лёха','Евгений']);f.tick();f.engine.tick(f.all,.1,2_000_000,20,false);
  for(let i=0;i<200&&!f.get('Ася').away;i++)f.engine.tick(f.all,.1,2_000_100+i*100,20,false);
  const a=f.get('Ася');assert.ok(a.away);a.apiStatus='working';
  f.engine.tick(f.all,.1,3_000_000,20,false);
  assert.equal(f.engine.people.get('ася')!.phase,'rushing');assert.ok(!a.away);
  assert.deepEqual(a.container,OFFICE_DOOR);assert.ok(f.engine.opacity(a)>0&&f.engine.opacity(a)<1);
  f.engine.tick(f.all,.2,3_000_200,20,false); // finish the door fade before walking
  f.engine.tick(f.all,.1,3_000_300,20,false);
  assert.ok(Math.abs(Math.hypot(a.container.x-OFFICE_DOOR.x,a.container.y-OFFICE_DOOR.y)-RUSH_SPEED*.1)<.01);
  assert.ok(f.engine.bubbles.get(a)?.includes('💨'));assert.ok(f.events.some(e=>e.includes('Ася срочно примчалась')));
  for(let i=0;i<160;i++)f.engine.tick(f.all,.1,3_000_100+i*100,20,false);
  assert.equal(f.engine.people.get('ася')!.phase,'present');assert.deepEqual(a.container,{x:a.homeX,y:a.homeY});
  a.apiStatus='idle';f.engine.tick(f.all,.1,4_000_000,20,false);f.engine.tick(f.all,.1,6_000_000,20,false);
  assert.equal(f.engine.people.get('ася')!.phase,'farewell');
});
test('scheduled morning arrival returns Marina and keeps whoami home until noon',()=>{
  const f=fixture(['Марина','whoami','Евгений']);f.setHour(3);f.tick();f.engine.tick(f.all,.1,2_000_000,3,false);
  for(let i=0;i<200;i++)f.engine.tick(f.all,.1,2_000_100+i*100,3,false);
  assert.ok(f.get('Марина').away&&f.get('whoami').away);
  f.setHour(9);f.tick(15);assert.equal(f.engine.people.get('марина')!.phase,'present');assert.ok(f.get('whoami').away);
  f.setHour(12);f.tick(20);assert.ok(!f.get('whoami').away);assert.equal(f.engine.people.get('whoami')!.phase,'present');
});
test('owner sleeps in both supplied chair poses, reacts once to red/new work and yawns at 07:00',()=>{
  const f=fixture(['Евгений','Марина','Лёха']);f.setHour(23);f.tick(1);assert.equal(f.engine.phase,'chair');
  const first=f.engine.poses.get(f.get('Евгений'))?.frame;f.tick(7);assert.notEqual(f.engine.poses.get(f.get('Евгений'))?.frame,first);
  f.tick(.1,true);assert.equal(f.engine.phase,'wake');assert.equal(f.engine.poses.get(f.get('Евгений'))?.frame,'owner_wake');
  f.tick(2.3,true);assert.equal(f.engine.phase,'awake');f.tick(23,true);assert.equal(f.engine.phase,'chair');
  f.get('Лёха').apiStatus='working';f.tick();assert.equal(f.engine.phase,'wake');f.tick(25);assert.equal(f.engine.phase,'chair');
  f.setHour(7);f.tick();assert.equal(f.engine.poses.get(f.get('Евгений'))?.frame,'owner_yawn');f.tick(2);assert.equal(f.engine.phase,'awake');assert.ok(!f.get('Евгений').away);
});
test('full unrotated mattress rectangle is walkable, clear of bed, desks AND Sanya chair',()=>{
  assert.ok(mattressFits());
  // Measured chair silhouette extends above the existing desk furniture mask.
  const obstacles=[{x:638,y:444,width:68,height:57},{x:567,y:225,width:73,height:49},{x:698,y:348,width:111,height:91},{x:398,y:405,width:167,height:135}];
  for(const r of obstacles)assert.ok(MATTRESS_RECT.x+MATTRESS_RECT.width<r.x||MATTRESS_RECT.x>r.x+r.width||MATTRESS_RECT.y+MATTRESS_RECT.height<r.y||MATTRESS_RECT.y>r.y+r.height);
  const m=JSON.parse(readFileSync('public/heroes-ai/atlas.json','utf8'));
  for(const key of ['back','side']){const p=m.owner_night_props[key];const s=Math.min(MATTRESS_RECT.width/p.width,MATTRESS_RECT.height/p.height);assert.ok(p.width*s<=MATTRESS_RECT.width&&p.height*s<=MATTRESS_RECT.height);}
});
test('only owner/Leha/cats: floor sleep; cats leave both beds, stranger arrival rolls in <1s and desk <5s',()=>{
  const f=fixture(['Евгений','Лёха','Коржик','Масяня']);f.setHour(0);f.tick(20);
  assert.equal(f.engine.phase,'floor');assert.ok(f.all.filter(a=>a.cat).every(a=>Math.hypot(a.cat!.position.x-catHome(a.cat!).place.x,a.cat!.position.y-catHome(a.cat!).place.y)>30));
  assert.ok(!f.get('Лёха').away);const marina=actor('Марина');f.all.push(marina);f.tick(.1);assert.equal(f.engine.phase,'roll');
  f.tick(.8);assert.ok(!f.engine.mattress&&!f.engine.rolled);f.tick(3.9);
  const e=f.get('Евгений');assert.ok(Math.hypot(e.container.x-e.homeX,e.container.y-e.homeY)<1);assert.ok(!e.away);
  f.tick(12);for(const a of f.all.filter(a=>a.cat))assert.deepEqual(a.cat!.position,catHome(a.cat!).place);
});
test('owner floor alarm also reacts to Leha work; Leha quota absence does not block private sleep, returned workers rush',()=>{
  const f=fixture(['Евгений','Лёха']);f.setHour(0);f.tick(10);assert.equal(f.engine.phase,'floor');
  f.get('Лёха').apiStatus='working';f.tick();assert.equal(f.engine.phase,'roll');
  const le=f.all.splice(1,1)[0];f.tick(30);assert.equal(f.engine.phase,'floor');
  assert.ok(heroHoliday('Лёха',officeHoliday(demoQuotas('codex',1)!,1)));
  const a=actor('Ася');f.all.push(a);f.tick();f.all.splice(f.all.indexOf(a),1);f.tick();
  const returned=actor('Ася');returned.apiStatus='working';f.all.push(returned);f.tick();assert.equal(f.engine.people.get('ася')!.phase,'rushing');assert.ok(!returned.away);
  f.all.push(le);f.tick();assert.ok(!le.away);
});
test('all four demos use local overrides, preserve bridge statuses and support reset',()=>{
  for(const mode of ['evening','night','rush','mattress'] as const){const f=fixture();const before=f.all.map(a=>a.apiStatus);f.engine.launch(mode,f.all);f.tick(14);assert.deepEqual(f.all.map(a=>a.apiStatus),before);assert.ok(!f.get('Евгений').away);
    if(mode==='night')assert.equal(f.engine.phase,'chair');if(mode==='mattress')assert.equal(f.engine.phase,'floor');
    if(mode==='rush')assert.ok(f.events.some(e=>e.includes('срочно примчалась')));
    f.engine.reset(f.all);assert.ok(f.all.every(a=>!a.away));assert.equal(f.engine.phase,'awake');assert.equal(f.engine.catRoutes.size,0);
  }
});

test('initial quota absence is remembered even before a node exists, including resident Leha',()=>{
  const f=fixture(['Евгений']);f.setHour(0);f.engine.markAbsent('Лёха');f.engine.markAbsent('Ася');f.tick(10);assert.equal(f.engine.phase,'floor');
  const le=actor('Лёха');le.apiStatus='working';f.all.push(le);f.tick();assert.equal(f.engine.people.get('леха')!.phase,'rushing');
  assert.ok(f.events.some(m=>m==='🏃 Лёха срочно примчался на работу'));assert.equal(f.engine.phase,'roll');
  const asya=actor('Ася');asya.apiStatus='working';f.all.push(asya);f.tick();assert.equal(f.engine.people.get('ася')!.phase,'rushing');
});


test('resident Leha returns even idle when a quota is replenished during mattress demo',()=>{
  const f=fixture(['Евгений']);f.engine.markAbsent('Лёха');f.engine.launch('mattress',f.all);f.engine.markAbsent('Лёха');f.tick(10);
  const le=actor('Лёха');f.all.push(le);f.tick();assert.equal(f.engine.people.get('леха')!.phase,'arriving');assert.ok(!le.away);
  f.tick(15);assert.equal(f.engine.people.get('леха')!.phase,'present');assert.ok(!le.away);
});
