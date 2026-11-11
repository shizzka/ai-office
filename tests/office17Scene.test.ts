import test from 'node:test';
import assert from 'node:assert/strict';
import { Assets, Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';
import { createSanyaDeskScene, SANYA_DESK } from '../src/components/office/sanyaDeskScene';
import { animateAtlasPose, createAtlasPose, loadHeroAtlas } from '../src/components/office/heroAtlas';
import { publicDcm } from '../src/lib/officeDcm';
import manifest from '../public/heroes-ai/atlas.json';
import layout from '../office-art/layout-ai.json';

const wallNow = Date.parse('2026-11-01T18:00:00Z');
const failed = publicDcm({regression:{status:'fail',timestamp:'2026-11-01T17:59:00Z'}},wallNow);

// Mock only asset IO. Real Pixi display objects exercise transforms and scene state.
test('Sanya desk is registered to the painting; phone, bug, alert and reduced motion reflect live state', async () => {
  const original=Assets.load;
  const loaded:string[]=[];
  Assets.load=(async (url:string) => {
    loaded.push(url);
    return new Texture({source:new TextureSource({width:2752,height:1536})});
  }) as typeof Assets.load;
  try {
    const scene=await createSanyaDeskScene();
    assert.deepEqual(loaded,['/office-loft/sanya-desk-front.png','/office-loft/bugjar.png','/office-loft/bugjar-empty.png','/office-loft/bugjar-bug.png']);
    assert.equal(scene.foreground.eventMode,'none');
    assert.equal(scene.bubble.eventMode,'none');
    const desk=scene.foreground.children[0] as Sprite;
    assert.deepEqual([desk.x,desk.y,desk.width,desk.height],layout.background.rendered_rect,'foreground shares the exact background registration');
    const jar=scene.foreground.getChildByLabel('sanya-bug-jar') as Sprite;
    const bug=scene.foreground.getChildByLabel('sanya-jar-bug') as Graphics;
    const glow=scene.foreground.getChildByLabel('sanya-jar-glow') as Graphics;
    const rec=scene.foreground.getChildByLabel('sanya-phone-rec') as Graphics;
    assert.deepEqual([jar.x,jar.y],[SANYA_DESK.jar.x,SANYA_DESK.jar.y]);
    assert.deepEqual([rec.x,rec.y],[SANYA_DESK.phone.x,SANYA_DESK.phone.y]);
    const node={container:new Container(),headY:-90,working:false};
    node.container.position.set(700,500);
    scene.update(.1,null,node,false,0);
    assert.equal(rec.visible,false); assert.equal(bug.visible,false); assert.equal(glow.visible,false);
    node.working=true;
    scene.update(.1,null,node,false,2);
    assert.equal(rec.visible,true); assert.equal(bug.visible,true);
    const first=[bug.x,bug.rotation];
    scene.update(.8,null,node,false,2);
    assert.equal(rec.visible,false,'recording indicator blinks only while working');
    assert.notDeepEqual([bug.x,bug.rotation],first,'tap animates caught bug');
    scene.update(2,null,node,false,2);
    assert.equal(bug.visible,false,'tap motion ends at its deadline');
    scene.update(10,failed,node,false,0);
    assert.equal(scene.bubble.visible,true); assert.equal(glow.visible,true);
    assert.deepEqual([scene.bubble.x,scene.bubble.y],[700,378],'bubble follows the actual head anchor');
    scene.update(19.99,failed,node,false,0);
    assert.equal(scene.bubble.visible,true);
    scene.update(20,failed,node,false,0);
    assert.equal(scene.bubble.visible,false); assert.equal(glow.visible,false);
    scene.update(100,failed,node,false,0);
    assert.equal(scene.bubble.visible,false,'polling the same regression cannot repeat alert');
    const next=publicDcm({regression:{status:'fail',timestamp:'2026-11-01T18:00:00Z'}},wallNow);
    scene.update(101,next,node,true,110);
    assert.equal(bug.visible,false,'reduced motion suppresses bug movement');
    assert.equal(rec.visible,true,'reduced recording indicator stays visible');
    const alpha=glow.alpha;
    scene.update(105,next,node,true,110);
    assert.equal(glow.alpha,alpha,'reduced alert glow is static');
    assert.equal(rec.visible,true);
    node.working=false;
    scene.update(106,next,node,true,110);
    assert.equal(rec.visible,false,'idle phone never records');
    scene.update(107,next,undefined,true,110);
    assert.equal(scene.bubble.visible,false,'absent Sanya has no floating speech bubble');
    scene.foreground.destroy({children:true}); scene.bubble.destroy({children:true}); node.container.destroy();
  } finally { Assets.load=original; }
});

test('every art hero breathes at its foot pivot; reduced motion retains breathing, walks have distance-only motion', async () => {
  const original=Assets.load;
  Assets.load=(async () => new Texture({source:new TextureSource({width:10000,height:10000})})) as typeof Assets.load;
  try {
    await loadHeroAtlas('art');
    for(const hero of Object.values(manifest.heroes)) {
      for(const reducedMotion of [false,true]) {
        const root=createAtlasPose(hero.name,'work','art')!;
        assert.ok(root,hero.name);
        const sprite=root.getChildByLabel('atlas-frame') as Sprite;
        const heights:number[]=[];
        for(let step=0;step<=20;step++) {
          animateAtlasPose(root,step/4,false,false,{reducedMotion});
          heights.push(sprite.scale.y);
          assert.equal(root.y,0,`${hero.name}: feet stay on floor`);
          assert.equal(sprite.pivot.y,hero.frames.work.foot[1]);
          if(reducedMotion) { assert.equal(root.x,0); assert.equal(root.rotation,0); }
        }
        assert.ok(Math.max(...heights)-Math.min(...heights)>.0059/manifest.pixel_ratio,`${hero.name} breathes over five seconds`);
        root.destroy({children:true});
      }
      const walk=createAtlasPose(hero.name,'walk','art')!;
      const sprite=walk.getChildByLabel('atlas-frame') as Sprite;
      animateAtlasPose(walk,.1,false,false,{moving:true,distance:3.75});
      const first=[walk.x,walk.y,walk.rotation,sprite.scale.y];
      animateAtlasPose(walk,4.7,false,false,{moving:true,distance:3.75});
      assert.deepEqual([walk.x,walk.y,walk.rotation,sprite.scale.y],first,`${hero.name} walk has no time-driven sway or breathing`);
      walk.destroy({children:true});
    }
    const seated=createAtlasPose('Саня','sit','art')!;
    const sprite=seated.getChildByLabel('atlas-frame') as Sprite;
    const context={seated:true,working:true,seatOffset:{x:27.4,y:55},seatScale:110/72};
    animateAtlasPose(seated,0,false,false,context);
    assert.equal(sprite.texture.frame.x,manifest.heroes.sanya.frames.seated_type_1.x);
    assert.equal(seated.y,55); assert.equal(seated.scale.y,110/72);
    animateAtlasPose(seated,.4,false,false,context);
    assert.equal(sprite.texture.frame.x,manifest.heroes.sanya.frames.seated_type_2.x);
    animateAtlasPose(seated,.4,false,false,{...context,thinking:true});
    assert.equal(sprite.texture.frame.x,manifest.heroes.sanya.frames.seated_think.x);
    animateAtlasPose(seated,.4,false,false,{...context,victory:true});
    assert.equal(sprite.texture.frame.x,manifest.heroes.sanya.frames.seated_victory.x);
    animateAtlasPose(seated,.4,false,false,{...context,reducedMotion:true});
    assert.equal(sprite.texture.frame.x,manifest.heroes.sanya.frames.seated_type_1.x);
    assert.equal(seated.x,27.4); assert.equal(seated.rotation,0);
    // The production node already scales every hero by 1.53. Seating must
    // compensate, otherwise shoes leak below the painting and chair doubles.
    const parent=new Container(); parent.position.set(677.4,493); parent.scale.set(1.53); parent.addChild(seated);
    animateAtlasPose(seated,0,false,false,{seated:true,reducedMotion:true,seatOffset:{x:0,y:55/parent.scale.y},seatScale:110/72/parent.scale.y});
    const feet=sprite.toGlobal({x:sprite.pivot.x,y:sprite.pivot.y});
    assert.ok(Math.abs(feet.x-677.4)<.01 && Math.abs(feet.y-548)<.01,'seated feet align to painted chair despite inherited hero scale');
    const unit=sprite.toGlobal({x:sprite.pivot.x+manifest.pixel_ratio,y:sprite.pivot.y});
    assert.ok(Math.abs(unit.x-feet.x-110/72)<.00001,'seated silhouette retains reviewed scene size');
    parent.removeChild(seated); parent.destroy();
    seated.destroy({children:true});
  } finally { Assets.load=original; }
});
