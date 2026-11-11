import assert from 'node:assert/strict';
import test from 'node:test';
import { Assets, Sprite, Texture, TextureSource } from 'pixi.js';
import { animateAtlasPose, createAtlasPose, DEFAULT_HERO_RENDERER, loadHeroAtlas, atlasHeadY, setCatAtlasPose } from '../src/components/office/heroAtlas';
import { CAT_GAIT, HUMAN_GAIT } from '../src/components/office/heroMotion';
import manifest from '../public/heroes-ai/atlas.json';

test('AI atlas preserves identity, pose mapping, foot anchors and renderer isolation', async () => {
  assert.equal(DEFAULT_HERO_RENDERER, 'art');
  const originalLoad = Assets.load;
  const loaded: string[] = [];
  Assets.load = (async (url: string) => {
    loaded.push(url);
    return new Texture({ source: new TextureSource({ width: 4096, height: 4096 }) });
  }) as typeof Assets.load;
  try {
    await Promise.all([loadHeroAtlas('art'), loadHeroAtlas('art')]);
    assert.equal(loaded.length, 14, 'concurrent loads share their promise');
    assert.ok(loaded.every(url => url.startsWith('/heroes-ai/')));
    for (const hero of Object.values(manifest.heroes)) {
      for (const [animation, index] of [['sit', 0], ['work', 0], ['walk', 1], ['stretch', 2], ['cooler', 3]] as const) {
        const root = createAtlasPose(`  ${hero.name.toUpperCase()}  `, animation, 'art');
        assert.ok(root, `${hero.name} ${animation}`);
        const sprite = root.getChildByLabel('atlas-frame') as Sprite;
        assert.equal(root.alpha, 0, 'no unprepared creation frame is rendered');
        animateAtlasPose(root, 0, false, false, { reducedMotion: true });
        const neutral='seated_back_type_1' in hero.frames && (index===0 || hero.name==='Ася'&&index===3);
        const expectedIndex=neutral ? hero.name==='Ася'?Object.keys(hero.frames).indexOf('typing_1'):3 : index;
        assert.equal(sprite.texture.frame.x, Object.values(hero.frames)[expectedIndex].x);
        assert.deepEqual([sprite.pivot.x, sprite.pivot.y], [48 * manifest.pixel_ratio, 96 * manifest.pixel_ratio]);
        assert.equal(root.y, 0);
        const frame = Object.values(hero.frames)[expectedIndex];
        assert.equal(atlasHeadY(root), (frame.label_anchor[1] - frame.foot[1]) / manifest.pixel_ratio + 4, `${hero.name} head tracks ${animation}`);
        assert.equal(root.rotation, 0);
        assert.equal(sprite.texture.source.scaleMode, 'linear');
        assert.equal(sprite.texture.source.autoGenerateMipmaps, true);
        root.destroy({ children: true });
      }
    }
    assert.ok(createAtlasPose('Леха', 'work', 'art'));
    assert.equal(createAtlasPose('Неизвестный', 'work', 'art'), null);
    assert.equal(createAtlasPose('Ярик', 'work', 'graphics'), null);
    assert.equal(createAtlasPose('Ярик', 'work'), null, 'legacy default does not borrow AI textures');
    const walk = createAtlasPose('Ярик', 'walk', 'art')!;
    const sprite = walk.getChildByLabel('atlas-frame') as Sprite;
    animateAtlasPose(walk, 0, false, false);
    assert.equal(sprite.scale.x, 1 / manifest.pixel_ratio);
    animateAtlasPose(walk, 0.2, false, false);
    assert.equal(sprite.scale.x, 1 / manifest.pixel_ratio, 'time alone cannot reflect a step');
    animateAtlasPose(walk, .3, false, false, { facing: -1, distance: 7.5 });
    assert.equal(sprite.scale.x, -1 / manifest.pixel_ratio);
    assert.equal(walk.y, 0);
    animateAtlasPose(walk, 0.2, false, true);
    assert.equal(walk.alpha, 0.55);
    assert.equal(walk.rotation, 0);
    const cat = createAtlasPose('Масяня', 'work', 'art')!;
    setCatAtlasPose(cat, 'cup');
    assert.equal(atlasHeadY(cat), (manifest.heroes.masyanya.frames.cup.label_anchor[1] - 96 * manifest.pixel_ratio) / manifest.pixel_ratio + 4);
    setCatAtlasPose(cat, 'walk');
    assert.equal(atlasHeadY(cat), (manifest.heroes.masyanya.frames.walk.label_anchor[1] - 96 * manifest.pixel_ratio) / manifest.pixel_ratio + 4);
    for (const frame of ['wash','cat_stretch','belly','window'] as const) {
      setCatAtlasPose(cat, frame);
      const sprite = cat.getChildByLabel('atlas-frame') as Sprite;
      assert.equal(sprite.texture.frame.x, manifest.heroes.masyanya.frames[frame].x);
      assert.deepEqual([sprite.pivot.x,sprite.pivot.y],[48*manifest.pixel_ratio,96*manifest.pixel_ratio]);
      assert.equal(atlasHeadY(cat), (manifest.heroes.masyanya.frames[frame].label_anchor[1]-96*manifest.pixel_ratio)/manifest.pixel_ratio+4);
    }
    cat.destroy({ children: true });
    const sanya = createAtlasPose('Саня', 'sit', 'art')!;
    animateAtlasPose(sanya, 0.2, false, false, { bug: true });
    assert.equal(sanya.getChildByLabel('jar-bug'), null, 'the caught bug stays at the desk when Sanya leaves');
    const sharik = createAtlasPose('Шарик', 'work', 'art')!;
    animateAtlasPose(sharik, 0.2, false, false, { responding: true });
    assert.equal(sharik.getChildByLabel('response-tail')!.visible, true);
    animateAtlasPose(sharik, 0.2, false, true, { responding: true });
    assert.equal(sharik.getChildByLabel('response-tail')!.visible, false);
    sanya.destroy({ children: true }); sharik.destroy({ children: true });
    await loadHeroAtlas();
    const old = createAtlasPose('Ярик', 'work')!;
    animateAtlasPose(old, 0, false, false);
    assert.equal(old.y, -20);
    assert.ok(loaded.some(url => url.startsWith('/heroes/')));
    walk.destroy({ children: true }); old.destroy({ children: true });
  } finally { Assets.load = originalLoad; }
});

