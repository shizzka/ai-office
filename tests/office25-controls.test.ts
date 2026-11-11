import test from 'node:test';
import assert from 'node:assert/strict';
import { Assets, CanvasTextMetrics, Container, Texture, TextureSource, type Application } from 'pixi.js';
import layout from '../office-art/layout-ai.json';
import { advanceCats, advanceCatLife, createCat, createCatLife, type CatState } from '../src/components/office/catBehavior';
import { createOffice22Scene } from '../src/components/office/office22Scene';
import type { AttendanceActor } from '../src/components/office/officeAttendance';
import { createOfficeMomentsScene } from '../src/components/office/officeMomentsScene';

const pair=()=>['Коржик','Масяня'].map(name=>createCat(name,layout.heroes[name as 'Коржик'|'Масяня']));
const people=()=>Object.keys(layout.keyboards).map(name=>({name,position:{...layout.heroes[name as keyof typeof layout.heroes]}}));
const seed=(value:number)=>()=>((value=Math.imul(value,1664525)+1013904223|0)>>>0)/4294967296;
const nodes=():{appearanceName:string;cat?:CatState;container:Container;annotation:Container;homeX:number;homeY:number;apiStatus:string;moveState:string}[]=>{
  const cats=pair().map(cat=>({appearanceName:cat.name,cat,container:new Container(),annotation:new Container(),homeX:cat.home.x,homeY:cat.home.y,apiStatus:'idle',moveState:'SITTING'}));
  const marina={appearanceName:'Марина',container:new Container(),annotation:new Container(),homeX:749,homeY:450,apiStatus:'idle',moveState:'SITTING'};
  marina.container.position.set(749,450);
  return [...cats,marina];
};

test('server-controlled cat life and keyboards stay quiet while explicit demo and existing capture continue',()=>{
  const cats=pair(), life=createCatLife(()=>0), heroes=people();
  for(let now=0;now<3600;now+=10){
    assert.deepEqual(advanceCatLife(cats,heroes,10,now,life,{hour:12,autonomous:false,random:()=>0}),[]);
    assert.deepEqual(advanceCats(cats,[],10,now,new Set(),{autonomous:false}),[]);
  }
  assert.equal(life.chase,undefined);
  assert.ok(cats.every(c=>!c.activity&&!c.desk&&c.phase==='home'));
  assert.equal(advanceCatLife(cats,heroes,0,3600,life,{hour:12,autonomous:false,demo:'chase',random:()=>0}).length,1);
  const capture=pair();
  advanceCats(capture,[],0,0);
  assert.ok(capture[0].desk,'default still captures an empty keyboard');
  const desk=capture[0].desk;
  advanceCats(capture,[],100,100,new Set(),{autonomous:false});
  assert.equal(capture[0].desk,desk);
  assert.equal(capture[0].phase,'keyboard','an explicitly prepared capture finishes its route');
});

test('disabled scene timers stay quiet and manually launched lasers replay deterministically',async()=>{
  const originalLoad=Assets.load, descriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
  Assets.load=(async()=>new Texture({source:new TextureSource({width:339,height:370})})) as typeof Assets.load;
  const actors:Container[]=[];
  const scenes:Awaited<ReturnType<typeof createOffice22Scene>>[]=[];
  try{
    for(let i=0;i<2;i++){
      const layer=new Container();actors.push(layer);
      scenes.push(await createOffice22Scene({canvas:new EventTarget()} as unknown as Application,layer,{stream:true,potDemo:true,laserDemo:true,heroDemo:true,autonomous:false,random:seed(42),reduced:()=>false,emit(){throw new Error('unexpected automatic event');}}));
    }
    const casts=[nodes(),nodes()];
    for(let i=0;i<2;i++){
      scenes[i].setCursor(false);
      scenes[i].tick(casts[i],1,3600,false);
      assert.equal(scenes[i].busy,false);
      assert.equal(scenes[i].story,null);
      scenes[i].launch('laser',casts[i],3600);
    }
    const duration=scenes[0].hunt.laser!.until;
    assert.ok(duration>3620&&duration<3640);
    assert.equal(duration,scenes[1].hunt.laser!.until);
    for(let step=1;step<=100;step++){
      for(let i=0;i<2;i++)scenes[i].tick(casts[i],.05,3600+step*.05,false);
      assert.deepEqual(scenes[0].hunt.laser,scenes[1].hunt.laser);
      assert.deepEqual(casts[0].flatMap(n=>n.cat?[n.cat]:[]),casts[1].flatMap(n=>n.cat?[n.cat]:[]));
    }
  } finally {
    scenes.forEach(s=>s.destroy());actors.forEach(a=>a.destroy({children:true}));Assets.load=originalLoad;
    if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else delete(globalThis as {window?:Window}).window;
  }
});

