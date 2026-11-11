import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { Assets, Sprite, Texture, TextureSource } from 'pixi.js';
import { advanceDeskSeating, createDeskSeating, deskSeat, deskSeatScale, DESK_SEATS, deskPresence } from '../src/components/office/deskSeating';
import { animateAtlasPose, createAtlasPose, loadHeroAtlas } from '../src/components/office/heroAtlas';
import { advanceCats, catKeyboard, createCat } from '../src/components/office/catBehavior';
import { ART_HOMES, isArtWalkable } from '../src/components/office/aiOfficeNavigation';
import layout from '../office-art/layout-ai.json';
import atlas from '../public/heroes-ai/atlas.json';
import { workstation } from '../src/components/office/workstation';

const constant=()=>.5;
test('seated pixels retain clean edges, complete cells, wheel anchors and Taya’s pink beret',()=>{
  execFileSync('python3',['office-art/validate_seated_back.py'],{stdio:'pipe'});
});
test('every seated desk is centered on its own workspace, above the floor approach and disjoint from neighbours',()=>{
  const expected: Record<string,[number,number,number]>={'Иваныч':[90,220,354],'Тая':[265,347,351],'Ярик':[422,504,355],
    'Ася':[81,161,528],'Лёха':[230,312,522],'whoami':[381,551,520],'Евгений':[790,844,279],'Марина':[730,776,435]};
  assert.equal(Object.keys(DESK_SEATS).length,8);
  for(const [name,[left,right,bottom]] of Object.entries(expected)){
    const seat=deskSeat(name)!; const home=ART_HOMES[name as keyof typeof ART_HOMES];
    assert.ok(seat.x>=left && seat.x<=right,name); assert.equal(seat.y,bottom);
    assert.ok(isArtWalkable(home),name+' approach'); assert.equal(seat.x,home.x);
    assert.ok(Math.abs(seat.y-home.y)<=32);
    for(const [other,p] of Object.entries(DESK_SEATS)) if(p!==seat) assert.ok(Math.hypot(seat.x-p.x,seat.y-p.y)>65,name+' vs '+other);
  }
  assert.equal(deskSeat('Саня'),undefined,'OFFICE-17 uses its own front-facing seated cells');
});

test('working settles, thinks for 2–4 seconds and stands before wandering; elder stays seated',()=>{
  const life=createDeskSeating(constant);
  let p=advanceDeskSeating(life,'Ася','working',true,0,.5,true,constant);assert.equal(life.phase,'seated');assert.ok(p.seated);
  p=advanceDeskSeating(life,'Ася','working',true,60,.1,true,constant);assert.ok(p.thinking);assert.equal(life.thinkUntil,63);assert.equal(life.nextThink,120);
  p=advanceDeskSeating(life,'Ася','working',true,64,.1,true,constant);assert.ok(!p.thinking);
  p=advanceDeskSeating(life,'Ася','idle',true,65,.1,true,constant);assert.equal(life.phase,'seated');assert.ok(p.thinking);
  p=advanceDeskSeating(life,'Ася','idle',true,76,.4,true,constant);assert.ok(p.reclining&&p.seated);
  p=advanceDeskSeating(life,'Ася','idle',false,77,.1,true,constant);assert.equal(life.phase,'rising');
  p=advanceDeskSeating(life,'Ася','idle',false,78,.4,true,constant);assert.ok(!p.seated);
  const elder=createDeskSeating(constant);
  p=advanceDeskSeating(elder,'Иваныч','idle',true,1,.5,true,constant);assert.ok(p.seated&&p.thinking);
  p=advanceDeskSeating(elder,'Иваныч','idle',true,12,.5,true,constant);assert.ok(p.seated&&p.reclining);
  assert.equal(elder.phase,'seated');
  const away=createDeskSeating(constant);assert.ok(!advanceDeskSeating(away,'Ася','working',false,1,1).seated);
});

test('standing idle at home reserves the keyboard; returning owner ejects the cat and waits to sit',()=>{
  const home=layout.heroes.Ярик;
  const heroes=Object.entries(layout.heroes).map(([name,position])=>({name,position,seated:false,returningToWork:false}));
  const cat=createCat('Коржик',layout.heroes.Коржик);
  const life=createDeskSeating(constant);
  advanceCats([cat],heroes,0,0);
  assert.equal(cat.desk,null,'idle owner beside the desk must not free it');
  heroes.find(h=>h.name==='Ярик')!.position={x:875,y:468};
  advanceCats([cat],heroes,30,1);assert.equal(cat.desk,'Ярик');assert.equal(cat.phase,'keyboard');
  assert.ok(!advanceDeskSeating(life,'Ярик','idle',true,1,.5,false,constant).seated);
  heroes.find(h=>h.name==='Ярик')!.returningToWork=true;
  advanceCats([cat],heroes,.1,2);
  assert.equal(cat.desk,null);assert.equal(cat.phase,'returning');
  assert.ok(!advanceDeskSeating(life,'Ярик','idle',true,2.1,.1,false,constant).seated);
  assert.ok(advanceDeskSeating(life,'Ярик','idle',true,3,.5,true,constant).seated);
  assert.equal(deskPresence('Ярик','idle',life,true).returningToWork,true,'idle returns also reserve');
});

