import { CAT_GAIT } from './heroMotion';
import layout from '../../../office-art/layout-ai.json';
import { normalizeHeroName } from './heroRegistry';
import { artRoute, isArtWalkable } from './aiOfficeNavigation';
import type { Point } from './officeLayout';
import type { CatAtlasFrame } from './heroAtlas';
import { workstationOccupied, type DeskPresence } from './workstation';
export type { DeskPresence } from './workstation';

export const isOfficeCat = (name: string) => ['коржик', 'масяня'].includes(normalizeHeroName(name));
export interface CatState {
  name: string; position: Point; home: Point; bed: string;
  phase: 'home' | 'walking' | 'keyboard' | 'returning' | 'chasing';
  desk: string | null; route: Point[]; lastEvent: number;
  visit?: 'outbound' | 'sitting' | 'returning';
  visitUntil?: number;
  activity?: CatAction;
  previousActivity?: CatAction;
  activityUntil?: number;
  nextActivity?: number;
  nap?: { sleeping: boolean; startedAt: number; until: number; zzzOffset: number };
  departureUntil?: number;
  reaction?: { at: number; until: number; phrase: string; belly: boolean };
  taps?: number[];
  previousPhrase?: string;
  chaseReturning?: boolean;
}
export interface CatActivity { name: string; message: string; kind?: 'chase' }
const keyboards: Record<string, Point> = layout.keyboards;
const homes: Record<string, Point> = layout.heroes;
export const CAT_DEMO_DESKS = Object.keys(keyboards).map(name => ({ name, position: homes[name] }));
export const CAT_BEDS = layout.cat_beds;
/** Seconds. Uniform 3–8 minute naps would give ~85% sleep with 30–90s breaks.
 * Bias towards shorter naps and longer breaks gives ~70%, with the full range
 * still available. Each cat draws its own deadlines from the injected random. */
export const CAT_NAP = {
  targetSleepShare: .7,
  sleep: { min: 180, max: 480 },
  awake: { min: 30, max: 90, power: 12 },
  initialAwake: { min: 30, max: 90 },
  initialSleepAge: { min: .4, max: .6 },
  departure: .8,
  zzz: { dayPeriod: 20, nightPeriod: 12, duration: 3 },
} as const;
const meanAwake = CAT_NAP.awake.max - (CAT_NAP.awake.max - CAT_NAP.awake.min) / (CAT_NAP.awake.power + 1);
const meanSleep = meanAwake * CAT_NAP.targetSleepShare / (1 - CAT_NAP.targetSleepShare);
const sleepPower = (CAT_NAP.sleep.max - CAT_NAP.sleep.min) / (meanSleep - CAT_NAP.sleep.min) - 1;
const awakeDuration = (random: () => number) => CAT_NAP.awake.max -
  (CAT_NAP.awake.max - CAT_NAP.awake.min) * random() ** CAT_NAP.awake.power;
const sleepDuration = (random: () => number) => CAT_NAP.sleep.min +
  (CAT_NAP.sleep.max - CAT_NAP.sleep.min) * random() ** sleepPower;
const catOffset = (cat: CatState) => normalizeHeroName(cat.name) === 'коржик' ? 1/3 : 5/6;

function prepareCatDeparture(cat: CatState, now: number) {
  if (cat.nap?.sleeping) cat.departureUntil = now + CAT_NAP.departure;
  cat.nap = undefined;
  interruptCatActivity(cat);
}
/** A newly woken cat first sits in place, including when a frame spans the hold. */
function departureDt(cat: CatState, dt: number, now: number) {
  return cat.departureUntil === undefined ? Math.max(0, dt)
    : Math.min(Math.max(0, dt), Math.max(0, now - cat.departureUntil));
}
export function catHome(cat: CatState) {
  return CAT_BEDS[cat.bed as keyof typeof CAT_BEDS];
}
/** A bed is reserved during sleep and the entire return/climb, then released
 * on departure. Selection depends only on distance and live reservations. */
