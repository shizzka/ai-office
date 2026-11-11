import test from 'node:test';
import assert from 'node:assert/strict';
import layout from '../office-art/layout-ai.json';
import { createCat, advanceCats, nearestFreeBed, type CatState } from '../src/components/office/catBehavior';
import { isArtWalkable } from '../src/components/office/aiOfficeNavigation';
import { createCatHunt, setHuntPointer, advanceCatHunt, stopCatHunt, startLaser, nearestWalkablePoint } from '../src/components/office/catHunt';
const floorCat=(name='Коржик',position={x:600,y:420}): CatState=>Object.assign(createCat(name,layout.heroes[name as 'Коржик'|'Масяня']),{position:{...position},phase:'walking' as const});
const d=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);

test('cursor reserves cats: Korzhik approaches at chase speed while Masyanya flees',()=>{
  const state=createCatHunt(), target={x:630,y:450};
  const korzhik=floorCat(),masyanya=floorCat('Масяня',{x:600,y:405});
  setHuntPointer(state,target,0);
  const before=d(korzhik.position,target), fear=d(masyanya.position,target);
  advanceCatHunt(state,[korzhik,masyanya],.1,.1,{random:()=>0});
  assert.ok(state.owns(korzhik)); assert.ok(state.owns(masyanya));
  // Korzhik is already close enough to prepare his pounce.
  assert.equal(state.frame(korzhik),'scene_crouch');
  assert.ok(d(masyanya.position,target)>fear);
  setHuntPointer(state,{x:670,y:460},.2);
  const start={...korzhik.position}; advanceCatHunt(state,[korzhik],.1,.2);
  assert.ok(d(korzhik.position,{x:670,y:460})<d(start,{x:670,y:460}));
  assert.ok(d(korzhik.position,start)<=21.0001); assert.ok(before>0);
});

test('pounce crouches, lifts, and moving pointer restarts pursuit',()=>{
  const state=createCatHunt(),cat=floorCat();
  setHuntPointer(state,{x:620,y:420},0); advanceCatHunt(state,[cat],0,0,{random:()=>0});
  advanceCatHunt(state,[cat],.05,.55,{random:()=>0});
  advanceCatHunt(state,[cat],.05,.7,{random:()=>0});
  assert.equal(state.frame(cat),'scene_jump'); assert.ok(state.lift(cat)>0);
  setHuntPointer(state,{x:670,y:460},.75); advanceCatHunt(state,[cat],.05,.75);
  assert.match(state.frame(cat)!,/^run_/); assert.equal(state.lift(cat),0);
});

test('idle expiry and pointer leave release cats through safe return routes',()=>{
  for(const leave of [false,true]) {
    const state=createCatHunt(),cat=createCat('Коржик',layout.heroes['Коржик']);
    setHuntPointer(state,{x:650,y:450},0); advanceCatHunt(state,[cat],.05,0);
    const before={...cat.position};
    if(leave) setHuntPointer(state,null,.1);
    advanceCatHunt(state,[cat],0,leave?.1:8);
    assert.equal(state.owns(cat),false); assert.equal(cat.phase,'returning'); assert.ok(cat.chaseReturning);
    assert.deepEqual(cat.position,before);
    assert.deepEqual(cat.route.slice(0,2),[...layout.cat_beds.sill.access,layout.cat_beds.sill.exit]);
    const heroes=Object.keys(layout.keyboards).map(name=>({name,position:layout.heroes[name as keyof typeof layout.heroes]}));
    advanceCats([cat],heroes,30,40); assert.equal(cat.phase,'home'); assert.deepEqual(cat.position,cat.home);
  }
});

test('keyboard departure preserves desk landing before a floor hunt or release',()=>{
  const state=createCatHunt(),cat=floorCat();
  cat.desk='Ярик'; cat.phase='keyboard'; cat.position={...layout.keyboards['Ярик']};
  setHuntPointer(state,{x:630,y:420},0); advanceCatHunt(state,[cat],0,0);
  assert.deepEqual(cat.route[0],layout.heroes['Ярик']); assert.equal(cat.desk,null);
  stopCatHunt(state,[cat]); assert.deepEqual(cat.route[0],layout.heroes['Ярик']);
});

test('laser lifetime is bounded and cursor preempts it without releasing ownership',()=>{
  const state=createCatHunt(),cat=floorCat();
  assert.ok(startLaser(state,10,'auto',()=>.5)); assert.equal(state.laser?.until,40);
  advanceCatHunt(state,[cat],.1,10); assert.ok(isArtWalkable(state.laser!.position));
  assert.equal(startLaser(state,11,'hero'),false);
  setHuntPointer(state,{x:640,y:450},11); assert.equal(state.laser,null); assert.ok(state.owns(cat));
  stopCatHunt(state,[cat]);
  const second=floorCat(); assert.ok(startLaser(state,20,'hero',()=>0));
  advanceCatHunt(state,[second],.1,20); advanceCatHunt(state,[second],0,40);
  assert.equal(state.laser,null); assert.equal(state.owns(second),false);
});

