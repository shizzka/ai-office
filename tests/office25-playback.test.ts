import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedPlayback, sceneRandom, type SharedScene } from '../src/components/office/sharedScene';
import { directorEvent } from '../src/components/office/officeDirector';

const scene:SharedScene={id:'occurrence',eventId:'cat-laser',seed:731,startedAt:1_000,endsAt:61_000};
function viewer(){
  let random=sceneRandom(0),position=0,starts=0,stops=0;
  const player=createSharedPlayback(s=>{random=sceneRandom(s.seed);position=0;starts++;},dt=>{position+=random()*dt;},()=>{stops++;});
  return {player,get:()=>({position,starts,stops,age:player.age})};
}
test('two FPS and late join reconstruct exactly the same seeded phase',()=>{
  const a=viewer(),b=viewer();
  for(let t=1_000;t<=25_000;t+=40)a.player.sync(scene,t);
  b.player.sync(scene,25_000);
  assert.deepEqual(a.get(),b.get());
  a.player.sync(scene,30_000);b.player.sync(scene,30_000);assert.deepEqual(a.get(),b.get());
  a.player.sync(scene,61_000);b.player.sync(null,61_000);assert.deepEqual(a.get(),b.get());assert.equal(a.get().stops,1);
});
test('repeated snapshots do not restart an occurrence; expired snapshots never launch',()=>{
  const v=viewer();v.player.sync(scene,5_000);v.player.sync({...scene},5_000);assert.equal(v.get().starts,1);
  v.player.reset();v.player.sync(scene,70_000);assert.equal(v.get().starts,1);
});
test('all attendance and outage scenes have director launch buttons',()=>{
  for(const id of ['evening','night','blackout','rush','mattress'])assert.ok(directorEvent(id));
});
