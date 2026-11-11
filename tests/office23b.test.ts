import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerFeatures, OWNER_FIXTURES, OWNER_PLACES, type OwnerActor } from '../src/components/office/ownerFeatures';
import { artRoute, isArtWalkable } from '../src/components/office/aiOfficeNavigation';
import { createCat } from '../src/components/office/catBehavior';
import layout from '../office-art/layout-ai.json';
import atlas from '../public/heroes-ai/atlas.json';
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const roster=():OwnerActor[]=>Object.entries(layout.heroes).map(([appearanceName,p])=>({appearanceName,container:{...p},homeX:p.x,homeY:p.y,apiStatus:'idle',moveState:'SITTING',seating:{progress:1},...(['Коржик','Масяня'].includes(appearanceName)?{cat:createCat(appearanceName,p)}:{})}));
const cells=[] as {x:number;y:number}[];
for(let y=0;y<=600;y+=4)for(let x=0;x<=960;x+=4)if(isArtWalkable({x,y}))cells.push({x,y});
test('painted breaker/board approaches are nearest floor cells, connected from the whole mesh',()=>{
  for(const key of ['breaker','standup'] as const){
    const rect=OWNER_FIXTURES[key],p=OWNER_PLACES[key],center={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
    const minimum=Math.min(...cells.map(c=>distance(c,center)));
    assert.ok(isArtWalkable(p));assert.ok(Math.abs(p.x-center.x)<=2);assert.ok(p.y>rect.y+rect.height);
    assert.ok(distance(p,center)<=minimum+4);
    // Every 4px navigation cell connects to the approach via orthogonal floor edges.
    const free=new Set(cells.map(c=>`${c.x},${c.y}`)),seen=new Set([`${p.x},${p.y}`]),queue=[p];
    for(let n=0;n<queue.length;n++)for(const [dx,dy]of [[4,0],[-4,0],[0,4],[0,-4]]){
      const a=queue[n],b={x:a.x+dx,y:a.y+dy},id=`${b.x},${b.y}`;
      if(free.has(id)&&!seen.has(id)&&[1,2,3].every(k=>isArtWalkable({x:a.x+dx*k/4,y:a.y+dy*k/4}))){seen.add(id);queue.push(b);}
    }
    assert.equal(seen.size,free.size,'disconnected office floor');
    for(const c of cells.filter(c=>c.x%32===0&&c.y%16===0))assert.ok(artRoute(c,p).length,`${key} inaccessible from ${JSON.stringify(c)}`);
    for(const a of roster().filter(a=>!a.cat))assert.ok(artRoute(a.container,p).length);
  }
});
for(const mode of ['breaker','short','standup'] as const)test(`${mode}: owner actually reaches the fixture with the correct pose/gaze`,()=>{
  const a=roster(),engine=createOwnerFeatures(),e=a.find(a=>a.appearanceName==='Евгений')!;
  engine.launch(mode,a);let reached=false;
  for(let t=0;t<120&&engine.busy;t+=.1){engine.tick(a,.1);const pose=engine.poses.get(e);
    if(pose?.frame===(mode==='standup'?'owner_point_back':'owner_breaker')){
      reached=true;const target=mode==='standup'?'standup':'breaker';assert.deepEqual(e.container,OWNER_PLACES[target]);
      assert.ok(pose.gaze&&pose.gaze.y<e.container.y);assert.equal(pose.facing,1);assert.equal(pose.seated,false);
    }
  }
  assert.ok(reached);assert.equal(engine.busy,false);
  assert.ok(atlas.heroes.owner.frames.owner_point_back.source.includes('office23b'));
});
for(const walking of [false,true])test(`pizza distributes sequentially, spreads eaters and restores everyone (walking=${walking})`,()=>{
  const a=roster();if(walking){const m=a.find(a=>a.appearanceName==='Марина')!;m.container={x:650,y:420};m.moveState='WALKING_TO';m.seating.progress=0;}
  const absent=a.find(a=>a.appearanceName==='Тая')!,holiday=a.find(a=>a.appearanceName==='Лёха')!;absent.apiStatus='offline';holiday.quiet=true;
  const present=a.filter(a=>!a.cat&&!a.quiet&&a.apiStatus!=='offline'),before=a.map(a=>({...a.container})),moves=a.map(a=>a.moveState);
  const events:string[]=[],engine=createOwnerFeatures(m=>events.push(m)),received=new Set<OwnerActor>(),started=new Map<OwnerActor,number>(),ended=new Set<OwnerActor>();
  engine.launch('pizza',a);let eating=false,shoo=false,last=false,ownerEats=false;
  for(let t=0;t<240&&engine.busy;t+=.05){
    const old=new Set(engine.slices.keys());engine.tick(a,.05);
    for(const [p,s]of engine.slices){received.add(p);assert.ok(present.includes(p));if(s.eating&&!started.has(p))started.set(p,t);}
    for(const p of old)if(!engine.slices.has(p)&&started.has(p)){const duration=t-started.get(p)!;assert.ok(duration>=19.9&&duration<=20.1,`${p.appearanceName} ate for ${duration}s`);ended.add(p);}
    if(engine.pizzaPhase==='eating'){
      eating=true;assert.equal(engine.served.size,present.length);
      for(const p of present){const cluster=present.filter(b=>distance(p.container,b.container)<=40);assert.ok(cluster.length<4,'crowded eating phase');}
      if(walking){const m=a.find(a=>a.appearanceName==='Марина')!;assert.equal(engine.poses.get(m)?.seated,false);assert.ok(present.filter(p=>p!==m).every(p=>distance(p.container,m.container)>=85));}
    }
    shoo ||= [...engine.bubbles.values()].includes('Брысь!');last ||= [...engine.bubbles.values()].includes('Не пропадать же');
    ownerEats ||= [...engine.poses.values()].some(p=>p.frame==='owner_eat');
    for(const p of a.filter(p=>!p.cat))assert.ok(isArtWalkable(p.container));
  }
  assert.ok(eating&&shoo&&last&&ownerEats);assert.equal(engine.busy,false);assert.equal(received.size,present.length);assert.equal(ended.size,present.length);
  assert.deepEqual(a.map(p=>p.container),before);assert.deepEqual(a.map(p=>p.moveState),moves);assert.equal(engine.slices.size,0);assert.equal(engine.poses.size,0);
  assert.equal(events.filter(e=>e.startsWith('🍕')).length,1);assert.equal(engine.pizzaCount,1);
});
test('pizza cancellation clears carried slices and the following celebration counts once',()=>{
  const a=roster(),engine=createOwnerFeatures();engine.launch('pizza',a);
  for(let t=0;t<100&&!engine.slices.size;t+=.1)engine.tick(a,.1);
  assert.ok(engine.slices.size);engine.stop();assert.equal(engine.slices.size,0);assert.equal(engine.pizzaPhase,null);
  engine.launch('pizza',a);for(let t=0;t<240&&engine.busy;t+=.1)engine.tick(a,.1);
  assert.equal(engine.busy,false);assert.equal(engine.pizzaCount,2);
});
test('an occupied fixture approach is cleared before the owner arrives',()=>{
 for(const mode of ['breaker','standup'] as const){
  const a=roster(),m=a.find(a=>a.appearanceName==='Марина')!,e=a.find(a=>a.appearanceName==='Евгений')!,engine=createOwnerFeatures();
  m.container={...OWNER_PLACES[mode]};m.moveState='WALKING_TO';m.seating.progress=0;
  engine.launch(mode,a);let reached=false;
  for(let t=0;t<160&&engine.busy;t+=.1){engine.tick(a,.1);if(engine.poses.get(e)?.gaze){reached=true;assert.deepEqual(e.container,OWNER_PLACES[mode]);}}
  assert.ok(reached);assert.equal(engine.busy,false);assert.deepEqual(m.container,OWNER_PLACES[mode]);
 }
});
