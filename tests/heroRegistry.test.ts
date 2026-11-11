import assert from 'node:assert/strict';
import test from 'node:test';
import { HEROES, LEGACY_AGENT_IDS, resolveAppearance } from '../src/components/office/heroRegistry';

test('each named hero keeps their appearance with an unrelated or legacy ID', () => {
  assert.equal(Object.keys(HEROES).length, 10);
  for (const [name, hero] of Object.entries(HEROES)) {
    for (const id of ['fresh-generated-uuid', 'coder', 'ded']) {
      const appearance = resolveAppearance({ id, name });
      assert.equal(appearance.kind, 'hero');
      if (appearance.kind === 'hero') assert.equal(appearance.hero, hero);
    }
  }
});

test('display-name normalization supports case, whitespace and Леха/Лёха', () => {
  for (const name of ['Леха', 'Лёха', '  ЛЁХА  ']) {
    const appearance = resolveAppearance({ id: 'any-id', name });
    assert.equal(appearance.kind, 'hero');
    if (appearance.kind === 'hero') assert.equal(appearance.hero, HEROES['лёха']);
  }
});

test('all previous IDs retain their archived appearance', () => {
  for (const id of LEGACY_AGENT_IDS) {
    assert.deepEqual(resolveAppearance({ id, name: `Old ${id}` }), { kind: 'legacy', id });
  }
});

test('an unknown new name gets a neutral human, never a random previous teammate', () => {
  assert.equal(resolveAppearance({ id: 'brand-new-id', name: 'Новый агент' }).kind, 'unknown');
  const before = resolveAppearance({ id: 'same-id', name: 'Ярик' });
  const after = resolveAppearance({ id: 'same-id', name: 'Мотя' });
  assert.equal(before.kind, 'hero');
  assert.equal(after.kind, 'hero');
  if (before.kind === 'hero' && after.kind === 'hero') assert.notEqual(before.hero, after.hero);
});
