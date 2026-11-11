import test from 'node:test';
import assert from 'node:assert/strict';
import { Container, Sprite, Texture, type Renderer } from 'pixi.js';
import { createDeskEnvironment } from '../src/components/office/deskEnvironment';
import { monitorCommands, monitorKind, type MonitorPresence } from '../src/components/office/monitorContent';

test('review pages draw the act, signature, stamp, standard heading and ruled table',()=>{
  const act=monitorCommands('review-act',0);
  const labels=act.flatMap(c=>c.op==='text'?[c.text]:[]);
  assert.ok(labels.includes('АКТ ПРОВЕРКИ'));
  assert.ok(labels.includes('ПОДПИСЬ'));
  assert.ok(labels.includes('ШТАМП'));
  assert.ok(act.some(c=>c.op==='line'&&c.points.length===12),'handwritten signature polyline');
  assert.ok(act.some(c=>c.op==='line'&&c.points.join()=== '102,60,132,60,132,79,102,79,102,60'),'closed stamp border');
  const norm=monitorCommands('review-norm',0);
  assert.ok(norm.some(c=>c.op==='text'&&c.text==='ПУЭ 7.1 / ГОСТ Р 50571'));
  assert.equal(norm.filter(c=>c.op==='rect'&&c.w===25&&c.h===1).length,6,'two rows of three table entries');
  for(const x of [58,102])assert.ok(norm.some(c=>c.op==='line'&&c.points.join()===`${x},56,${x},78`));
});

test('review result recolors the same branch and replaces the actual status label',()=>{
  const red=monitorCommands('review-red',0),green=monitorCommands('review-green',0);
  const highlight='83,40,105,40,105,76,83,76,83,40';
  assert.ok(red.some(c=>c.op==='line'&&c.points.join()===highlight&&c.color===0xc97c78));
  assert.ok(green.some(c=>c.op==='line'&&c.points.join()===highlight&&c.color===0x8cba81));
  assert.ok(red.some(c=>c.op==='text'&&c.text==='ЕСТЬ ЗАМЕЧАНИЕ'));
  assert.ok(green.some(c=>c.op==='text'&&c.text==='ПРОВЕРЕНО'));
  const branches=(commands:typeof red)=>commands.flatMap(c=>c.op==='line'&&c.points.length===10&&c.points[1]===35?[c.points]:[]);
  assert.deepEqual(branches(red),branches(green));
  assert.equal(branches(red).length,4);
});

test('review control belongs to Evgeniy and explicit power overrides presence and review',()=>{
  const state:MonitorPresence={present:true,working:false,review:'red'};
  assert.deepEqual([0,1,2].map(i=>monitorKind('Евгений',i,state,0,false)),['review-act','review-norm','review-red']);
  assert.equal(monitorKind('Евгений',2,{...state,review:'green'},0,false),'review-green');
  for(const name of ['Ася','Лёха','whoami','Тая','Ярик','Марина','Иваныч']) {
    assert.equal(monitorKind(name,0,state,0,false),monitorKind(name,0,{present:true,working:false},0,false));
  }
  assert.equal(monitorKind('Евгений',0,{...state,present:false},0,false),'screensaver');
  assert.equal(monitorKind('Евгений',0,{...state,powerOff:true},0,false),'off');
});

test('scene swaps red to green in place, shares review textures with zoom and powers only the owner off',()=>{
  const root=new Container();
  const renderer={generateTexture:()=>new Texture()} as unknown as Renderer;
  const env=createDeskEnvironment(root,()=>true,{renderer});
  const presence=new Map<string,MonitorPresence>([
    ['евгений',{present:true,working:true,review:'red'}],
    ['ася',{present:true,working:true}],
  ]);
  try {
    env.update(0,presence);
    const screens=env.screens.filter(s=>s.definition.name==='Евгений');
    assert.deepEqual(screens.map(s=>s.kind),['review-act','review-norm','review-red']);
    env.open('евгений-2');
    const zoom=env.zoom.children.find(c=>c instanceof Sprite) as Sprite;
    const before=screens.map(s=>s.quad.texture);
    assert.equal(zoom.texture,before[2]);
    presence.set('евгений',{present:true,working:true,review:'green'});
    env.update(.125,presence);
    assert.deepEqual(screens.map(s=>s.kind),['review-act','review-norm','review-green']);
    assert.equal(screens[0].quad.texture,before[0]);
    assert.equal(screens[1].quad.texture,before[1]);
    assert.notEqual(screens[2].quad.texture,before[2]);
    assert.equal(zoom.texture,screens[2].quad.texture);
    presence.set('евгений',{present:true,working:true,review:'green',powerOff:true});
    env.update(.25,presence);
    assert.ok(screens.every(s=>s.kind==='off'));
    assert.equal(env.screens.find(s=>s.definition.name==='Ася')!.kind,'diff');
    assert.equal(zoom.texture,screens[2].quad.texture);
    presence.set('евгений',{present:true,working:true});env.update(.375,presence);
    assert.deepEqual(screens.map(s=>s.kind),['panel','estimate','jh-mini']);
  } finally {env.destroy();root.destroy({children:true});}
});
