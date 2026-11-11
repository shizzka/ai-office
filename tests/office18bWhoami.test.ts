import assert from 'node:assert/strict';
import test from 'node:test';
import { Assets, Sprite, Texture, TextureSource } from 'pixi.js';
import { animateAtlasPose, createAtlasPose, loadHeroAtlas } from '../src/components/office/heroAtlas';
import { HUMAN_GAIT } from '../src/components/office/heroMotion';
import manifest from '../public/heroes-ai/atlas.json';

test('whoami uses all four owner poses at team height with no old animation art', () => {
  const hero = manifest.heroes.mikhalych;
  assert.equal(hero.source, 'hero-whoami-gpt-2.png');
  assert.deepEqual(Object.keys(hero.frames).filter(key=>!key.startsWith('seated_back_')), ['work', 'walk', 'stretch', 'cup']);
  assert.deepEqual(hero.walk_cycle, ['walk']);
  assert.equal(hero.walk_review.status, 'fallback');
  assert.ok(!('typing' in hero) && !('animation_source' in hero));
  for (const [index, [key, frame]] of Object.entries(hero.frames).filter(([key])=>!key.startsWith('seated_back_')).entries()) {
    assert.equal(frame.source, hero.source);
    assert.equal(frame.source_pose, key);
    assert.equal(frame.source_index, index);
    assert.deepEqual(frame.foot, [288, 576]);
  }
  for (const name of ['leha', 'ivanych'] as const) {
    assert.ok(Math.abs(hero.frames.work.silhouette_height - manifest.heroes[name].frames.work.silhouette_height) <= 3);
  }
});

test('whoami keeps one walk texture, bobs with distance, reflects only with direction and rests in work', async () => {
  const original = Assets.load;
  Assets.load = (async () => new Texture({ source: new TextureSource({ width: 4096, height: 4096 }) })) as typeof Assets.load;
  try {
    await loadHeroAtlas('art');
    const root = createAtlasPose('whoami', 'walk', 'art')!;
    const sprite = root.getChildByLabel('atlas-frame') as Sprite;
    const walk = sprite.texture;
    for (const facing of [-1, 1] as const) {
      animateAtlasPose(root, 0, false, false, { facing, distance: 0, moving: true });
      assert.equal(root.y, 0);
      for (const now of [.1, .4, 1, 2]) {
        animateAtlasPose(root, now, false, false, { distance: HUMAN_GAIT.frameDistance, moving: true });
        assert.equal(sprite.texture, walk);
        assert.equal(sprite.scale.x, facing / manifest.pixel_ratio);
        assert.ok(root.y < 0 && root.y >= -HUMAN_GAIT.bob);
      }
    }
    animateAtlasPose(root, 3, false, false, { moving: false, working: true });
    assert.equal(sprite.texture.frame.x, manifest.heroes.mikhalych.frames.work.x);
    assert.equal(root.y, 0);
    animateAtlasPose(root, 4, false, false, { moving: true, distance: 7, reducedMotion: true, facing: -1 });
    assert.equal(sprite.texture, walk);
    assert.equal(root.y, 0);
    assert.equal(sprite.skew.x, 0);
    assert.equal(sprite.scale.x, -1 / manifest.pixel_ratio);
    root.destroy({ children: true });
    for (const [animation, key] of [['work', 'work'], ['stretch', 'stretch'], ['cooler', 'cup']] as const) {
      const pose = createAtlasPose('whoami', animation, 'art')!;
      const s = pose.getChildByLabel('atlas-frame') as Sprite;
      for (const now of [0, .5, 1]) {
        animateAtlasPose(pose, now, false, false, { moving: false, working: true });
        assert.equal(s.texture.frame.x, manifest.heroes.mikhalych.frames[key].x);
      }
      pose.destroy({ children: true });
    }
  } finally { Assets.load = original; }
});