test('server-controlled moments queue deliveries without consuming them; manual visits use injected random',()=>{
  const measure=CanvasTextMetrics.measureText, descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const saved=new Map([['office-deliveries-v2',JSON.stringify({seenTotal:10,pending:7,lastStarted:0})]]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>saved.set(key,value)}});
  CanvasTextMetrics.measureText=((value:string)=>({width:value.length*7,height:16})) as unknown as typeof CanvasTextMetrics.measureText;
  const layer=new Container();
  try{
    const scene=createOfficeMomentsScene(layer,false,{autonomous:false,random:()=>.999,reducedMotion:true});
    const cast=nodes();
    scene.tick(cast,{bugs:0,total:12,latestCount:2},1,3600,0);
    assert.equal(scene.busy,false);
    assert.ok(cast.every(n=>!n.cat?.visit));
    assert.deepEqual(JSON.parse(saved.get('office-deliveries-v2')!),{seenTotal:12,pending:9,lastStarted:0});
    scene.launch('visit',cast,3600);
    assert.equal(cast[1].cat!.visit,'outbound');
    scene.launch('vacancies',cast,3601);
    scene.tick(cast,null,0,3602,0);
    assert.equal(layer.getChildByLabel('delivery-bubble')!.visible,true);
    assert.deepEqual(JSON.parse(saved.get('office-deliveries-v2')!).pending,9);
  } finally {
    layer.destroy({children:true});CanvasTextMetrics.measureText=measure;
    if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete(globalThis as {localStorage?:Storage}).localStorage;
  }
});

test('authoritative attendance preserves server idle eligibility and departure timing across viewers',async()=>{
  const {createOfficeAttendance,OFFICE_DOOR}=await import('../src/components/office/officeAttendance');
  const {officeHome}=await import('../src/components/office/officeLayout');
  const actor=(name:string):AttendanceActor=>{const home=officeHome('art',{name});return {appearanceName:name,container:{...home},homeX:home.x,homeY:home.y,apiStatus:'idle',moveState:'SITTING',seating:{progress:1}};};
  const all=[actor('Ася'),actor('Евгений')];
  const engine=createOfficeAttendance(undefined,undefined,{authoritative:true});
  const snapshot={hour:20,actors:[{name:'Ася',status:'idle',idleSince:100,departureAt:2000,home:false},{name:'Евгений',status:'idle',idleSince:100,departureAt:null,home:false}],ownerNight:'awake' as const};
  engine.applySnapshot(snapshot,all);
  engine.tick(all,0,1999,0,false);
  assert.equal(engine.people.get('ася')!.idleSince,100);
  assert.equal(engine.people.get('ася')!.due,2000);
  assert.equal(engine.people.get('ася')!.phase,'present');
  engine.tick(all,0,2000,0,false);
  assert.equal(engine.people.get('ася')!.phase,'farewell');
  engine.applySnapshot({...snapshot,actors:snapshot.actors.map(a=>a.name==='Ася'?{...a,home:true}:a)},all);
  assert.equal(engine.people.get('ася')!.phase,'farewell','polls preserve departure animation');
  const reload=createOfficeAttendance(undefined,undefined,{authoritative:true}), newcomer=[actor('Ася')];
  reload.applySnapshot({...snapshot,actors:[{...snapshot.actors[0],home:true}]},newcomer);
  reload.tick(newcomer,0,3000,12,false);
  assert.equal(newcomer[0].away,true,'local schedule cannot bring a server-home actor back');
  assert.deepEqual(newcomer[0].container,OFFICE_DOOR);
});

test('authoritative owner night policy suppresses local mattress scenes and preserves explicit demos',async()=>{
  const {createOfficeAttendance}=await import('../src/components/office/officeAttendance');
  const home=layout.heroes.Евгений;
  const all=[{appearanceName:'Евгений',container:{...home},homeX:home.x,homeY:home.y,apiStatus:'idle',moveState:'SITTING',seating:{progress:1}}];
  const engine=createOfficeAttendance(undefined,undefined,{authoritative:true});
  const snapshot={hour:0,actors:[{name:'Евгений',status:'idle',idleSince:0,departureAt:null,home:false}],ownerNight:'awake' as 'awake'|'chair'|'mattress'};
  engine.applySnapshot(snapshot,all);engine.tick(all,0,100,0,false);
  assert.equal(engine.phase,'awake');
  engine.applySnapshot({...snapshot,ownerNight:'chair'},all);engine.tick(all,0,200,12,false);
  assert.equal(engine.phase,'chair');
  engine.launch('mattress',all);engine.tick(all,.1,300,12,false);
  assert.equal(engine.phase,'carrying','explicit director demos retain their own night path');
});
