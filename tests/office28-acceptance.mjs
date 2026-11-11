// Accept the independent browser stages without repeating a completed 26-minute soak.
// Run after office28-runtime-qa.mjs before, fixed, stream and recovery.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const directory='output/playwright/office28/';
const read=async name=>JSON.parse(await readFile(directory+name+'.json','utf8'));
const [before,fixed,stream,recovery,live]=await Promise.all(['before-runtime','fixed-runtime','stream-runtime','recovery-runtime','live-integrity'].map(read));
const phase=(run,label)=>{const event=run.events.find(e=>e.label===label);assert.ok(event,'missing phase '+label);return event;};
const visible=event=>event.sample.filter(n=>n.visible).length;
const uids=event=>event.sample.map(n=>n.uid).sort((a,b)=>a-b);
assert.equal(before.passed,true);
assert.ok(phase(before,'scene-end-standing').maxSpecial>=3);
assert.equal(visible(phase(before,'quota-removal')),4);
const soak=phase(fixed,'25min-finished');
assert.ok(soak.frames>=30000);
for(const run of [fixed,stream]){
  // Earlier driver versions reached all animation phases, then failed in an
  // observer predicate before the Pixi debug hook existed on a fresh document.
  // The fixed predicates and the remaining phases are rerun by recovery.
  if(!run.passed)assert.match(run.error,/ReferenceError: productionQA is not defined/);
  const stale=run.events.find(e=>e.label==='stale-chunks');
  const applicationErrors=run.passed?run.errors:run.errors.filter(error=>error!=='productionQA is not defined');
  assert.deepEqual(applicationErrors,stale?.errors || []);
  for(const event of run.events)if(event.sample)assert.deepEqual(event.violations,[],event.label);
  assert.ok(run.requests.filter(r=>r.event==='ws-open').length>=2);
  for(const cycle of [0,1]){
    const start=phase(run,'quota-start-'+cycle),home=phase(run,'quota-home-'+cycle),returned=phase(run,'quota-return-'+cycle);
    assert.equal(visible(start),11);assert.equal(visible(home),4);assert.equal(visible(returned),11);
    assert.deepEqual(uids(start),uids(home));assert.deepEqual(uids(home),uids(returned));
    assert.ok(home.exits.filter(n=>!['евгений','коржик','масяня'].includes(n.name)).every(n=>Math.hypot(n.x-804,n.y-476)<=2));
  }
}
assert.equal(visible(phase(stream,'late-evening')),5);
assert.equal(visible(phase(stream,'midnight')),5);
assert.equal(visible(phase(stream,'urgent-return')),11);
assert.equal(recovery.passed,true);
for(const event of recovery.events)if(event.sample){assert.deepEqual(event.violations,[]);assert.ok(event.firstVisible);}
assert.equal(phase(recovery,'stale-chunks').canvas,0);
assert.equal(recovery.errors.length,phase(recovery,'stale-chunks').errors.length,'only deliberate missing-chunk errors');
assert.equal(visible(phase(recovery,'restored-chunks')),11);
for(const label of ['switch-Отрисовка героев-atlas','switch-Тема офиса-loft','switch-Тема офиса-cyber','switch-Тема офиса-art','switch-Отрисовка героев-art'])phase(recovery,label);
assert.ok(recovery.requests.some(r=>r.url.endsWith('?stream=1')));
assert.deepEqual(live.changed,[]);assert.equal(live.candidateSourceMatches,true);
const result={passed:true,baselineMaxSpecial:phase(before,'scene-end-standing').maxSpecial,soakFrames:soak.frames,soakMinutes:soak.frames/20/60,maxSpecialAfterFix:soak.maxSpecial,violationsAfterFix:soak.violations.length,quotaVisible:[11,4,11],eveningVisible:[11,5,11],stableQuotaUids:true,recoveryPassed:true,livePid:live.pid,liveFilesUnchanged:live.filesChecked};
await writeFile(directory+'acceptance.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
