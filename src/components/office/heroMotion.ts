/** Direction is latched through near-vertical segments; phase follows real travel. */
export interface HeroMotion { facing: -1 | 1; distance: number }
export function advanceHeroMotion(motion: HeroMotion, dx: number, dy: number) {
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < .01) return;
  if (Math.abs(dx) > .15 && Math.abs(dx) > distance * .18) motion.facing = dx < 0 ? -1 : 1;
  motion.distance += distance;
}
// OFFICE-15 Mikhaylych is the reference: 60px/s, 7.5px/frame (8 phases/s), 1.2px bob.
export const HUMAN_GAIT = { speed: 60, frameDistance: 7.5, bob: 1.2 } as const;
export const CAT_GAIT = { speed: 95, frameDistance: 10, bob: .65 } as const;
export const walkFrameIndex = (distance: number, count: number, frameDistance = HUMAN_GAIT.frameDistance as number) => Math.floor(Math.max(0, distance) / frameDistance) % Math.max(1, count);

/** Identity, rather than pose creation time, keeps breathing continuous across gestures. */
function identitySeed(name: string) {
  let seed = 2166136261;
  for (const letter of name) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0;
  return seed;
}

export function heroBreathing(name: string) {
  const seed = identitySeed(name);
  const cat = ['коржик', 'масяня'].includes(name.trim().toLocaleLowerCase('ru-RU'));
  return {
    period: (cat ? 2.2 : 3.2) + (seed % (cat ? 801 : 1001)) / 1000,
    amplitude: (cat ? .03 : .025) + ((seed >>> 8) % 10001) / 1e6,
    phase: ((seed >>> 12) % 10000) / 10000,
  };
}

/** A shorter inhale and longer exhale, with zero velocity at both turnarounds.
 * Scaling the foot-pivoted sprite leaves its support point exactly fixed. */
export function stationaryMotion(now: number, profile: ReturnType<typeof heroBreathing>, _reduced = false) {
  const phase = ((now / profile.period + profile.phase) % 1 + 1) % 1;
  const breath = phase < .4 ? (1 - Math.cos(Math.PI * phase / .4)) / 2
    : (1 + Math.cos(Math.PI * (phase - .4) / .6)) / 2;
  return { scaleY: 1 + profile.amplitude * breath, x: 0, rotation: 0 };
}

export const WEIGHT_SHIFT = { interval: [5, 12], hold: [2, 4], amplitude: [.03, .05], ease: .8 } as const;
export const CAT_EAR_TWITCH = { interval: [6, 15], hold: [.15, .3], amplitude: [.10, .15], ease: .6 } as const;
type IdleEventOptions = { interval: readonly [number, number]; hold: readonly [number, number]; amplitude: readonly [number, number]; ease: number };

/** Seeded per identity: frame rate and pose visibility cannot synchronise heroes.
 * Intervals are measured between event starts, including the hold and return. */
export function createIdleEvent(name: string, options: IdleEventOptions = WEIGHT_SHIFT) {
  let seed = identitySeed(name + ':' + options.interval[0]);
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const between = ([min, max]: readonly [number, number]) => min + random() * (max - min);
  const event = { start: 0, hold: 0, amount: 0, options, next };
  function next() {
    // Finish the return before another shift starts (the shortest interval
    // can otherwise overlap a long hold plus both easing ramps).
    event.start += Math.max(between(options.interval), event.hold + options.ease * 2);
    event.hold = between(options.hold);
    event.amount = between(options.amplitude) * (random() < .5 ? -1 : 1);
  }
  next();
  return event;
}

export function sampleIdleEvent(now: number, event: ReturnType<typeof createIdleEvent>) {
  const ease = event.options.ease;
  while (now >= event.start + ease * 2 + event.hold) event.next();
  const age = now - event.start;
  if (age <= 0) return 0;
  const smooth = (t: number) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2;
  return event.amount * (age < ease ? smooth(age / ease)
    : age < ease + event.hold ? 1 : 1 - smooth((age - ease - event.hold) / ease));
}
