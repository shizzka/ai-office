import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { Assets, CanvasTextMetrics, Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';
import layout from '../office-art/layout-ai.json';
import { artTextureFrame, createArtEnvironment, officeNightStrength } from '../src/components/office/artEnvironment';
import { createOfficeMomentsScene } from '../src/components/office/officeMomentsScene';

test('native painting uses the registered content rectangle and native crop coordinates', async () => {
  const asset = readFileSync(new URL('../public/office-bg-ai.png', import.meta.url));
  const metadata = await sharp(asset).metadata();
  assert.deepEqual([metadata.width,metadata.height], layout.background.source_size);
  const original = Assets.load;
  const texture = new Texture({source:new TextureSource({width:2752,height:1536})});
  Assets.load = (async () => texture) as typeof Assets.load;
  try {
    const env=await createArtEnvironment({reducedMotion:true,timeOfDay:'night'});
    const bg=env.container.getChildByLabel('art-office-background') as Sprite;
    assert.deepEqual([bg.x,bg.y,bg.width,bg.height],layout.background.rendered_rect);
    assert.equal(texture.source.scaleMode,'linear'); assert.equal(texture.source.autoGenerateMipmaps,true);
    assert.equal(texture.source.mipmapFilter,'linear');
    const leds=env.container.children.filter(c=>c.label==='motya-rack-led') as Sprite[];
    assert.equal(leds.length,15,'reuse exactly the existing five rows of painted rack LEDs');
    const frame=artTextureFrame(659,123,2,5);
    assert.deepEqual(leds[0].texture.frame,frame);
    assert.deepEqual([leds[0].x,leds[0].y,leds[0].width,leds[0].height],[659,123,2,5]);
    env.update(0,'red',true,false,0xef4444);
    const initial=leds.map(l=>l.tint);
    const panel=env.container.getChildByLabel('dcm-panel-indicator') as Container;
    const visible=panel.children.map(c=>c.visible);
    env.update(301.5,'red',true,false,0xef4444);
    assert.deepEqual(leds.map(l=>l.tint),initial,'reduced motion freezes activity LEDs');
    assert.deepEqual(panel.children.map(c=>c.visible),visible,'red regression remains static');
    assert.equal(env.container.getChildByLabel('painted-llama-face')!.visible,false);
    const status=env.container.getChildByLabel('tablet-status-light') as Graphics;
    assert.equal(status.tint,0xef4444); assert.equal(status.alpha,.85);
    assert.ok(env.container.getChildByLabel('office-window-content')!.mask,'stars are confined to window panes');
    env.container.destroy({children:true});
  } finally { Assets.load=original; }
});

test('tablet delivery card and glow share the screen mask for the entire eight seconds', () => {
  const original=CanvasTextMetrics.measureText;
  // Bounds only: this scene test needs no rasterizer or browser canvas.
  CanvasTextMetrics.measureText=((value: string) => ({width:value.length*7,height:16})) as unknown as typeof CanvasTextMetrics.measureText;
  try {
    for (const reducedMotion of [false,true]) {
      const layer=new Container();
      const scene=createOfficeMomentsScene(layer,true,{reducedMotion});
      const marina={appearanceName:'Марина',container:new Container(),annotation:new Container(),homeX:749,homeY:450};
      marina.container.position.set(749,450);
      const screen=layer.getChildByLabel('tablet-delivery-screen') as Container;
      const card=screen.getChildByLabel('delivery-vacancy-card') as Container;
      assert.ok(screen.mask);
      assert.equal((screen.mask as Graphics).label,'tablet-screen-mask');
      scene.tick([marina],null,0,6,0);
      assert.equal(card.visible,true);
      assert.equal(card.y,reducedMotion ? layout.fixtures.JH.delivery_card.y : layout.fixtures.JH.delivery_card.y-36);
      scene.tick([marina],null,0,7,0);
      assert.equal(card.y,layout.fixtures.JH.delivery_card.y);
      assert.equal(card.rotation,0);
      assert.ok(card.getChildByLabel('tablet-delivery-glow'),'glow stays inside masked card parent');
      assert.equal(layer.getChildByLabel('delivery-bubble')!.visible,true);
      scene.tick([marina],null,0,13.99,0); assert.equal(card.visible,true);
      scene.tick([marina],null,0,14,0); assert.equal(card.visible,false);
      assert.equal(layer.getChildByLabel('delivery-bubble')!.visible,false);
      layer.destroy({children:true});
    }
  } finally { CanvasTextMetrics.measureText=original; }
});

test('local evening tone fades at dawn and dusk and respects daytime', () => {
  assert.equal(officeNightStrength(2),1); assert.equal(officeNightStrength(7),.5);
  assert.equal(officeNightStrength(12),0); assert.equal(officeNightStrength(20),.5);
  assert.equal(officeNightStrength(22),1);
});
