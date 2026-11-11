import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { Assets, Container, Sprite, Texture, TextureSource, type Application } from 'pixi.js';
import layout from '../office-art/layout-ai.json';
import placements from '../office-art/pot-placements.json';
import { createCat } from '../src/components/office/catBehavior';
import { createOffice22Scene } from '../src/components/office/office22Scene';
import { createArtEnvironment } from '../src/components/office/artEnvironment';
import type { Rect } from '../src/components/office/officeAnnotations';
import type { PotStory } from '../src/components/office/potStory';

// Physical rectangles have no annotation solver's extra 3px label spacing.
const overlaps = (a:Rect,b:Rect)=>a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y;

const nativeRect = ([x, y, right, bottom]: number[]) => ({
  x: x * 960 / 2752, y: 32 + y * 536 / 1536,
  width: (right - x) * 960 / 2752, height: (bottom - y) * 536 / 1536,
});
// Independent fixtures measured on CHOICE's v8 background, including touchpad
// and the full mouse/magnifier rather than only their interior pixels.
const inputs = [[2090, 900, 2238, 968], [2240, 924, 2310, 980]].map(nativeRect);

test('opaque patches consist of the recorded neighbouring background crops', async () => {
  const source = await sharp('public/office-bg-ai.png').removeAlpha().raw().toBuffer();
  for (const [id, site] of Object.entries(placements.sites)) {
    const [x0,y0,x1,y1] = site.patch_bounds;
    const [px0,py0,px1,py1] = site.plant_bounds;
    assert.ok(x0<=px0 && y0<=py0 && x1>=px1 && y1>=py1, id);
    const image = sharp(`public/heroes-ai/pot-patch-${id}.png`);
    const metadata = await image.metadata();
    assert.equal(metadata.hasAlpha, false, 'empty site must never reveal the baked-in plant');
    assert.deepEqual([metadata.width,metadata.height], [x1-x0,y1-y0]);
    const expected = Buffer.alloc((x1-x0)*(y1-y0)*3);
    for (const clone of site.clones) {
      const [sx0,sy0,sx1,sy1]=clone.source, [tx0,ty0,tx1,ty1]=clone.target;
      for(let y=ty0;y<ty1;y++)for(let x=tx0;x<tx1;x++) {
        const sx=sx0+Math.floor((x-tx0+.5)*(sx1-sx0)/(tx1-tx0));
        const sy=sy0+Math.floor((y-ty0+.5)*(sy1-sy0)/(ty1-ty0));
        const from=(sy*2752+sx)*3,to=((y*(x1-x0))+x)*3;
        source.copy(expected,to,from,from+3);
      }
    }
    const actual = await image.removeAlpha().raw().toBuffer();
    assert.ok(actual.equals(expected), `${id}: cloned pixels differ`);
  }
});

test('director and ambient scene props replace the measured plants, clear inputs in every phase and restore identically', async () => {
  const originalLoad=Assets.load;
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(){},removeEventListener(){}}});
  const dimensions:Record<string,[number,number]>={whole:[339,370],falling:[368,407],broken:[573,365]};
  Assets.load=(async (url:string) => {
    const key=url.match(/pot-(whole|falling|broken)\.png$/)?.[1];
    const size=key?dimensions[key]:url.includes('patch-desk')?[72,95]:url.includes('patch-sill')?[67,97]:[2752,1536];
    return new Texture({source:new TextureSource({width:size[0],height:size[1]})});
  }) as typeof Assets.load;
  try {
    const env=await createArtEnvironment({reducedMotion:true,timeOfDay:'day'});
    for (const id of ['desk','sill'] as const) {
      const patch=env.container.getChildByLabel(`pot-patch-${id}`) as Sprite;
      assert.ok(patch.visible);
      assert.ok(env.container.getChildIndex(patch)<env.container.getChildIndex(env.container.getChildByLabel('office-evening-tone')!));
      const expected=nativeRect(placements.sites[id].patch_bounds);
      for (const key of ['x','y','width','height'] as const) assert.ok(Math.abs(patch[key]-expected[key])<1e-9);
      for (const input of inputs) assert.equal(overlaps(expected,input),false,`patch-${id} input`);
    }
    for (const id of ['desk','sill'] as const) {
      for (const manual of [false,true]) {
        const actors=new Container(); actors.sortableChildren=true;
        const cats=['Коржик','Масяня'].map(name=>{
          const home=layout.heroes[name as 'Коржик'|'Масяня'];
          const container=new Container();container.position.copyFrom(home);
          return {appearanceName:name,container,cat:createCat(name,home),homeX:home.x,homeY:home.y,apiStatus:'idle',moveState:'SITTING'};
        });
        const marina={appearanceName:'Марина',container:new Container(),homeX:752,homeY:450,apiStatus:'idle',moveState:'SITTING'};
        marina.container.position.set(...(id==='sill'?[752,450]:[875,468]) as [number,number]);
        const nodes=[...cats,marina];
        const app={canvas:new EventTarget()} as unknown as Application;
        const scene=await createOffice22Scene(app,actors,{stream:false,potDemo:!manual,deskDemo:id==='desk',laserDemo:false,heroDemo:false,reduced:()=>false,emit(){}});
        if(manual)scene.launch(id==='desk'?'pot-desk':'pot',nodes,0);
        else scene.tick(nodes,.05,1,false);
        assert.equal(scene.story?.site.id,id);
        const plant=actors.getChildByLabel(`pot-${id}`,true) as Sprite;
        // Independent native measurements: desk succulent and sill cactus.
        const [x,y,height]=id==='desk'?[2050,916,82]:[1646,469,84];
        assert.ok(Math.abs(plant.x-x*960/2752)<1e-9);
        assert.ok(Math.abs(plant.y-(32+y*536/1536))<1e-9);
        assert.ok(Math.abs((plant.texture.height-16)*plant.scale.y-height*536/1536)<1e-9);
        assert.ok(Math.abs(plant.y+(plant.texture.height-8-plant.anchor.y*plant.texture.height)*plant.scale.y-plant.y)<1e-9,'opaque pot base touches surface');
        const initial=[plant.x,plant.y,plant.scale.x,plant.scale.y];
        const states=new Set<string>();let sawEmpty=false,sawNew=false;
        for(let i=1;i<2400 && (scene.story || !sawNew);i++) {
          scene.tick(nodes,.05,1+i*.05,false);
          const story:PotStory|null=scene.story;
          if(story){states.add(story.phase);if(!story.whole){sawEmpty=true;assert.equal(plant.visible,false);}if(sawEmpty&&story.whole)sawNew=true;}
          for(const prop of [plant,actors.getChildByLabel('pot-falling',true),actors.getChildByLabel('pot-broken',true)] as Sprite[]) {
            if(!prop.visible)continue;
            const rect=prop.getBounds();
            for(const input of inputs) assert.equal(overlaps(rect,input),false,`${id} ${manual?'director':'ambient'} ${story?.phase} ${prop.label}: ${JSON.stringify(rect)}`);
          }
          if(!story && sawNew)break;
        }
        assert.ok(sawEmpty&&sawNew);assert.ok(states.has('guilty')&&states.has('fetch')&&states.has('happy'));
        assert.equal(scene.story,null);assert.equal(plant.visible,true);
        assert.deepEqual([plant.x,plant.y,plant.scale.x,plant.scale.y],initial);
        scene.stop();assert.equal(plant.visible,true);
        scene.destroy();actors.destroy({children:true});
      }
    }
    env.container.destroy({children:true});
  } finally {
    Assets.load=originalLoad;
    if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);
    else delete (globalThis as {window?:Window}).window;
  }
});
