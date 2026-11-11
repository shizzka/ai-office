/** Per-hero schedule shared by all poses, advanced by the existing office clock. */
export interface RareGesture { next: number; until: number }
/** Restart ambient deadlines in the hero's own clock domain after a presentation. */
export function resetRareGesture(clock: RareGesture, now: number, random = Math.random) {
  clock.next = now + 180 + random() * 120;
  clock.until = 0;
}
export function createRareGesture(random = Math.random): RareGesture {
  return { next: 180 + random() * 120, until: 0 };
}
export function advanceRareGesture(clock: RareGesture, now: number, eligible: boolean, random = Math.random): boolean {
  if (now >= clock.next && eligible) {
    clock.until = now + 3;
    clock.next = now + 180 + random() * 120;
  }
  return now < clock.until;
}