test('all eight seated originals animate at 3/s, select thinking/rest and return to standing without reflection',async()=>{
  const original=Assets.load; Assets.load=(async()=>new Texture({source:new TextureSource({width:4096,height:4096})})) as typeof Assets.load;
  try{
    await loadHeroAtlas('art');
    for(const id of ['mikhalych','marina','owner','ivanych','taya','asya','leha','yarik'] as const){
      const h=atlas.heroes[id],root=createAtlasPose(h.name,'work','art')!,s=root.getChildByLabel('atlas-frame') as Sprite;
      const frames=h.frames;
      for(const [now,thinking,reclining,key] of [[0,false,false,'seated_back_type_1'],[.34,false,false,'seated_back_type_2'],[.67,false,false,'seated_back_type_1'],[1,true,false,'seated_back_think'],[1,false,true,'seated_back_recline']] as const){
        animateAtlasPose(root,now,true,false,{seated:true,seatedBack:true,working:true,thinking,reclining,facing:-1});
        assert.equal(s.texture.frame.x,frames[key].x,h.name+' '+key);assert.equal(s.texture.frame.y,frames[key].y);
        assert.equal(s.scale.x,1/6);assert.equal(s.skew.x,0);assert.equal(root.y,0);
      }
      animateAtlasPose(root,1,false,false,{seated:false,seatedBack:true,moving:false});
      const neutral=h.name==='Ася'?atlas.heroes.asya.frames.typing_1:frames.cup;
      assert.deepEqual([s.texture.frame.x,s.texture.frame.y],[neutral.x,neutral.y]);
      root.destroy({children:true});
    }
  }finally{Assets.load=original;}
});

test('both typing frames place opaque wrists within 4px of every v8 keyboard/worktop',()=>{
  const report=JSON.parse(execFileSync('python3',['-c',`
import json
from PIL import Image
m=json.load(open('public/heroes-ai/atlas.json'))
marks=json.load(open('office-art/desk-seating-v8.json'))['wrists']
result=[]
for identity,frames in marks.items():
 h=m['heroes'][identity];im=Image.open('public/heroes-ai/'+h['image'])
 for i,points in enumerate(frames):
  f=h['frames']['seated_back_type_'+str(i+1)]
  for x,y in points:
   result.append(dict(name=h['name'],frame=i+1,x=x,y=y,foot=f['foot'],alpha=im.getpixel((f['x']+x,f['y']+y))[3]))
print(json.dumps(result))
`],{encoding:'utf8'}));
  for(const hand of report){
    const seat=deskSeat(hand.name)!,scale=1.53*deskSeatScale(hand.name)/6;
    const keyboard=workstation(hand.name)!.keyboard;
    const y=seat.y+(hand.y-hand.foot[1])*scale;
    assert.ok(hand.alpha>=240,hand.name+' opaque wrist');
    assert.ok(Math.abs(y-keyboard.y)<=4,`${hand.name} frame ${hand.frame}: wrist ${y}, keys ${keyboard.y}`);
    const x=seat.x+(hand.x-hand.foot[0])*scale;
    assert.ok(Math.abs(x-keyboard.x)<=32,hand.name+' hands span keyboard/worktop');
  }
  assert.equal(report.length,32);
});

test('standing people use waiting frames without stretch; only working whoami keeps his laptop',async()=>{
  await loadHeroAtlas('art');
  for(const h of Object.values(atlas.heroes)){
    if(!('seated_back_type_1' in h.frames))continue;
    const root=createAtlasPose(h.name,'work','art')!,s=root.getChildByLabel('atlas-frame') as Sprite;
    for(const working of [false,true])for(const reducedMotion of [false,true]){
      animateAtlasPose(root,1,false,false,{working,reducedMotion,moving:false});
      const neutral: {x:number;y:number}=h.name==='Ася' ? atlas.heroes.asya.frames[working&&!reducedMotion?'typing_2':'typing_1'] : h.frames.cup;
      if(h.name==='whoami'&&working) {
        assert.notEqual(s.texture.frame.x,h.frames.cup.x,'working laptop allowed');
      }else assert.deepEqual([s.texture.frame.x,s.texture.frame.y],[neutral.x,neutral.y],h.name+' standing');
    }
    root.destroy({children:true});
  }
});
