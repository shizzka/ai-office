import test from 'node:test';
import assert from 'node:assert/strict';
import { Container, Sprite } from 'pixi.js';
import sharp from 'sharp';
import { createDeskEnvironment, DESK_SCREENS } from '../src/components/office/deskEnvironment';

// Independently measured on the native painting with coordinate-grid crops.
// These fixtures intentionally do not import or derive native glass edges from production.
const measured:Record<string,number[]>={
 'ася-0':[246,1032,447,1032,447,1140,246,1140],
 'леха-0':[674,1032,879,1032,879,1140,674,1140],
 'whoami-0':[1112,1061,1227,1030,1227,1119,1112,1154],
 'whoami-1':[1260,1027,1410,1027,1410,1116,1260,1116],
 'whoami-2':[1450,1030,1557,1063,1557,1155,1450,1120],
 'тая-0':[801,646,968,646,975,749,790,749],
 'ярик-0':[1228,551,1426,551,1426,661,1228,661],
 'марина-0':[2098,815,2215,815,2215,891,2098,891],
 'евгений-0':[2125,359,2233,329,2233,424,2125,448],
 'евгений-1':[2260,329,2406,329,2406,420,2260,420],
 'евгений-2':[2435,330,2556,362,2556,448,2435,420],
 'иваныч-0':[258,618,299,618,299,632,258,632],
};
function inside(points:number[],x:number,y:number) {
  return [0,2,4,6].every(i=>{
    const j=(i+2)%8;
    return (points[j]-points[i])*(y-points[i+1])-(points[j+1]-points[i+1])*(x-points[i])>=-1e-6;
  });
}
const working=new Map(Object.keys(measured).map(id=>[id.replace(/-\d$/,''),{present:true,working:true}]));
function setup(reduced=()=>false,options:Parameters<typeof createDeskEnvironment>[2]={}) {
  const root=new Container(),env=createDeskEnvironment(root,reduced,options);
  return {root,env,dispose(){env.destroy();root.destroy({children:true});}};
}

test('twelve visible glasses follow independently measured native painting, with inscribed rects',()=>{
  assert.equal(DESK_SCREENS.length,12);
  assert.equal(DESK_SCREENS.filter(s=>s.name==='Евгений').length,3);
  assert.equal(DESK_SCREENS.some(s=>s.name==='Саня'),false,'rear-facing laptop has no visible glass; phone remains separate');
  for(const screen of DESK_SCREENS) {
    const fixture=measured[screen.id];assert.ok(fixture,screen.id);
    const expected=fixture.map((v,i)=>i%2===0?v*960/2752:32+v*536/1536);
    screen.points.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<.01,screen.id));
    const {x,y,width,height}=screen.rect;
    assert.ok(width>0&&height>0,screen.id);
    for(const [cx,cy] of [[x,y],[x+width,y],[x+width,y+height],[x,y+height]])assert.ok(inside(expected,cx,cy),screen.id);
  }
  assert.ok(DESK_SCREENS.find(s=>s.name==='Иваныч')!.bounds.height<5,'instrument LCD stays tiny');
});

test('geometry fixtures remain registered against actual background pixels, including prior bezel leaks',async()=>{
  const {data,info}=await sharp(new URL('../public/office-bg-ai.png',import.meta.url).pathname).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([info.width,info.height],[2752,1536]);
  const probes:[number,number,number[]][]=[
    [246,1032,[107,99,110]],[674,1032,[139,127,131]],[801,646,[189,177,187]],
    [1228,551,[91,87,110]],[2098,815,[66,56,80]],[1112,1061,[59,57,81]],
    [1260,1027,[60,59,90]],[1450,1030,[71,69,91]],[2125,359,[36,32,55]],
    [2260,329,[30,27,48]],[2435,330,[47,37,62]],[258,618,[215,183,186]],
    [780,680,[60,57,78]],[1260,1128,[29,25,52]],[2130,460,[51,42,69]],
  ];
  for(const [x,y,rgb] of probes)assert.deepEqual([...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)],rgb,`${x},${y}`);
  for(const [id,x,y] of [['тая-0',780,680],['whoami-1',1260,1128],['евгений-0',2130,460]] as const) {
    assert.equal(inside(measured[id],x,y),false,`${id}: known painted bezel must stay excluded`);
  }
});

test('scene throttles texture swaps, skips invisible screens and pauses while hidden',()=>{
  let hidden=false;
  const ctx=setup(()=>false,{hidden:()=>hidden,visible:s=>s.id==='ася-0'});
  try {
    const {env}=ctx;env.update(0,working);
    assert.ok(env.content.mask);
    assert.equal(env.stats.swaps,1);
    for(let i=1;i<=120;i++)env.update(i/120,working);
    const asya=env.screens.find(s=>s.definition.id==='ася-0')!;
    assert.equal(asya.updates,9,'initial frame plus at most eight swaps in one second');
    assert.ok(env.screens.filter(s=>s!==asya).every(s=>s.updates===0&&!s.quad.visible));
    hidden=true;const stats={...env.stats};env.update(40,working);assert.deepEqual(env.stats,stats);
    hidden=false;env.layer.visible=false;env.update(41,working);assert.deepEqual(env.stats,stats);
    env.layer.visible=true;env.update(42,working);assert.ok(env.stats.ticks>stats.ticks);
  } finally {ctx.dispose();}
});

test('scene responds to presence and night, and zoom shares exactly the selected quad texture',()=>{
  let night=false;const ctx=setup(()=>false,{night:()=>night});
  try {
    const {env}=ctx;env.update(0,working);
    assert.deepEqual(env.screens.filter(s=>s.definition.name==='Евгений').map(s=>s.kind),['panel','estimate','jh-mini']);
    env.open('евгений-1');assert.equal(env.zoom.visible,true);
    const selected=env.screens.find(s=>s.definition.id==='евгений-1')!;
    const enlarged=env.zoom.children.find(c=>c instanceof Sprite) as Sprite;
    assert.equal(enlarged.texture,selected.quad.texture);
    env.update(.5,new Map([['ася',{present:true,working:false}]]));
    assert.notEqual(env.screens.find(s=>s.definition.name==='Ася')!.kind,'diff');
    assert.equal(selected.kind,'screensaver');assert.equal(enlarged.texture,selected.quad.texture);
    night=true;env.update(1,new Map());assert.ok(env.screens.every(s=>s.kind==='off'));
    env.open(null);assert.equal(env.zoom.visible,false);
  } finally {ctx.dispose();}
});

test('reduced motion freezes frame and idle selection even beyond all egg periods',()=>{
  const ctx=setup(()=>true);
  try {
    const idle=new Map([...working].map(([name])=>[name,{present:true,working:false}]));
    const {env}=ctx;env.update(0,idle);
    const before=env.screens.map(s=>({key:s.key,kind:s.kind,updates:s.updates}));
    for(const time of [1,30,60,90,180,1000])env.update(time,idle);
    assert.deepEqual(env.screens.map(s=>({key:s.key,kind:s.kind,updates:s.updates})),before);
    env.update(1001,working);assert.equal(env.screens.find(s=>s.definition.name==='Ася')!.kind,'diff');
  } finally {ctx.dispose();}
});