test('selected cartoon Yarik and photo-matched tabby Masyanya retain every pose', () => {
  assert.equal(manifest.heroes.yarik.source, 'hero-yarik-v3-1.png');
  assert.deepEqual(Object.values(manifest.heroes.yarik.frames).slice(0,4).map(f => f.source_pose), ['work','walk','stretch','cup']);
  assert.equal(manifest.heroes.owner.source, 'hero-owner-2.png');
  assert.equal(manifest.heroes.marina.source, 'hero-marina-1.png');
  const masyanya = manifest.heroes.masyanya;
  assert.equal(masyanya.source, 'hero-masyanya-v2-1.png');
  assert.equal(masyanya.activity_source, 'cat-poses-masyanya-v2-1.png');
  assert.equal(masyanya.animation_source, 'anim-masyanya-v2-1.png');
  assert.deepEqual(masyanya.excluded_animation_source_indices, [4]);
  assert.deepEqual(masyanya.walk_cycle.map(key => masyanya.frames[key as keyof typeof masyanya.frames].source_index), [0,1,2,3]);
  assert.deepEqual(masyanya.tail.map(key => masyanya.frames[key as keyof typeof masyanya.frames].source_index), [5,6]);
  for (const [key, frame] of Object.entries(masyanya.frames)) {
    const source: string = key.startsWith('run_') || key.startsWith('scene_') ? masyanya.scene_source : key.startsWith('walk_') ? masyanya.walk_source : key.startsWith('tail_') ? masyanya.animation_source
      : ['wash','cat_stretch','belly','window'].includes(key) ? masyanya.activity_source : masyanya.source;
    assert.equal(frame.source, source, `${key} uses the selected photo-matched sheet`);
    assert.notEqual(frame.source === masyanya.animation_source && frame.source_index, 4, `${key} excludes the extra fifth figure`);
  }
  // Keep the native tail crossing the quarter boundary and remove the base floor.
  assert.ok(masyanya.frames.walk.source_bounds[0] < masyanya.source_size[0]/4);
  assert.ok(masyanya.frames.work.source_bounds[3] <= 1082);
  assert.equal(manifest.heroes.korzhik.source, 'hero-korzhik-2.png');
  for (const key of ['korzhik','masyanya'] as const) {
    assert.deepEqual((['work','walk','stretch','cup','wash','cat_stretch','belly','window'] as const).map(f => manifest.heroes[key].frames[f].source_pose), ['sit','walk','lie','sleep','wash','cat_stretch','belly','window']);
  }
});


test('every selected animation plays in order and normalizes walk heights and foot baselines', () => {
  for (const hero of Object.values(manifest.heroes)) {
    const h = hero as typeof hero & { walk_cycle?: string[]; typing?: string[]; tail?: string[] };
    if (!h.walk_cycle) continue;
    const root = createAtlasPose(hero.name, 'walk', 'art')!;
    const sprite = root.getChildByLabel('atlas-frame') as Sprite;
    for (const facing of [-1, 1] as const) {
      for (let step = 0; step < 16; step++) {
        animateAtlasPose(root, step * .125, false, false, { facing, distance: step * (h.tail ? CAT_GAIT.frameDistance : HUMAN_GAIT.frameDistance), moving: true });
        if (h.tail) setCatAtlasPose(root, 'walk');
        animateAtlasPose(root, step*.125, false, false, {facing, distance:step*(h.tail ? CAT_GAIT.frameDistance : HUMAN_GAIT.frameDistance),moving:true});
        const frame = hero.frames[h.walk_cycle[step % h.walk_cycle.length] as keyof typeof hero.frames];
        assert.equal(sprite.texture.frame.x, frame.x, `${hero.name} walk phase ${step}`);
        assert.equal(sprite.texture.frame.y, frame.y);
        assert.equal(Math.sign(sprite.scale.x), facing);
        assert.deepEqual([sprite.pivot.x, sprite.pivot.y], frame.foot);
      }
    }
    root.destroy({ children: true });
    for (const [kind, cycle] of [['typing', h.typing]] as const) {
      if (!cycle?.length) continue;
      const idle = createAtlasPose(hero.name, 'work', 'art')!;
      const s = idle.getChildByLabel('atlas-frame') as Sprite;
      const seated='seated_back_type_1' in hero.frames;
      cycle.forEach((name, i) => {
        animateAtlasPose(idle, i / 3 + .01, false, false, { working: kind === 'typing', seated, seatedBack:seated });
        const expected=seated ? `seated_back_type_${i%2+1}` : name;
        assert.equal(s.texture.frame.x, hero.frames[expected as keyof typeof hero.frames].x);
      });
      animateAtlasPose(idle, 2, false, false, { working: true, reducedMotion: true,seated,seatedBack:seated });
      const resting=seated ? hero.frames['seated_back_type_1' as keyof typeof hero.frames] : hero.frames.work;
      assert.equal(s.texture.frame.x, resting.x);
      idle.destroy({ children: true });
    }
  }
});
