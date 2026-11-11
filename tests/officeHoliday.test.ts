import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_QUOTAS, publicQuotas, officeHoliday, demoQuotas, heroProvider, heroHoliday, holidaySceneMode, formatReset, holidayCountdown, quotaWarning } from '../src/components/office/officeHoliday';
import { advanceCats, createCat, catHome } from '../src/components/office/catBehavior';
import layout from '../office-art/layout-ai.json';
import { isAnonymousApiRequest } from '../src/lib/auth/access';
import { HEROES, normalizeHeroName, resolveAppearance } from '../src/components/office/heroRegistry';
import { sceneAgents } from '../src/components/office/jhBoard';
import { holidayLabel } from '../src/components/office/officeHoliday';

const now = Date.parse('2026-11-01T15:00:00Z') / 1000;
const reset = Date.parse('2026-11-04T15:40:00Z') / 1000;
const quota = (percent: number, resetsAt = reset, secondary?: number) => ({ ...EMPTY_QUOTAS,
  codex: { windows: [{ usedPercent: percent, resetsAt }, ...(secondary === undefined ? [] : [{ usedPercent: secondary, resetsAt: reset + 1000 }])], error: null } });

test('90% is the exact warning threshold; either window can exhaust Codex at >=100%', () => {
  for (const percent of [0, 89, 89.999]) assert.equal(officeHoliday(quota(percent), now).codex.warning, false);
  for (const percent of [90, 99.99]) {
    const state = officeHoliday(quota(percent), now);
    assert.equal(state.codex.warning, true); assert.equal(state.codex.exhausted, false);
  }
  for (const percent of [100, 101]) {
    assert.equal(officeHoliday(quota(percent), now).codex.exhausted, true);
    assert.equal(officeHoliday(quota(5, reset, percent), now).codex.exhausted, true);
  }
  assert.equal(officeHoliday(quota(5, reset, 90), now).codex.warning, true);
  assert.match(quotaWarning(officeHoliday(quota(90), now))!, /лимит Codex 90 % · сброс/);
});

test('all blocking windows must reset; the office opens when the first provider returns', () => {
  const signal = quota(100, now + 10, 101);
  signal.claude = { windows: [], error: { blocked: true, resetsAt: now + 100 } };
  const all = officeHoliday(signal, now);
  assert.equal(all.all, true); assert.equal(all.codex.resetsAt, reset + 1000);
  assert.equal(all.returnsAt, now + 100);
  assert.equal(officeHoliday(signal, now + 100).all, false);
  assert.equal(officeHoliday(signal, now + 100).codex.exhausted, true);
});

test('the same observation recovers at reset without a new fetch or process restart', () => {
  const signal = quota(100);
  assert.equal(officeHoliday(signal, reset - 1).codex.exhausted, true);
  assert.equal(officeHoliday(signal, reset).codex.exhausted, false);
  assert.equal(officeHoliday(quota(95), reset).codex.warning, false);
  const log = publicQuotas({ codex: { error: { blocked: true, resetsAt: reset } } });
  assert.equal(officeHoliday(log, now).codex.exhausted, true);
  assert.equal(officeHoliday(log, reset).codex.exhausted, false);
});

test('all-mode scene includes only the allowed active cast and a quiet rack', () => {
  const all = officeHoliday(demoQuotas('all', now)!, now);
  const roster = ['Лёха','Ася','Иваныч','Тая','Саня','Ярик','Евгений','Марина','Коржик','Масяня','Шарик','Люда','Мотя','whoami'];
  assert.deepEqual(roster.filter(n => holidaySceneMode(n, all) === 'normal'), ['Евгений','Марина','Коржик','Масяня']);
  assert.deepEqual(roster.filter(n => holidaySceneMode(n, all) === 'quiet'), ['Мотя']);
  assert.equal(holidaySceneMode('Новый агент', all), 'away');
  assert.equal(heroProvider(' ЛЕХА '), 'codex'); assert.equal(heroProvider('Ярик'), 'claude');
  for (const mode of ['codex', 'claude']) {
    const state = officeHoliday(demoQuotas(mode, now)!, now);
    assert.equal(state.all, false);
    assert.equal(!!heroHoliday('Лёха', state), mode === 'codex');
    assert.equal(!!heroHoliday('Ярик', state), mode === 'claude');
    for (const name of ['Мотя','Шарик','Люда']) assert.equal(holidaySceneMode(name, state), 'normal');
  }
  assert.equal(demoQuotas('bad', now), null);
});

