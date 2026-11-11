import assert from 'node:assert/strict';
import test from 'node:test';
import layout from '../office-art/layout-ai.json';
import { keyboardCatFeet, workstation, workstationOccupied, WORKSTATIONS, type DeskPresence } from '../src/components/office/workstation';
import { advanceCats, createCat, catKeyboard } from '../src/components/office/catBehavior';
import { deskSeat } from '../src/components/office/deskSeating';

test('every workstation reserves seated, standing and walking owners throughout its apron, including >36px regression',()=>{
  for (const name of Object.keys(WORKSTATIONS)) {
    const d=workstation(name)!;
    for (const position of [d.home,deskSeat(name)!,{x:d.home.x+45,y:d.home.y},
      {x:d.zone.left,y:d.zone.top},{x:d.zone.right,y:d.zone.bottom}]) {
      assert.ok(workstationOccupied(name,[{name,position,seated:false}]),name+JSON.stringify(position));
    }
    assert.ok(workstationOccupied(name,[{name,position:{x:875,y:490},seated:true}]),'explicit seated posture');
    assert.ok(!workstationOccupied(name,[{name:'other',position:d.home,seated:true}]),'ownership matters');
  }
});

test('away, cooler, coffee, distant scene, offline, outside office and holiday release the desk',()=>{
  for (const name of Object.keys(WORKSTATIONS)) {
    const d=workstation(name)!;
    for (const position of [{x:875,y:468},{x:872,y:484},{x:600,y:455},{x:-100,y:-100}]) {
      assert.ok(!workstationOccupied(name,[{name,position,seated:false}]),name+JSON.stringify(position));
    }
    assert.ok(!workstationOccupied(name,[]),'removed/holiday owner');
    assert.ok(!workstationOccupied(name,[{name,position:d.home,seated:true,returningToWork:true,absent:true}]),'absence overrides stale posture');
  }
});

test('return intent, including idle return and chair target, ejects both perched and climbing cats before 120px',()=>{
  for (const returning of [{returningToWork:true},{target:layout.heroes.Ярик}]) {
    for (const climbing of [false,true]) {
      const heroes:DeskPresence[]=Object.keys(layout.keyboards).map(name=>({name,position:workstation(name)!.home}));
      const yarik=heroes.find(h=>h.name==='Ярик')!;yarik.position={x:875,y:468};
      const cat=createCat('Коржик',layout.heroes.Коржик);
      advanceCats([cat],heroes,30,30);assert.equal(cat.phase,'keyboard');
      if(climbing){cat.phase='walking';cat.route=[catKeyboard('Ярик')!];}
      Object.assign(yarik,returning);
      assert.ok(Math.hypot(yarik.position.x-layout.heroes.Ярик.x,yarik.position.y-layout.heroes.Ярик.y)>120);
      advanceCats([cat],heroes,0,31);
      assert.equal(cat.desk,null);assert.equal(cat.phase,'returning');
      assert.deepEqual(cat.route[0],layout.heroes.Ярик,'finish descent before floor route');
    }
  }
});

test('screenshot regression: Yarik, Asya and Taya idle beside their own desks never invite cats',()=>{
  const heroes=Object.keys(WORKSTATIONS).map(name=>({name,position:{x:workstation(name)!.home.x+40,y:workstation(name)!.home.y},seated:false}));
  const pair=['Коржик','Масяня'].map(name=>createCat(name,layout.heroes[name as 'Коржик'|'Масяня']));
  advanceCats(pair,heroes,30,30);
  assert.ok(pair.every(c=>c.desk===null&&c.phase==='home'));
});

test('cat destinations align with v8 keys, central screens and QA laptop',()=>{
  for (const name of Object.keys(layout.keyboards)) assert.deepEqual(catKeyboard(name),keyboardCatFeet(name),name);
  assert.deepEqual(workstation('Евгений')!.keyboard,{x:814,y:205});
  assert.deepEqual(workstation('whoami')!.keyboard,{x:462,y:448});
  assert.deepEqual(workstation('Марина')!.keyboard,{x:753,y:360});
});
