import { resetRareGesture, type RareGesture } from './heroTiming';
import { nextDeskAction, type DeskLife } from './deskLife';

interface AmbientHero {
  eggClock: number; rareGesture: RareGesture; deskLife: DeskLife;
  bugUntil: number; victoryUntil: number; responseUntil: number;
}
/** Presentation resets cancel transient gestures without rewinding ambient time. */
export function resetHeroAmbient(hero: AmbientHero, random = Math.random) {
  hero.bugUntil = hero.victoryUntil = hero.responseUntil = 0;
  resetRareGesture(hero.rareGesture, hero.eggClock, random);
  hero.deskLife.action = undefined;
  hero.deskLife.until = 0;
  hero.deskLife.next = nextDeskAction(hero.eggClock, random);
}
