import test from 'node:test';
import assert from 'node:assert/strict';
import { Assets, Container, Sprite, Texture, TextureSource } from 'pixi.js';
import { animateAtlasPose, createAtlasPose, loadHeroAtlas, setCatAtlasPose } from '../src/components/office/heroAtlas';
import manifest from '../public/heroes-ai/atlas.json';

test('OFFICE-17b: world foot anchors stay within .05px for 10s, including weight shifts and seated Sanya', async () => {
  const original=Assets.load;
  Assets.load=(async () => new Texture({source:new TextureSource({width:10000,height:10000})})) as typeof Assets.load;
  try {
    await Promise.all([loadHeroAtlas('art'),loadHeroAtlas('atlas')]);
    for(const renderer of ['art','atlas'] as const) for(const hero of Object.values(manifest.heroes)) {
      for(const reducedMotion of [false,true]) {
        const root=createAtlasPose(hero.name,'work',renderer);
        if(!root) continue;
        const parent=new Container();parent.position.set(733.25,492.75);parent.scale.set(2.13);parent.addChild(root);
        const sprite=root.getChildByLabel('atlas-frame') as Sprite;
        const seated=hero.name==='Саня';
        const context={reducedMotion,seated,seatOffset:{x:17.4,y:55},seatScale:1.23};
        // Cover several independent 10s windows so an actual weight shift is
        // measured, rather than just the initial quiet interval.
        let shifts=0;
        for(let window=0;window<12;window++) {
          animateAtlasPose(root,window*10,false,false,context);
          const anchor=sprite.toGlobal(sprite.pivot);
          for(let frame=0;frame<=600;frame++) {
            animateAtlasPose(root,window*10+frame/60,false,false,context);
            const feet=sprite.toGlobal(sprite.pivot);
            assert.ok(Math.hypot(feet.x-anchor.x,feet.y-anchor.y)<=.05,`${hero.name}/${renderer}: planted world feet`);
            assert.equal(root.rotation,0);
            assert.equal(root.x,seated && renderer==='art'?17.4:0);
            if(sprite.skew.x) shifts++;
            if(reducedMotion || seated || ['Коржик','Масяня'].includes(hero.name)) assert.equal(sprite.skew.x,0);
          }
        }
        if(!reducedMotion && !seated && !['Коржик','Масяня'].includes(hero.name)) assert.ok(shifts>0,`${hero.name}: weight shifts were exercised`);
        parent.destroy({children:true});
      }
    }
  } finally {Assets.load=original;}
});

test('OFFICE-17b: cats keep the same body texture and reflection at rest; walking uses only distance', async () => {
  const original=Assets.load;
  Assets.load=(async () => new Texture({source:new TextureSource({width:10000,height:10000})})) as typeof Assets.load;
  try {
    await loadHeroAtlas('art');
    for(const name of ['Коржик','Масяня']) for(const reducedMotion of [false,true]) {
      const root=createAtlasPose(name,'work','art')!;
      const sprite=root.getChildByLabel('atlas-frame') as Sprite;
      for(const [frameIndex,frame] of (['work','cup','stretch'] as const).entries()) {
        setCatAtlasPose(root,frame);
        const texture=sprite.texture;
        let twitches=0;
        for(let i=0;i<1200;i++) {
          animateAtlasPose(root,frameIndex*120+i/10,false,false,{lookAround:i%2===0,working:true,reducedMotion,facing:i%2?-1:1});
          assert.equal(sprite.texture,texture,`${name}/${frame}: no full-body tail frames`);
          assert.equal(sprite.scale.x,1/manifest.pixel_ratio,`${name}: no idle reflection`);
          assert.equal(sprite.skew.x,0);
          assert.equal(root.getChildByLabel('resting-tail'),null);
          const ear=root.getChildByLabel('idle-ear') as Sprite;
          if(ear.visible) {
            twitches++;assert.equal(ear.texture.source,texture.source,'ear uses the current source artwork');
            assert.ok(ear.texture.frame.x>=texture.frame.x && ear.texture.frame.x+ear.texture.width<=texture.frame.x+texture.width);
            assert.ok(ear.texture.frame.y>=texture.frame.y && ear.texture.frame.y+ear.texture.height<=texture.frame.y+texture.height);
            assert.ok(ear.texture.width<=23 && ear.texture.height<=25,'only the ear is cropped');
          }
          if(reducedMotion) { assert.equal(ear.visible,false);assert.ok(sprite.mask == null); }
        }
        if(!reducedMotion) assert.ok(twitches>0,`${name}/${frame}: rare ear twitch exercised`);
      }
      setCatAtlasPose(root,'walk');
      animateAtlasPose(root,361,false,false,{moving:true,distance:12,facing:-1});
      const walking=[root.x,root.y,root.rotation,sprite.scale.x,sprite.scale.y,sprite.skew.x,sprite.texture];
      animateAtlasPose(root,413,false,false,{moving:true,distance:12,facing:-1});
      assert.deepEqual([root.x,root.y,root.rotation,sprite.scale.x,sprite.scale.y,sprite.skew.x,sprite.texture],walking);
      assert.equal(sprite.scale.y,1/manifest.pixel_ratio);
      assert.equal((root.getChildByLabel('idle-ear') as Sprite).visible,false);
      // Reusing this pose after walking also retains its last direction.
      setCatAtlasPose(root,'work');
      animateAtlasPose(root,414,false,false,{lookAround:true});
      assert.equal(sprite.scale.x,-1/manifest.pixel_ratio);
      root.destroy({children:true});
    }
  } finally {Assets.load=original;}
});