test('every scene hero has the expected quota provider; only humans, cats, JH and Motya are exempt', () => {
  const expected = {
    'Ярик': 'claude', 'Лёха': 'codex', 'Ася': 'codex', 'Иваныч': 'codex',
    'Тая': 'codex', 'Саня': 'codex', 'whoami': 'codex',
    'Евгений': null, 'Марина': null, 'Коржик': null, 'Масяня': null, 'Мотя': null, 'JH': null,
  };
  const roster = new Set([...Object.keys(layout.heroes), ...Object.keys(layout.fixtures),
    ...sceneAgents(Object.keys(HEROES).map(name => ({ id: name, name, emoji: '', role: '', description: null,
      positionX: null, positionY: null, currentStatus: null, contextPct: 0, createdAt: null }))).map(a => a.name)]);
  assert.deepEqual([...new Set([...roster].map(normalizeHeroName))].sort(), Object.keys(expected).map(normalizeHeroName).sort());
  for (const [name, provider] of Object.entries(expected)) assert.equal(heroProvider(name), provider, name);
  for (const name of ['Люда', 'Шарик']) assert.equal(heroProvider(name), null, `${name} is represented by JH`);
});

test('whoami and all bridge/archive aliases go away only with Codex and recover at reset', () => {
  for (const name of ['whoami', ' WHOAMI ', 'Михалыч', 'михалыч', 'mihalych', 'mikhalych']) {
    assert.equal(normalizeHeroName(name), 'whoami');
    const appearance = resolveAppearance({ id: 'mihalych', name });
    assert.equal(appearance.kind, 'hero');
    if (appearance.kind === 'hero') assert.equal(appearance.hero, HEROES.whoami);
    assert.equal(heroProvider(name), 'codex');
    for (const mode of ['codex', 'claude', 'all']) {
      const signal = demoQuotas(mode, now)!;
      const state = officeHoliday(signal, now);
      assert.equal(holidaySceneMode(name, state), mode === 'claude' ? 'normal' : 'away');
      if (mode !== 'claude') {
        const away = heroHoliday(name, state)!;
        assert.equal(away.resetsAt, state.codex.resetsAt);
        assert.match(holidayLabel(away), /^на выходном до /);
        assert.equal(holidaySceneMode(name, officeHoliday(signal, away.resetsAt!)), 'normal');
      }
    }
  }
});

test('empty keyboards in holiday mode attract both cats, who release them on return', () => {
  const all = officeHoliday(demoQuotas('all', now)!, now);
  const everyone = Object.entries(layout.heroes).map(([name, position]) => ({ name, position }));
  const remaining = everyone.filter(h => holidaySceneMode(h.name, all) !== 'away');
  const cats = ['Коржик','Масяня'].map(name => createCat(name, layout.heroes[name as 'Коржик' | 'Масяня']));
  advanceCats(cats, remaining, 30, 30);
  assert.ok(cats.every(c => c.phase === 'keyboard' && heroHoliday(c.desk!, all)));
  assert.equal(new Set(cats.map(c => c.desk)).size, 2);
  advanceCats(cats, everyone, 30, 60);
  assert.ok(cats.every(c => c.phase === 'home'));
});

test('public projection strips arbitrary strings and invalid quota values', () => {
  const raw = { codex: { windows: [{ usedPercent: 90, resetsAt: reset, secret: 'secret' }, { usedPercent: '100', resetsAt: reset }], error: { blocked: true, resetsAt: reset, message: 'secret' }, token: 'secret' }, claude: { message: 'secret' } };
  assert.deepEqual(publicQuotas(raw), { codex: { windows: [{ usedPercent: 90, resetsAt: reset }], error: { blocked: true, resetsAt: reset } }, claude: { windows: [], error: null } });
  assert.equal(JSON.stringify(publicQuotas(raw)).includes('secret'), false);
  assert.deepEqual(publicQuotas(null), EMPTY_QUOTAS);
  assert.equal(officeHoliday(publicQuotas({ codex: { error: { blocked: true } } }), now).codex.resetsAt, null);
});

test('reset formatting follows the laptop timezone and countdown handles day/hour boundaries', () => {
  const prior = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Moscow'; assert.equal(formatReset(reset), 'ср 04.11 18:40');
    process.env.TZ = 'UTC'; assert.equal(formatReset(reset), 'ср 04.11 15:40');
  } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
  assert.equal(holidayCountdown(now + 2 * 86400 + 5 * 3600, now), 'ещё 2 дн 5 ч');
  assert.equal(holidayCountdown(now + 3600, now), 'ещё 1 ч 0 мин');
  assert.equal(holidayCountdown(now + 1, now), 'ещё 1 мин');
});

test('limit projection is a public read-only LAN endpoint', () => {
  assert.equal(isAnonymousApiRequest('/api/office/limits', 'GET', 'localhost:3000'), true);
  assert.equal(isAnonymousApiRequest('/api/office/limits', 'GET', 'office.example.com'), false);
  assert.equal(isAnonymousApiRequest('/api/office/limits', 'POST', 'localhost:3000'), false);
});