test('corner escape uses a walkable side route and an unclaimed bed',()=>{
  const state=createCatHunt(),masyanya=floorCat('Масяня',{x:575,y:420});
  const sleeping=createCat('Коржик',layout.heroes['Коржик']);
  sleeping.chaseReturning=true;
  setHuntPointer(state,{x:650,y:420},0); advanceCatHunt(state,[sleeping,masyanya],0,0);
  assert.equal(state.frame(masyanya),'scene_jump');
  assert.ok(masyanya.route.length>1);
  for(const point of masyanya.route.slice(0,-2)) assert.ok(isArtWalkable(point));
  assert.notEqual(masyanya.bed,sleeping.bed);
});

test('nearest projection rejects invalid input and always returns navigation floor',()=>{
  assert.equal(nearestWalkablePoint({x:NaN,y:2}),null);
  const result=nearestWalkablePoint({x:705,y:400}); assert.ok(result && isArtWalkable(result));
  assert.deepEqual(nearestWalkablePoint({x:600,y:420}),{x:600,y:420});
});

test('hero laser alternates Masyanya stalking with fleeing',()=>{
  const state=createCatHunt(),cat=floorCat('Масяня',{x:620,y:390});
  startLaser(state,0,'hero',()=>0);
  const first={...cat.position};
  advanceCatHunt(state,[cat],.1,0,{random:()=>0});
  assert.equal(state.frame(cat),'scene_crouch');
  assert.deepEqual(cat.position,first, 'stalking pauses for a pounce');
  const before={...cat.position};
  advanceCatHunt(state,[cat],.1,3.1,{random:()=>0});
  assert.ok(d(cat.position,before)>0,'fleeing phase moves away or escapes sideways');
});

test('laser dot stays on routed floor across furniture corners',()=>{
  const state=createCatHunt(); startLaser(state,0,'auto',()=>1);
  let previous={...state.laser!.position};
  for(let i=0;i<200;i++) {
    advanceCatHunt(state,[],.1,i*.1,{random:()=>.7});
    const point=state.laser!.position;
    assert.ok(isArtWalkable(point)); assert.ok(d(previous,point)<=9.50001);
    previous={...point};
  }
});

test('Masyanya leaves her original bed for a free refuge outside the cursor fear radius',()=>{
  const state=createCatHunt(),target={x:610,y:340};
  const masyanya=createCat('Масяня',layout.heroes['Масяня']);
  const sleeping=createCat('Коржик',layout.heroes['Коржик']);
  sleeping.chaseReturning=true;
  setHuntPointer(state,target,0);
  let now=0;
  for(let i=0;i<100 && state.frame(masyanya)!=='scene_jump';i++) {
    now=i*.05; advanceCatHunt(state,[sleeping,masyanya],.05,now);
  }
  assert.equal(state.frame(masyanya),'scene_jump');
  assert.equal(masyanya.bed,'qa');
  assert.ok(masyanya.chaseReturning, 'escape reserves the bed for ordinary behavior too');
  const returning=floorCat('Коржик',{x:835,y:460});
  assert.notEqual(nearestFreeBed(returning,[sleeping,masyanya,returning])?.[0],'qa');
  assert.ok(d(masyanya.home,target)>=150);
  assert.notEqual(masyanya.bed,sleeping.bed,'occupied sill remains reserved');
  const floorRoute=masyanya.route.slice(0,-2);
  let from={...masyanya.position};
  for(const to of floorRoute) {
    for(let i=0;i<=20;i++) assert.ok(isArtWalkable({x:from.x+(to.x-from.x)*i/20,y:from.y+(to.y-from.y)*i/20}));
    from=to;
  }
  for(let i=0;i<150 && state.owns(masyanya);i++) advanceCatHunt(state,[sleeping,masyanya],.05,now+(i+1)*.05);
  assert.deepEqual(masyanya.position,layout.cat_beds.qa.place);
  assert.equal(masyanya.phase,'home'); assert.ok(d(masyanya.position,target)>=150);
});

test('corner escape falls back to an unsafe free bed instead of stealing a safe occupied bed',()=>{
  const state=createCatHunt(),masyanya=createCat('Масяня',layout.heroes['Масяня']);
  const sill=createCat('Коржик',layout.heroes['Коржик']); sill.chaseReturning=true;
  const qa=createCat('Коржик',layout.cat_beds.qa.place); qa.chaseReturning=true;
  setHuntPointer(state,{x:610,y:340},0);
  for(let i=0;i<100 && state.frame(masyanya)!=='scene_jump';i++) advanceCatHunt(state,[sill,qa,masyanya],.05,i*.05);
  assert.equal(state.frame(masyanya),'scene_jump'); assert.equal(masyanya.bed,'floor');
  assert.notEqual(masyanya.bed,sill.bed); assert.notEqual(masyanya.bed,qa.bed);
});
