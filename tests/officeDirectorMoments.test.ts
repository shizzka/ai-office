import test from 'node:test';
import assert from 'node:assert/strict';
import { CanvasTextMetrics, Container } from 'pixi.js';
import { createOfficeMomentsScene } from '../src/components/office/officeMomentsScene';

test('manual vacancies and stop preserve real pending deliveries and their cooldown',()=>{
  const measure=CanvasTextMetrics.measureText;
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const storage=new Map([['office-deliveries-v2',JSON.stringify({seenTotal:10,pending:7,lastStarted:0})]]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)}});
  CanvasTextMetrics.measureText=((value:string)=>({width:value.length*7,height:16})) as unknown as typeof CanvasTextMetrics.measureText;
  const layer=new Container();
  try {
    let preview=true;
    const scene=createOfficeMomentsScene(layer,false,{reducedMotion:true,preview:()=>preview});
    const marina={appearanceName:'Марина',container:new Container(),annotation:new Container(),homeX:749,homeY:450};marina.container.position.set(749,450);
    scene.launch('vacancies',[marina],1);scene.tick([marina],{bugs:0,total:12,latestCount:2},0,2,0);
    assert.equal(scene.busy,true);assert.equal(layer.getChildByLabel('delivery-bubble')!.visible,true);
    assert.deepEqual(JSON.parse(storage.get('office-deliveries-v2')!),{seenTotal:10,pending:7,lastStarted:0});
    scene.stop();scene.tick([marina],{bugs:0,total:12,latestCount:2},0,3,0);
    assert.equal(scene.busy,false);assert.equal(layer.getChildByLabel('delivery-bubble')!.visible,false);
    const saved=JSON.parse(storage.get('office-deliveries-v2')!);assert.deepEqual(saved,{seenTotal:12,pending:9,lastStarted:0});
    preview=false;scene.tick([marina],{bugs:0,total:12,latestCount:2},0,4,0);
    assert.equal(layer.getChildByLabel('delivery-bubble')!.visible,true);
    const consumed=JSON.parse(storage.get('office-deliveries-v2')!);assert.equal(consumed.pending,0);assert.ok(consumed.lastStarted>0);
  } finally {
    layer.destroy({children:true});CanvasTextMetrics.measureText=measure;
    if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete (globalThis as {localStorage?:Storage}).localStorage;
  }
});
