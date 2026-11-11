import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { OFFICE_EVENTS, createDirectorQueue, directorQueryEvents, directorHour, directorHoliday, type DirectorRuntime, type DirectorTask } from '../src/components/office/officeDirector';
import { officeHoliday, EMPTY_QUOTAS } from '../src/components/office/officeHoliday';

const launches:Record<string,string>={evening:'time:evening',night:'time:night',blackout:'owner:breaker',rush:'attendance:rush',mattress:'attendance:mattress',
  breaker:'owner:breaker',standup:'owner:standup',pizza:'owner:pizza',rounds:'owner:rounds',short:'owner:short',review:'owner:review',
  'cat-wash':'cat:wash','cat-stretch':'cat:stretch','cat-belly':'cat:belly','cat-window':'cat:window','cat-chase':'cat:chase','cat-night':'cat:night',
  'cat-visit':'moment:visit','cat-keyboard':'cat:keyboard','cat-laser':'play:laser','cat-hero':'play:hero','cat-cursor':'cursor:',pot:'play:pot','pot-desk':'play:pot-desk',
  'holiday-codex':'holiday:codex','holiday-claude':'holiday:claude','holiday-all':'holiday:all','holiday-off':'holiday:off',
  'time-morning':'time:morning','time-day':'time:day','time-evening':'time:evening','time-night':'time:night','time-auto':'time:auto',
  'tap-sanya':'tap:Саня','tap-whoami':'tap:whoami','tap-marina':'tap:Марина','sanya-red':'regression:fail','sanya-green':'regression:pass',
  'secret-cat':'moment:visit','secret-vacancies':'moment:vacancies','secret-egg':'moment:egg',surprise:'moment:surprise',
};
function fixture(){
  const calls:string[]=[],stopped:string[]=[];let completed=false,resets=0;
  const runtime=Object.fromEntries(['attendance','owner','cat','play','moment','tap','regression','holiday','time','cursor'].map(key=>[key,(value=''):DirectorTask=>{
    const call=`${key}:${value}`;calls.push(call);return {done:()=>completed,stop:()=>stopped.push(call)};
  }])) as unknown as DirectorRuntime;
  runtime.reset=()=>{resets++;};
  return {runtime,calls,stopped,finish:()=>{completed=true;},resets:()=>resets};
}

test('every director button invokes its own concrete event handler',()=>{
  assert.equal(new Set(OFFICE_EVENTS.map(e=>e.id)).size,OFFICE_EVENTS.length);
  assert.deepEqual(OFFICE_EVENTS.map(e=>e.id).sort(),Object.keys(launches).sort());
  for(const event of OFFICE_EVENTS){const f=fixture();event.run(f.runtime);assert.deepEqual(f.calls,[launches[event.id]],event.id);assert.ok(event.name&&event.icon&&event.group);}
});
test('events start immediately, queue FIFO, and advance only after completion',()=>{
  const f=fixture(),states:unknown[]=[];let busy=false;
  const queue=createDirectorQueue(f.runtime,()=>busy,state=>states.push(state));
  queue.enqueue('pot');queue.enqueue('cat-wash');queue.enqueue('sanya-red');
  assert.deepEqual(f.calls,['play:pot']);assert.deepEqual(states.at(-1),{active:'pot',queued:2,error:null});
  queue.tick();assert.equal(f.calls.length,1);
  busy=true;f.finish();queue.tick();assert.equal(f.calls.length,1);assert.deepEqual(f.stopped,['play:pot']);
  busy=false;queue.tick();assert.deepEqual(f.calls,['play:pot','cat:wash','regression:fail']);
});
test('stop cancels the active event, empties pending events, resets local overrides, and permits restart',()=>{
  const f=fixture();let state:unknown;const queue=createDirectorQueue(f.runtime,()=>false,s=>{state=s;});
  queue.enqueue('pot');queue.enqueue('secret-vacancies');queue.stop();queue.tick();
  assert.deepEqual(f.calls,['play:pot']);assert.deepEqual(f.stopped,['play:pot']);assert.equal(f.resets(),1);
  assert.deepEqual(state,{active:null,queued:0,error:null});queue.enqueue('cat-laser');assert.equal(f.calls.at(-1),'play:laser');
});
test('ambient scenes also reserve the queue and invalid IDs cannot launch',()=>{
  const f=fixture();let busy=true;const queue=createDirectorQueue(f.runtime,()=>busy,()=>{});
  queue.enqueue('no-such-scene');queue.enqueue('cat-wash');assert.equal(f.calls.length,0);
  busy=false;queue.tick();assert.deepEqual(f.calls,['cat:wash']);
});
test('every ?scene= mode is registered; legacy demo links use this same registry',()=>{
  for(const event of OFFICE_EVENTS){assert.ok(directorQueryEvents(new URLSearchParams({scene:event.id})).includes(event.id));for(const [key,value]of event.query??[])assert.ok(directorQueryEvents(new URLSearchParams({[key]:value})).includes(event.id));}
  assert.deepEqual(directorQueryEvents(new URLSearchParams('scene=pot&pot=desk')),['pot-desk']);
  assert.deepEqual(directorQueryEvents(new URLSearchParams('scene=unknown')),[]);
  // Guard against future circles adding a separate query switch outside the registry.
  const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):/\.[jt]sx?$/.test(e.name)?[path.join(dir,e.name)]:[]);
  for(const file of walk('src')){
    const source=readFileSync(file,'utf8');
    for(const match of source.matchAll(/(?:get\(['"]scene['"]\)\s*===?\s*['"]([^'"]+)['"]|[?&]scene=([a-z0-9-]+))/g))assert.ok(OFFICE_EVENTS.some(e=>e.id===(match[1]??match[2])),`${file}: ${match[0]}`);
    if(file.endsWith('officeDirector.ts'))continue;
    assert.doesNotMatch(source,/\.get\(['"]scene['"]\)/,`${file} must dispatch through directorQueryEvents`);
  }
});
test('time and holidays affect only derived presentation data',()=>{
  assert.deepEqual(['morning','day','evening','night'].map(m=>directorHour(m as 'day')),[8,12,19,0]);
  const live=officeHoliday(EMPTY_QUOTAS,0);assert.equal(directorHoliday(live,null),live);
  assert.equal(directorHoliday(live,'all').all,true);assert.equal(directorHoliday(live,'off').all,false);assert.equal(live.all,false);
});

test('two viewers have independent queues and stopping one does not affect the other',()=>{
  const a=fixture(),b=fixture();const first=createDirectorQueue(a.runtime,()=>false,()=>{}),second=createDirectorQueue(b.runtime,()=>false,()=>{});
  first.enqueue('pot');first.enqueue('cat-wash');second.enqueue('cat-laser');first.stop();
  assert.deepEqual(b.calls,['play:laser']);assert.deepEqual(b.stopped,[]);assert.equal(b.resets(),0);
  b.finish();second.tick();assert.deepEqual(b.stopped,['play:laser']);
});
test('a failed launch restores the office, reports the reason, and allows later events',()=>{
  const f=fixture();f.runtime.play=()=>{throw new Error('Нет свободного кота');};let last:unknown;
  const queue=createDirectorQueue(f.runtime,()=>false,state=>{last=state;});queue.enqueue('pot');
  assert.equal(f.resets(),1);assert.deepEqual(last,{active:null,queued:0,error:'Нет свободного кота'});
  queue.enqueue('cat-wash');assert.deepEqual(f.calls,['cat:wash']);
});
