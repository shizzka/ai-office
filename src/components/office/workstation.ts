import layout from '../../../office-art/layout-ai.json';
import { normalizeHeroName } from './heroRegistry';
import type { Point } from './officeLayout';

export interface DeskPresence {
  name: string;
  position: Point;
  seated?: boolean;
  returningToWork?: boolean;
  target?: Point;
  absent?: boolean;
}

/** Physical desktop landmarks measured on v8, independent of navigation feet. */
export const WORKSTATIONS = {
  'ярик': { keyboard: {x:463,y:288}, front:302 },
  'леха': { keyboard: {x:273,y:455}, front:472 },
  'ася': { keyboard: {x:122,y:455}, front:472 },
  'иваныч': { keyboard: {x:145,y:282}, front:302 },
  'тая': { keyboard: {x:306,y:284}, front:302 },
  'whoami': { keyboard: {x:462,y:448}, front:472 },
  'евгений': { keyboard: {x:814,y:205}, front:222 },
  'марина': { keyboard: {x:753,y:360}, front:374 },
} as const;

export function workstation(name: string) {
  const key = normalizeHeroName(name);
  const physical = WORKSTATIONS[key as keyof typeof WORKSTATIONS];
  const home = Object.entries(layout.heroes).find(([n]) => normalizeHeroName(n) === key)?.[1];
  if (!physical || !home) return undefined;
  return {...physical, home, zone:{left:home.x-52,right:home.x+52,top:physical.front-12,bottom:home.y+32}};
}

/** A reservation starts with the return intent, before the final 120 px.
 * Absence overrides stale posture/coordinates (offline and quota holidays). */
export function workstationOccupied(name: string, heroes: readonly DeskPresence[]): boolean {
  const desk = workstation(name);
  if (!desk) return false;
  return heroes.some(hero => {
    if (normalizeHeroName(hero.name) !== normalizeHeroName(name) || hero.absent) return false;
    const {x,y} = hero.position, z = desk.zone;
    return !!hero.seated || !!hero.returningToWork ||
      !!hero.target && Math.hypot(hero.target.x-desk.home.x,hero.target.y-desk.home.y)<18 ||
      x>=z.left && x<=z.right && y>=z.top && y<=z.bottom;
  });
}

/** Cat feet lie just beyond the keys; its opaque belly covers the key band. */
export const keyboardCatFeet = (name: string) => {
  const keyboard = workstation(name)?.keyboard;
  return keyboard && {x:keyboard.x,y:keyboard.y+11};
};
