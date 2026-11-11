import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_DOOR, OFFICE_DOOR_RECT, OFFICE_COOLER_RECT, DOOR_FADE_SECONDS } from '../src/components/office/officeDoor';
import { ART_HOMES, ART_NAV_CELL, ART_KITCHEN_PLACES, artRoute, isArtWalkable } from '../src/components/office/aiOfficeNavigation';
import { createOfficeAttendance, type AttendanceActor } from '../src/components/office/officeAttendance';
import { createOwnerFeatures, OWNER_PLACES } from '../src/components/office/ownerFeatures';
import { createCat } from '../src/components/office/catBehavior';
import { startPotStory, advancePotStory } from '../src/components/office/potStory';
import type { Point } from '../src/components/office/officeLayout';

const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
function atDoor(p:Point) {
  const r=OFFICE_DOOR_RECT,c=OFFICE_COOLER_RECT;
  assert.ok(p.x>=r.x-ART_NAV_CELL&&p.x<=r.x+r.width+ART_NAV_CELL&&p.y>=r.y-ART_NAV_CELL&&p.y<=r.y+r.height+ART_NAV_CELL,JSON.stringify(p));
  assert.ok(distance(p,ART_KITCHEN_PLACES[0])>=ART_NAV_CELL);
  assert.ok(Math.hypot(Math.max(c.x-p.x,0,p.x-c.x-c.width),Math.max(c.y-p.y,0,p.y-c.y-c.height))>=ART_NAV_CELL);
}
const actor=(name:keyof typeof ART_HOMES):AttendanceActor=>{
  const p=ART_HOMES[name];return {appearanceName:name,container:{...p},homeX:p.x,homeY:p.y,apiStatus:'idle',moveState:'SITTING',seating:{progress:1}};
};

test('real entrance uses the nearest threshold floor cell; all workplaces have bidirectional floor routes',()=>{
  atDoor(OFFICE_DOOR);assert.ok(isArtWalkable(OFFICE_DOOR));assert.equal(OWNER_PLACES.door,OFFICE_DOOR);
  assert.deepEqual(ART_KITCHEN_PLACES[0],{x:875,y:468},'cooler stays available for drinks');
  const threshold={x:OFFICE_DOOR_RECT.x+OFFICE_DOOR_RECT.width/2,y:OFFICE_DOOR_RECT.y};
  for(let y=0;y<=600;y+=ART_NAV_CELL)for(let x=0;x<=960;x+=ART_NAV_CELL){
    const p={x,y};if(isArtWalkable(p))assert.ok(distance(OFFICE_DOOR,threshold)<=distance(p,threshold));
  }
  for(const p of Object.values(ART_HOMES))for(const [from,to]of [[p,OFFICE_DOOR],[OFFICE_DOOR,p]]){
    const route=artRoute(from,to);assert.ok(route.length);assert.deepEqual(route.at(-1),to);
    let previous=from;
    for(const next of route){const steps=Math.ceil(distance(previous,next));for(let k=0;k<=steps;k++){
      const t=steps?k/steps:0;assert.ok(isArtWalkable({x:previous.x+(next.x-previous.x)*t,y:previous.y+(next.y-previous.y)*t}));
    }previous=next;}
  }
});

test('every departing worker fades at the door for 0.3s; urgent, morning and quota arrivals start at that door',()=>{
  const names=(Object.keys(ART_HOMES) as (keyof typeof ART_HOMES)[]).filter(n=>!['Евгений','Лёха'].includes(n));
  const all=names.map(actor),engine=createOfficeAttendance(),fading=new Map<string,number>();
  engine.tick(all,0,0,3,false);
  for(let k=0;k<800&&!all.every(a=>a.away);k++){
    engine.tick(all,.05,2_000_000+k*50,3,false);
    for(const a of all){
      if(a.away)atDoor(a.container);
      else if(engine.opacity(a)<1){atDoor(a.container);fading.set(a.appearanceName,(fading.get(a.appearanceName)??0)+.05);}
    }
  }
  assert.ok(all.every(a=>a.away));assert.equal(fading.size,names.length);
  for(const duration of fading.values())assert.ok(duration>=.2&&duration<=DOOR_FADE_SECONDS);
  for(const mode of ['urgent','morning','quota'] as const)for(const name of names){
    const a=actor(name),e=createOfficeAttendance();
    if(mode==='quota')e.markAbsent(name);
    else{e.tick([a],0,0,3,false);e.arrive(name,[a]);}
    if(mode==='urgent')a.apiStatus='working';
    const hour=mode==='urgent'?3:12;
    e.tick([a],0,100, hour,false);assert.ok(!a.away);atDoor(a.container);assert.equal(e.opacity(a),0);
    e.tick([a],.15,250,hour,false);atDoor(a.container);assert.ok(Math.abs(e.opacity(a)-.5)<1e-9);
    e.tick([a],.15,400,hour,false);atDoor(a.container);assert.equal(e.opacity(a),1);
    e.tick([a],.1,500,hour,false);assert.ok(distance(a.container,OFFICE_DOOR)>0);
    for(let k=0;k<400;k++)e.tick([a],.05,550+k*50,hour,false);
    assert.deepEqual(a.container,{x:a.homeX,y:a.homeY});
  }
});

test('pizza owner leaves and reappears only at the real entrance; stopping restores opacity',()=>{
  const a=actor('Евгений'),engine=createOwnerFeatures();engine.launch('pizza',[a]);
  let out=false,hidden=false,inside=false;
  for(let k=0;k<2400&&engine.busy;k++){
    engine.tick([a],.05);const p=engine.poses.get(a);
    if(p?.opacity!==undefined&&p.opacity<1){atDoor(a.container);out ||=p.frame==='cup'&&p.opacity>0;hidden ||=p.opacity===0;inside ||=p.frame==='owner_pizza'&&p.opacity>0;}
  }
  assert.ok(out&&hidden&&inside);assert.equal(engine.busy,false);assert.equal(engine.poses.get(a)?.opacity,undefined);
  engine.launch('pizza',[a]);for(let k=0;k<1000&&engine.poses.get(a)?.opacity!==0;k++)engine.tick([a],.05);
  assert.equal(engine.poses.get(a)?.opacity,0);engine.stop();assert.equal(engine.poses.size,0);assert.deepEqual(a.container,{x:a.homeX,y:a.homeY});
});

for(const site of ['sill','desk'] as const)test(`Marina fetches a ${site} pot through the entrance, fading on departure and return`,()=>{
  const cat=createCat('Коржик',{x:496,y:192}),p=ART_HOMES.Марина;
  const marina={position:{...p},home:{...p},present:true,atDesk:false};
  const s=startPotStory([cat],marina,0,()=>0,site)!;assert.ok(s);
  const phases=new Set<string>();let fadeOut=false,fadeIn=false;
  for(let k=1;k<4000&&!s.complete;k++){
    advancePotStory(s,[cat],.05,k*.05,()=>0);phases.add(s.phase);
    if(['fetch-out','fetch-away','fetch-in'].includes(s.phase)){atDoor(s.marina.position);assert.deepEqual(s.marina.position,OFFICE_DOOR);}
    if(s.marinaOpacity>0&&s.marinaOpacity<1){atDoor(s.marina.position);fadeOut ||=s.phase==='fetch-out';fadeIn ||=s.phase==='fetch-in';}
  }
  assert.ok(s.complete&&fadeOut&&fadeIn);assert.ok(phases.has('fetch-away'));assert.equal(s.marinaOpacity,1);assert.deepEqual(marina.position,marina.home);
});
