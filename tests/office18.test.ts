import test from 'node:test';
import assert from 'node:assert/strict';
import { Assets, Sprite, Texture, TextureSource } from 'pixi.js';
import { loadHeroAtlas, createAtlasPose, animateAtlasPose, setCatAtlasPose } from '../src/components/office/heroAtlas';
import manifest from '../public/heroes-ai/atlas.json';
import legacy from '../public/heroes/atlas.json';
import { resolveAppearance } from '../src/components/office/heroRegistry';
import { WHOAMI_TOOLTIP, WHOAMI_PHRASES, whoamiPhrase } from '../src/components/office/whoami';

test('every hero and cat drops a walking frame immediately on stopping, then resumes from distance', async () => {
  const original = Assets.load;
  Assets.load = (async () => new Texture({ source: new TextureSource({ width: 10000, height: 10000 }) })) as typeof Assets.load;
  try {
    for (const renderer of ['art', 'atlas'] as const) {
      await loadHeroAtlas(renderer);
      for (const hero of Object.values(manifest.heroes)) {
        if (renderer === 'atlas' && !(hero.name in legacy.heroes)) continue;
        const root = createAtlasPose(hero.name, 'walk', renderer)!;
        assert.ok(root, hero.name);
        const sprite = root.getChildByLabel('atlas-frame') as Sprite;
        if (['Коржик', 'Масяня'].includes(hero.name)) setCatAtlasPose(root, 'walk');
        for (const reducedMotion of [false, true]) {
          animateAtlasPose(root, 1, false, false, { moving: true, distance: 17, reducedMotion });
          for (const now of [1.016, 1.5, 2, 4]) {
            animateAtlasPose(root, now, false, false, { moving: false, distance: 17, reducedMotion });
            const work = reducedMotion ? 'work_type' : legacy.animations.work[Math.floor(now * 2) % 2] as 'work_type' | 'work_read';
            const idleFrame = 'seated_back_type_1' in hero.frames ? (hero.name==='Ася'?'typing_1':'cup') : (hero as typeof hero & { typing?: string[] }).typing?.[0] || 'work';
            const expected = renderer === 'art' ? hero.frames[idleFrame as keyof typeof hero.frames] : legacy.heroes[hero.name as keyof typeof legacy.heroes].frames[work];
            assert.deepEqual([sprite.texture.frame.x, sprite.texture.frame.y], [expected.x, expected.y], `${hero.name} ${renderer} stopped at ${now}`);
          }
          animateAtlasPose(root, 4.016, false, false, { moving: true, distance: 17, reducedMotion });
          assert.notDeepEqual([sprite.texture.frame.x, sprite.texture.frame.y], [hero.frames.work.x, hero.frames.work.y], `${hero.name} resumes walking`);
        }
        root.destroy({ children: true });
      }
    }
    const asya = createAtlasPose('Ася', 'cooler', 'art')!;
    animateAtlasPose(asya, 1, false, false, { moving: false });
    const sprite = asya.getChildByLabel('atlas-frame') as Sprite;
    assert.deepEqual([sprite.texture.frame.x, sprite.texture.frame.y],
      [manifest.heroes.asya.frames.typing_1.x, manifest.heroes.asya.frames.typing_1.y],
      'Asya cup artwork also has a stepping leg: stopping must use the planted typing rest silhouette, never stretch');
    asya.destroy({ children: true });
  } finally { Assets.load = original; }
});

test('whoami retains security appearance and role; taps reach every phrase without consecutive repeats', () => {
  const appearance = resolveAppearance({ id: 'bridge-mihalych', name: 'whoami' });
  assert.equal(appearance.kind, 'hero');
  if (appearance.kind !== 'hero') return;
  assert.equal(appearance.hero.role, 'Безопасник');
  assert.equal(appearance.hero.head, 'security');
  assert.equal(manifest.heroes.mikhalych.name, 'whoami');
  assert.equal(manifest.heroes.mikhalych.image, 'mikhalych.png');
  assert.equal(WHOAMI_TOOLTIP, 'whoami · безопасник (белый хакер)');
  assert.deepEqual(WHOAMI_PHRASES.map((_, i) => whoamiPhrase(undefined, () => i / WHOAMI_PHRASES.length)), [...WHOAMI_PHRASES]);
  for (const phrase of WHOAMI_PHRASES) for (const value of [0, .5, 1]) assert.notEqual(whoamiPhrase(phrase, () => value), phrase);
});
