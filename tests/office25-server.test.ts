import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createOwnerFeatures } from '../src/components/office/ownerFeatures';
import { officeHome } from '../src/components/office/officeLayout';
import { createCat } from '../src/components/office/catBehavior';
const require = createRequire(import.meta.url);
const {WebSocket} = require('ws');
const {createOfficeEngine, getOfficeStats} = require('../worker/office-engine');
const {createOfficeServer} = require('../worker/ws-server');
const {parseBugs, parsePipeline} = require('../worker/office-stats');
const {EVENT_DURATIONS} = require('../worker/office-engine');

function fixture() {
  const root=mkdtempSync(path.join(tmpdir(),'office25-'));
  const databasePath=path.join(root,'stats.sqlite'),configPath=path.join(root,'projects.json');
  const backlog=path.join(root,'BACKLOG.md'),pipeline=path.join(root,'pipeline.log'),vacancies=path.join(root,'analytics.jsonl');
  writeFileSync(backlog,'| B-1 | major | secret personal title /home/private | module | **сделано** |\n| B2 | minor | private title | module | новое |\nMention B-1 is not a record\n');
  writeFileSync(pipeline,'11:00:00 коммит abcdef1 — ROUND-1\n11:00:01 регрессия RESULT True /private/secret\n11:00:02 регрессия RESULT False /private/secret\n11:00:03 CRITIC-1 готов\n');
  writeFileSync(vacancies,JSON.stringify({event:'search_finished',run_id:'secret-run',found:18,private:'personal-name'})+'\n');
  writeFileSync(configPath,JSON.stringify({projects:[
    {id:'first',name:'First',backlog,pipeline,queue:pipeline},
    {id:'private',name:'Private Project',backlog,vacancies,hideInStream:true},
    {id:'third',name:'Third fixture',backlog,pipeline,vacancies},
  ]}));
  return {root,databasePath,configPath,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('project configuration includes a third project, numeric evidence, no source text, stream privacy',()=>{
  const f=fixture();
  try {
    const engine=createOfficeEngine({...f,schedule:false});
    const stats=engine.stats();
    assert.equal(stats.projects.length,3);
    assert.deepEqual(stats.projects[0],{id:'first',name:'First',bugsFound:2,bugsClosed:1,tasksCreated:0,tasksDone:0,regressionsPassed:1,regressionsFailed:1,loops:1,reviews:1});
    assert.equal(stats.totals.bugsFound,6);assert.equal(stats.totals.vacancies,36);
    const stream=engine.stats(true);
    assert.equal(stream.projects.length,2);assert.equal(stream.totals.bugsFound,4);
    assert.ok(!JSON.stringify(stream).includes('vacancies'));assert.ok(!JSON.stringify(stream).includes('Private Project'));
    assert.ok(!JSON.stringify(stats).includes('/private'));assert.ok(!JSON.stringify(stats).includes('personal-name'));
    engine.close();
    assert.deepEqual(getOfficeStats({...f,stream:true}).projects,stream.projects);
  }finally{f.cleanup();}
});
test('scene completion is exactly once across repeated ticks, restart, replay idempotency, demo and overlap rejection',()=>{
  const f=fixture();let now=1_800_000_000_000;
  try {
    let engine=createOfficeEngine({...f,schedule:false,clock:()=>now,sceneDurationMs:1000});
    const scene=engine.startScene('pot');assert.ok(scene);
    assert.equal(engine.startScene('pizza'),null);
    assert.equal(engine.startScene('pizza',{demo:true}),null);
    assert.equal(engine.stats().counters.potsBroken,0);
    engine.close();now+=500;
    engine=createOfficeEngine({...f,schedule:false,clock:()=>now});
    assert.deepEqual(engine.snapshot().scene,scene);
    now+=1000;engine.tick();engine.tick();
    assert.equal(engine.stats().counters.potsBroken,1);assert.equal(engine.stats().counters.pizzas,0);
    const since=engine.stats().since;engine.close();
    // Replay the exact persisted occurrence after completion: ledger must reject a second count.
    const Database=require('better-sqlite3');const db=new Database(f.databasePath);
    db.prepare("UPDATE office_scene_state SET value=? WHERE key='scene'").run(JSON.stringify(scene));db.close();
    engine=createOfficeEngine({...f,schedule:false,clock:()=>now});engine.tick();
    assert.equal(engine.stats().counters.potsBroken,1);assert.equal(engine.stats().since,since);engine.close();
  }finally{f.cleanup();}
});
test('backlog and pipeline formats count records and completed reviews without duplicate references',()=>{
  assert.deepEqual(parseBugs('| B12a | ✅ (dev) | private | x | notes |\n| B12b | 🟡 | text | x | fixed someday |\n| B12a | ✅ | again | x | |'),{bugsFound:2,bugsClosed:1,tasksCreated:0,tasksDone:0});
  const parsed=parsePipeline('10:00 коммит abcdef1 — F1\n10:01 коммит abcdef1 — F1\n10:02 docs-коммит abcdef2\n10:03 регрессия не зелёная\n10:04 старт CRITIC-2\n10:05 CRITIC-2 готов\n10:06 CRITIC-2 готов');
  assert.equal(parsed.loops,1);assert.equal(parsed.reviews,1);assert.equal(parsed.regressionsFailed,1);
});
test('production current_status schema drives persisted attendance and identifies the urgent returning actor',()=>{
  const f=fixture(),Database=require('better-sqlite3');let now=Date.parse('2026-11-02T17:00:00Z');
  const db=new Database(f.databasePath);
  db.exec("CREATE TABLE agents(name TEXT,current_status TEXT,archived INTEGER DEFAULT 0); INSERT INTO agents(name,current_status) VALUES('Евгений','idle'),('Марина','idle');");
  let engine:any;
  try {
    engine=createOfficeEngine({...f,clock:()=>now,events:[],gapMs:0,sceneDurationMs:1000});
    const initial=engine.snapshot();
    assert.equal(initial.attendance.actors.length,2);
    const departure=initial.attendance.actors.find((actor:any)=>actor.name==='Марина').departureAt;
    assert.ok(departure>now+600_000);
    now=departure+16_000;engine.tick();assert.equal(engine.snapshot().scene.eventId,'evening');
    assert.equal(engine.snapshot().attendance.actors.find((actor:any)=>actor.name==='Марина').home,true);
    now+=1001;engine.tick();
    db.prepare("UPDATE agents SET current_status='thinking' WHERE name='Марина'").run();
    engine.tick();
    const rush=engine.snapshot().scene;assert.equal(rush.eventId,'rush');assert.equal(rush.actorName,'Марина');
    assert.equal(rush.actors.find((actor:any)=>actor.name==='Марина').status,'thinking');
    assert.ok(rush.attendance);now+=1001;engine.tick();
    assert.equal(engine.stats().counters.urgentArrivals,1);
    engine.close();engine=null;
    engine=createOfficeEngine({...f,clock:()=>now,events:[],gapMs:0,sceneDurationMs:1000});engine.tick();
    assert.equal(engine.snapshot().scene,null);assert.equal(engine.stats().counters.urgentArrivals,1);
  }finally{engine?.close();db.close();f.cleanup();}
});
test('server occurrence deadlines allow each owner scene to finish with the real full cast',()=>{
  const names=['Ярик','Лёха','Ася','Иваныч','Тая','Саня','Мотя','whoami','Люда','Шарик','Евгений','Марина','Коржик','Масяня'];
  for(const event of ['breaker','standup','pizza','rounds','short','review'] as const){
    const actors=names.map(name=>{
      const home=officeHome('art',{name});
      return {appearanceName:name,container:{...home},homeX:home.x,homeY:home.y,apiStatus:'idle',moveState:'SITTING',seating:{progress:1},...(['Коржик','Масяня'].includes(name)?{cat:createCat(name,home)}:{})};
    });
    const scene=createOwnerFeatures();scene.launch(event,actors);
    let elapsed=0;
    while(scene.busy&&elapsed<EVENT_DURATIONS[event]/1000){elapsed+=.1;scene.tick(actors,.1);}
    assert.equal(scene.busy,false,`${event} still busy after ${elapsed.toFixed(1)} seconds`);
  }
});
function connect(port:number,stream=false):Promise<{socket:any,messages:any[]}> {
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket(`ws://127.0.0.1:${port}/mcws${stream?'?stream=1':''}`),messages:any[]=[];
    socket.on('error',reject);
    socket.on('message',(raw:Buffer)=>{
      messages.push(JSON.parse(raw.toString()));
      if(messages[0]?.type==='office:state')resolve({socket,messages});
    });
  });
}
async function until(predicate:()=>boolean) {
  const deadline=Date.now()+3000;
  while(!predicate()){assert.ok(Date.now()<deadline,'timed out waiting for server snapshot');await new Promise(r=>setTimeout(r,10));}
}
test('real WS peers and late subscriber share scene; forged office events and demos cannot count; restart persists',async()=>{
  const f=fixture();let instance:any;const sockets:any[]=[];
  try {
    instance=createOfficeServer({quiet:true,port:0,host:'127.0.0.1',databasePath:f.databasePath,legacy:false,officeIntervalMs:20,office:{configPath:f.configPath,schedule:false,sceneDurationMs:450}});
    const active=instance.office.startScene('pizza');
    const address=await instance.listen(),port=address.port;
    const first=await connect(port),second=await connect(port);sockets.push(first.socket,second.socket);
    assert.deepEqual(first.messages[0].scene,active);assert.deepEqual(second.messages[0].scene,active);
    const late=await connect(port,true);sockets.push(late.socket);
    assert.deepEqual(late.messages[0].scene,active);
    assert.ok(!JSON.stringify(late.messages[0].stats).includes('vacancies'));
    assert.ok(!JSON.stringify(late.messages[0].stats).includes('Private Project'));
    first.socket.send(JSON.stringify({type:'office:complete',id:active.id,eventId:'pot'}));
    first.socket.send(JSON.stringify({type:'office:state',scene:{eventId:'pot'}}));
    const response=await fetch(`http://127.0.0.1:${port}/emit`,{method:'POST',body:JSON.stringify({type:'office:state',scene:{eventId:'pot'}})});
    assert.equal(response.status,403);
    assert.equal(instance.office.startScene('pot',{demo:true}),null);
    await until(()=>first.messages.some(row=>row.stats?.counters.pizzas===1)&&second.messages.some(row=>row.stats?.counters.pizzas===1));
    assert.equal(instance.office.stats().counters.pizzas,1);assert.equal(instance.office.stats().counters.potsBroken,0);
    await instance.close();instance=null;
    instance=createOfficeServer({quiet:true,port:0,host:'127.0.0.1',databasePath:f.databasePath,legacy:false,officeIntervalMs:20,office:{configPath:f.configPath,schedule:false}});
    const restarted=await instance.listen(),reloaded=await connect(restarted.port);sockets.push(reloaded.socket);
    assert.equal(reloaded.messages[0].stats.counters.pizzas,1);assert.equal(reloaded.messages[0].scene,null);
  }finally{for(const socket of sockets)socket.terminate();if(instance)await instance.close();f.cleanup();}
});
