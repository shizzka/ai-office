/** Independent desk gestures and walks use the existing paused scene clock. */
export type DeskAction = 'stretch' | 'cup' | 'look';
export interface DeskLife { next: number; until: number; action?: DeskAction; previous?: DeskAction }
export const nextDeskAction = (now: number, random = Math.random) => now + 20 + random()*40;
export const nextOfficeWalk = (random = Math.random) => 180 + random()*300;
export function createDeskLife(random = Math.random): DeskLife {
  return {next: nextDeskAction(0,random), until:0};
}
export function advanceDeskLife(life: DeskLife, now: number, eligible: boolean, random = Math.random): DeskAction | undefined {
  if (!eligible) { life.action = undefined; life.next = nextDeskAction(now,random); return; }
  if (now >= life.until) life.action = undefined;
  if (now >= life.next) {
    const choices = (['stretch','cup','look'] as const).filter(a=>a!==life.previous);
    life.action = choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
    life.previous = life.action;
    life.until = now + (life.action==='look' ? 1.5 : 3);
    life.next = nextDeskAction(now,random);
  }
  return life.action;
}