export function nearestFreeBed(cat: CatState, cats: CatState[], allowed: (bed:typeof CAT_BEDS[keyof typeof CAT_BEDS])=>boolean = ()=>true) {
  const claimed = new Set(cats.filter(c => c !== cat && !c.desk &&
    (c.chaseReturning || c.phase === 'returning' || c.phase === 'home' && !c.visit)).map(c => c.bed));
  return Object.entries(CAT_BEDS).filter(([id,bed]) => !claimed.has(id) && allowed(bed))
    .sort(([,a],[,b]) => distance(cat.position, a.exit) - distance(cat.position, b.exit))[0];
}
function returnToBed(cat: CatState, cats: CatState[], prefix: Point[]) {
  const selected = nearestFreeBed(cat, cats);
  if (!selected) return false;
  const [id, bed] = selected;
  const from = prefix.at(-1) || cat.position;
  const route = path(from, bed.exit);
  if (!route.length && distance(from, bed.exit) > 1) return false;
  cat.bed = id; cat.home = { ...bed.place };
  cat.route = [...prefix, ...route, ...[...bed.access].reverse(), { ...bed.place }];
  cat.phase = 'returning';
  return true;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function createCat(name: string, home: Point): CatState {
  const bed = Object.entries(CAT_BEDS).sort(([,a],[,b]) => distance(home,a.place)-distance(home,b.place))[0][0];
  return { name, bed, position: { ...home }, home: { ...home }, phase: 'home', desk: null, route: [], lastEvent: -Infinity };
}
/** Finish the current descent before replanning on the floor. The sill access
 * keeps the jump clear of Yarik's monitor, llama and keyboard. */
function floorDeparture(cat: CatState): Point[] {
  const home = catHome(cat);
  if (cat.phase === 'home') return [...home.access, home.exit];
  // An interrupted keyboard jump must finish at the desk landing even when
  // its current projected feet briefly overlap the floor apron.
  if (cat.phase === 'returning' && cat.route.length === 1
    && Object.values(homes).some(p => distance(p, cat.route[0]) < 1)) return [...cat.route];
  if (isArtWalkable(cat.position)) return [];
  const landing = cat.route.findIndex(isArtWalkable);
  if (landing >= 0) return cat.route.slice(0, landing + 1);
  // A new vacancy during the climb home reverses the climb via the sill edge.
  return cat.route.length > 1 ? [home.exit] : [...home.access, home.exit];
}
function path(from: Point, to: Point): Point[] {
  return artRoute(from, to);
}
/** Reservations are made before either cat moves, using shared desk presence.
 * autonomous:false blocks new reservations; existing routes and manual captures still advance. */
export function advanceCats(cats: CatState[], heroes: readonly DeskPresence[], dt: number, now: number, reserved: ReadonlySet<CatState> = new Set(), options: { autonomous?: boolean } = {}): CatActivity[] {
  const free = freeKeyboards(heroes);
  const claimed = new Set<string>();
  const events: CatActivity[] = [];
  for (const cat of cats) {
    if (reserved.has(cat) || cat.visit || cat.phase === 'chasing') continue;
    if (cat.desk && (!free.includes(cat.desk) || claimed.has(cat.desk))) {
      // Jump down before planning the next floor walk. Release immediately.
      const exit = homes[cat.desk];
      if (cat.phase === 'keyboard' || (cat.phase === 'walking' && cat.route.length === 1)) cat.route = [{ ...exit }];
      else if (cat.phase === 'walking') cat.route = cat.route.slice(0, -1);
      cat.desk = null;
      cat.phase = 'returning';
    }
    if (cat.desk) claimed.add(cat.desk);
  }
  for (const cat of cats) {
    if (reserved.has(cat) || cat.visit || cat.phase === 'chasing') continue;
    if (!cat.desk) {
      const desk = options.autonomous !== false && !cat.chaseReturning && free.find(name => !claimed.has(name));
      if (desk) {
        const prefix = floorDeparture(cat);
        const from = prefix.at(-1) || cat.position;
        const route = path(from, homes[desk]);
        if (route.length) {
          prepareCatDeparture(cat, now);
          cat.route = [...prefix, ...route, { ...keyboards[desk] }];
          cat.desk = desk; claimed.add(desk); cat.phase = 'walking';
        }
      }
      if (!cat.desk && cat.phase !== 'home') {
        // Preserve a jump-off waypoint; replan only when a destination changes.
        if (!cat.route.length || distance(cat.route.at(-1)!, cat.home) > 1) {
          const prefix = floorDeparture(cat);
          if (!returnToBed(cat, cats, prefix)) continue;
        }
        cat.phase = 'returning';
      }
    }
    let budget = departureDt(cat, dt, now) * CAT_GAIT.speed;
    while (cat.route.length && budget > 0) {
      const next = cat.route[0], d = distance(cat.position, next);
      const step = Math.min(d, budget);
      if (d) { cat.position.x += (next.x - cat.position.x) * step / d; cat.position.y += (next.y - cat.position.y) * step / d; }
      budget -= step;
      if (d <= step + 1e-6) cat.route.shift(); else break;
    }
    if (!cat.route.length && cat.phase === 'walking' && cat.desk) {
      cat.phase = 'keyboard';
      if (now - cat.lastEvent >= 30) {
        cat.lastEvent = now;
        events.push({ name: cat.name, message: `🐈 ${cat.name} ${normalizeHeroName(cat.name) === 'масяня' ? 'легла' : 'лёг'} на клавиатуру ${genitive(cat.desk)}` });
      }
    } else if (!cat.route.length && cat.phase === 'returning') {
      cat.phase = 'home';
    }
  }
  // The first arrival waits for its playmate before new keyboard captures.
  if (cats.every(c => !c.chaseReturning || c.phase === 'home')) cats.forEach(c => { c.chaseReturning = undefined; });
  return events;
}
function genitive(name: string) {
  return ({ 'Ярик':'Ярика', 'Лёха':'Лёхи', 'Ася':'Аси', 'Иваныч':'Иваныча', 'Тая':'Таи', 'whoami':'whoami', 'Марина':'Марины', 'Евгений':'Евгения' } as Record<string,string>)[name] || name;
}
export const catKeyboard = (name: string) => keyboards[name];

/** One reservation covers departure, the ten-second visit, and the full trip home. */
export function startCatVisit(cats: CatState[], target: Point, random = Math.random, now = 0): boolean {
  if (!isArtWalkable(target)) return false;
  // A visit can interrupt play, but first both cats finish their floor descent.
  if (cats.some(c => c.phase === 'chasing')) { stopCatChase(cats); return false; }
  if (cats.some(c => c.desk || c.visit || c.phase !== 'home')) return false;
  if (!cats.length) return false;
  const cat = cats[Math.min(cats.length - 1, Math.floor(random() * cats.length))];
  const home = catHome(cat);
  const route = path(home.exit, target);
  if (!route.length) return false;
  prepareCatDeparture(cat, now);
  cat.route = [...home.access.map(p => ({ ...p })), { ...home.exit }, ...route];
  cat.visit = 'outbound'; cat.phase = 'walking';
  return true;
}

export function advanceCatVisits(cats: CatState[], dt: number, now: number) {
  for (const cat of cats) {
    if (!cat.visit) continue;
    if (cat.visit === 'sitting') {
      if (now < cat.visitUntil!) continue;
      if (!returnToBed(cat, cats, [])) continue;
      cat.visit = 'returning';
    }
    let budget = departureDt(cat, dt, now) * CAT_GAIT.speed;
    while (cat.route.length && budget > 0) {
      const next = cat.route[0], d = distance(cat.position, next), step = Math.min(d, budget);
      if (d) { cat.position.x += (next.x-cat.position.x)*step/d; cat.position.y += (next.y-cat.position.y)*step/d; }
      budget -= step;
      if (d <= step + 1e-6) cat.route.shift(); else break;
    }
    if (!cat.route.length) {
      if (cat.visit === 'outbound') { cat.visit = 'sitting'; cat.phase = 'home'; cat.visitUntil = now + 10; }
      else if (cat.visit === 'returning') { cat.visit = undefined; cat.phase = 'home'; }
    }
  }
}

/** Visit anchors stay at Marina's feet and are always on the navigation floor. */
export function marinaVisitTarget(feet: Point): Point | null {
  return [32, -32, 40, -40].map(dx => ({ x: feet.x + dx, y: feet.y }))
    .find(isArtWalkable) || null;
}

export type CatAction = 'wash' | 'stretch' | 'belly' | 'window';
export type CatDemo = CatAction | 'chase' | 'night';
export const parseCatDemo = (value: string | null): CatDemo | undefined =>
  ['wash','stretch','belly','window','chase','night'].includes(value || '') ? value as CatDemo : undefined;
export const isCatNight = (hour: number) => hour >= 23 || hour < 7;
const freeKeyboards = (heroes: readonly DeskPresence[]) => Object.keys(keyboards).filter(name => !workstationOccupied(name, heroes));
const pick = <T,>(items: T[], random: () => number): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
export const nextCatAction = (now: number, night: boolean, random = Math.random) => now + (40 + random() * 80) * (night ? 3 : 1);
export const nextCatChase = (now: number, random = Math.random) => now + 120 + random() * 120;

export function chooseCatAction(cat: CatState, random = Math.random): CatAction {
  const options: CatAction[] = normalizeHeroName(cat.name) === 'коржик'
    ? ['wash', 'stretch', ...(catHome(cat).kind === 'windowsill-bed' ? ['window' as const] : [])]
    : ['wash', 'stretch', 'belly'];
  return pick(options.filter(action => action !== cat.previousActivity), random);
}

function interruptCatActivity(cat: CatState) {
  cat.activity = undefined; cat.activityUntil = undefined;
  cat.nextActivity = undefined;
  // Reactions are visual only during a priority task; no belly pose on a walk/visit.
  if (cat.reaction) cat.reaction.belly = false;
}

export interface CatLife {
  nextChase: number;
  demoStarted?: boolean;
  night?: boolean;
  chase?: { stage: 'departing' | 'running'; until: number; duration: number; leader: string; started: number; circuit: Point[] };
}
export const createCatLife = (random = Math.random): CatLife => ({ nextChase: nextCatChase(0, random) });
const chaseStart = { x: 600, y: 450 };
// Stay in the central aisle: the old (600,540) waypoint is inside Sanya's desk.
const circuit: Point[] = [{ x: 670, y: 460 }, { x: 650, y: 350 }, { x: 590, y: 330 }, { x: 580, y: 430 }, chaseStart];

function chaseCircuit(): Point[] {
  const route: Point[] = [];
  let from = chaseStart;
  for (const to of circuit) {
    const segment = path(from, to);
    if (!segment.length || distance(segment.at(-1)!, to) > 1) return [];
    route.push(...segment); from = to;
  }
  return route;
}

export function startCatChase(cats: CatState[], heroes: readonly DeskPresence[], life: CatLife, now: number, random = Math.random): boolean {
  if (cats.length !== 2 || cats.some(c => c.phase !== 'home' || c.visit || c.desk)) return false;
  const routes = cats.map(cat => [...floorDeparture(cat), ...path(catHome(cat).exit, chaseStart)]);
  if (routes.some(route => !route.length || distance(route.at(-1)!, chaseStart) > 1)) return false;
  const loop = chaseCircuit();
  if (!loop.length) return false;
  life.chase = { stage: 'departing', until: Infinity, duration: 6 + random()*4, leader: pick(cats, random).name, started: now, circuit: loop };
  cats.forEach((cat, i) => { prepareCatDeparture(cat, now); cat.phase = 'chasing'; cat.route = routes[i]; });
  life.nextChase = nextCatChase(now, random);
  return true;
}

function stopCatChase(cats: CatState[]) {
  for (const cat of cats) if (cat.phase === 'chasing') {
    const prefix = floorDeparture(cat);
    cat.route = prefix;
    cat.phase = 'returning';
    cat.chaseReturning = true;
    returnToBed(cat, cats, prefix);
  }
}

function moveChaser(cat: CatState, dt: number, now: number) {
  let budget = departureDt(cat, dt, now) * 210;
  while (cat.route.length && budget > 0) {
    const next = cat.route[0], d = distance(cat.position, next), step = Math.min(d, budget);
    if (d) { cat.position.x += (next.x-cat.position.x)*step/d; cat.position.y += (next.y-cat.position.y)*step/d; }
    budget -= step;
    if (d <= step + 1e-6) cat.route.shift(); else break;
  }
}

/** Schedule before new keyboard reservations; existing captures and visits win.
 * autonomous:false blocks new chase scenes; local naps and idle poses still advance. */
export function advanceCatLife(cats: CatState[], heroes: readonly DeskPresence[], dt: number, now: number, life: CatLife,
  options: { hour: number; holiday?: boolean; autonomous?: boolean; demo?: CatDemo; random?: () => number }): CatActivity[] {
  const random = options.random || Math.random;
  const night = options.demo === 'night' || isCatNight(options.hour);
  const events: CatActivity[] = [];
  if (life.night !== night) {
    cats.forEach(cat => { interruptCatActivity(cat); cat.nap = undefined; cat.nextActivity = nextCatAction(now, night, random); });
    life.night = night;
  }
  const busy = !!options.holiday || cats.some(c => c.visit || c.desk);
  if (life.chase && (busy || night || cats.some(c => c.phase !== 'chasing'))) {
    stopCatChase(cats); life.chase = undefined;
  }
  if (options.holiday) { cats.forEach(cat => { interruptCatActivity(cat); cat.nap = undefined; }); return events; }
  const demo = options.demo;
  if (!busy && !night && !life.chase && (options.autonomous !== false && now >= life.nextChase && cats.every(c => !c.nap?.sleeping) || demo === 'chase' && !life.demoStarted)) {
    if (startCatChase(cats, heroes, life, now, random)) {
      if (demo === 'chase') life.demoStarted = true;
      events.push({ name: 'Коржик', kind: 'chase', message: '🐈 Коржик и Масяня устроили догонялки' });
    }
  }
  if (life.chase) {
    const chase = life.chase;
    if (chase.stage === 'departing') {
      cats.forEach(cat => moveChaser(cat, dt, now));
      if (cats.every(cat => !cat.route.length)) {
        chase.stage = 'running'; chase.started = now; chase.until = now + chase.duration;
        cats.forEach(cat => { cat.route = chase.circuit.map(p => ({ ...p })); });
      }
    } else if (now >= chase.until) { stopCatChase(cats); life.chase = undefined; }
    else cats.forEach(cat => {
      if (cat.name !== chase.leader && now - chase.started < .5) return;
      // Refill on every lap; even a ten-second chase cannot run out of floor.
      if (!cat.route.length) cat.route = chase.circuit.map(p => ({ ...p }));
      moveChaser(cat, dt, now);
    });
    return events;
  }
  for (const cat of cats) {
    if (cat.phase !== 'home' || cat.visit || cat.desk) { interruptCatActivity(cat); cat.nap = undefined; continue; }
    // Naps are local idle behaviour, also in the server-controlled office.
    // Explicit demos retain their previous poses and timings.
    if (demo) cat.nap = undefined;
    if (!night && !demo) {
      if (!cat.nap) {
        const shift = (random() + catOffset(cat)) % 1;
        cat.nap = { sleeping: false, startedAt: now,
          until: now + CAT_NAP.initialAwake.min + shift * (CAT_NAP.initialAwake.max - CAT_NAP.initialAwake.min),
          zzzOffset: random() * CAT_NAP.zzz.dayPeriod };
        // Enter the office partway through Masyanya's existing nap. Together
        // with per-cat draws this avoids long lockstep runs after a reset.
        if (normalizeHeroName(cat.name) === 'масяня') {
          const duration = sleepDuration(random);
          const age = duration * (CAT_NAP.initialSleepAge.min + random() * (CAT_NAP.initialSleepAge.max - CAT_NAP.initialSleepAge.min));
          cat.nap.sleeping = true; cat.nap.startedAt = now - age; cat.nap.until = now - age + duration;
          interruptCatActivity(cat);
        }
      }
      // Advance from deadlines rather than frame time, preserving block lengths
      // and deterministic catch-up after a long frame or a hidden tab.
      while (now >= cat.nap.until) {
        const nap = cat.nap, at = nap.until;
        nap.sleeping = !nap.sleeping; nap.startedAt = at;
        nap.until = at + (nap.sleeping ? sleepDuration(random) : awakeDuration(random));
        interruptCatActivity(cat);
        if (!nap.sleeping) cat.nextActivity = at + Math.min(nextCatAction(at, false, random) - at, (nap.until - at)/2);
      }
      if (cat.nap.sleeping || cat.reaction && now < cat.reaction.until) continue;
    }
    if (busy) { interruptCatActivity(cat); continue; }
    cat.nextActivity ??= nextCatAction(now, night, random);
    if (cat.activity && now >= (cat.activityUntil || 0)) cat.activity = undefined;
    if (demo && demo !== 'night' && demo !== 'chase') {
      // Window means Korzhik's sill; Masyanya keeps her normal home activity.
      const action = demo === 'window' && (normalizeHeroName(cat.name) !== 'коржик' || catHome(cat).kind !== 'windowsill-bed') ? 'wash' : demo;
      cat.activity = action; cat.activityUntil = now + 1;
    } else if ((!night || options.autonomous !== false) && now >= cat.nextActivity) {
      cat.activity = chooseCatAction(cat, random); cat.previousActivity = cat.activity;
      cat.activityUntil = now + (cat.activity === 'window' ? 20 + random()*20 : cat.activity === 'stretch' ? 5 + random()*3 : 10 + random()*10);
      cat.nextActivity = nextCatAction(now, night, random);
    }
  }
  return events;
}

const phrases: Record<string, string[]> = {
  'коржик': ['Мяу. Баг найден.', 'Я не трогал прод.', 'Тестирую клавиатуру на прочность.', 'Где мой корм в спецификации?', 'Ревью: одобрено. Мур.'],
  'масяня': ['Мур? Мур.', 'Легла на код — значит, код тёплый.', 'Ctrl+Z не поможет.', 'Я тут главный QA.', 'Погладь — потом коммить.'],
};
export function tapCat(cat: CatState, now: number, random = Math.random) {
  if (cat.phase === 'home' && !cat.visit && !cat.desk && cat.nap) {
    cat.nap.sleeping = false; cat.nap.startedAt = now; cat.nap.until = now + awakeDuration(random);
    interruptCatActivity(cat);
  }
  cat.taps = (cat.taps || []).filter(time => now - time <= 2);
  cat.taps.push(now);
  const triple = cat.taps.length >= 3;
  if (triple) cat.taps = [];
  const phrase = triple ? 'Пузико! (но трогать нельзя)' : cat.phase === 'keyboard' ? 'Не мешай, у меня код-ревью 😼'
    : pick((phrases[normalizeHeroName(cat.name)] || phrases['коржик']).filter(p => p !== cat.previousPhrase), random);
  if (!triple && cat.phase !== 'keyboard') cat.previousPhrase = phrase;
  cat.reaction = { at: now, until: now + 4, phrase, belly: triple };
  return cat.reaction;
}

export function catPose(cat: CatState, now: number, night: boolean, holiday = false): CatAtlasFrame {
  if (cat.departureUntil !== undefined && now < cat.departureUntil) return 'work';
  if (cat.phase === 'walking' || cat.phase === 'returning' || cat.phase === 'chasing') return 'walk';
  if (cat.visit) return 'work';
  if (cat.reaction?.belly && now < cat.reaction.until) return 'belly';
  if (cat.phase === 'keyboard') return 'stretch';
  if (holiday) return 'cup';
  if (cat.reaction && now < cat.reaction.until) return 'work';
  if (!night && cat.nap?.sleeping) return 'cup';
  if (cat.activity) return cat.activity === 'stretch' ? 'cat_stretch' : cat.activity;
  return night ? 'cup' : 'work';
}

/** Shared by rendering and tests: Zzz follows the actual sleeping pose. */
export function catSleepZzzAlpha(cat: CatState, now: number, night: boolean, holiday = false) {
  if (catPose(cat, now, night, holiday) !== 'cup' || cat.reaction && now < cat.reaction.until) return 0;
  // Keep the existing holiday/night presentation; daytime naps use a rarer pulse.
  if (holiday && !night) return 0;
  const age = night ? now % CAT_NAP.zzz.nightPeriod : (now + (cat.nap?.zzzOffset || 0)) % CAT_NAP.zzz.dayPeriod;
  return age < CAT_NAP.zzz.duration ? Math.sin(age / CAT_NAP.zzz.duration * Math.PI) : 0;
}
