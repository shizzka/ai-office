import layout from '../../../office-art/layout-ai.json';
import type { Point } from './officeLayout';

// All coordinates describe feet in the final 960 × 600 artwork. Furniture
// silhouettes include table legs, the bowl, the tripod and the doorway.
// Thin desk-front strips are intentional: a standing sprite can cover the
// desk behind its feet, but its feet must never travel across the desktop.
const FLOOR: readonly (readonly [number, number, number, number])[] = [
  [732, 256, 895, 296],     // apron under the shared desk, right of the rack
  [565, 280, 895, 296],     // floor in front of the owner/Marina desk, below rack
  [565, 280, 700, 320],     // approach around the bottom of the rack
  [90, 370, 690, 389],       // upper desks' front apron
  [565, 300, 690, 475],      // central aisle, left of the right workstation
  [565, 440, 775, 480],      // open floor before the kitchen
  [740, 444, 880, 477],      // below the dog bowl/bed, above the door
  [855, 449, 880, 489],      // cooler approach, left of coffee; never an entrance/exit
  [565, 470, 630, 552],      // around the left side of the tripod table
  [565, 470, 751, 500],      // behind Sanya's desk; exits along either side, never across its top
  [65, 536, 630, 552],       // lower desks' front apron
  [110, 530, 134, 540],      // individual lower desk exits
  [279, 530, 303, 540],
  [453, 530, 477, 540],
  [737, 444, 761, 470],      // QA chair exit
  [823, 446, 847, 472],      // approach in front of the blanket bed
];

// The rack is a fixture, so it never receives a floor home or route.
const { 'Коржик': korzhik, 'Масяня': masyanya, ...walkingHomes } = layout.heroes;
export const ART_HOMES = walkingHomes;

// The first place serves the cooler. Other visitors wait on the broad central
// floor; packing the narrow bowl-to-door passage would seal the cooler exit.
export const ART_KITCHEN_PLACES: readonly Point[] = [
  { x: 875, y: 468 }, { x: 650, y: 470 }, { x: 600, y: 470 },
  { x: 650, y: 420 }, { x: 600, y: 420 }, { x: 610, y: 370 },
];

export function inArtFurniture(p: Point): boolean {
  return Object.values(layout.furniture_masks).some(([x,y,w,h]) => p.x >= x && p.x <= x+w && p.y >= y && p.y <= y+h);
}

export function isArtWalkable(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y)
    && !inArtFurniture(p) && FLOOR.some(([left, top, right, bottom]) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom);
}

export const ART_NAV_CELL = 4;
const STEP = ART_NAV_CELL;
const COLS = 241;
const ROWS = 151;
const CLEARANCE = 31;
const DEPTH_CLEARANCE = 10;
// Floor footprints are ellipses in this perspective: 62px wide, 20px
// deep. Circular 31px blockers would seal the 22px desk-front aisle.
const footprintPoint = (p: Point): Point => ({ x: p.x, y: p.y * CLEARANCE / DEPTH_CLEARANCE });
const footprintDistance = (a: Point, b: Point) => distance(footprintPoint(a), footprintPoint(b));
export function artFootprintsOverlap(a: Point, b: Point): boolean {
  return footprintDistance(a, b) < CLEARANCE;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (key: number): Point => ({ x: key % COLS * STEP, y: Math.floor(key / COLS) * STEP });

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function clearSegment(a: Point, b: Point, blockers: readonly Point[]): boolean {
  if (blockers.some(p => segmentDistance(footprintPoint(p), footprintPoint(a), footprintPoint(b)) < CLEARANCE)) return false;
  const steps = Math.max(1, Math.ceil(distance(a, b) * 2));
  for (let i = 0; i <= steps; i++) {
    if (!isArtWalkable({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps })) return false;
  }
  return true;
}

const walkable = Array.from({ length: COLS * ROWS }, (_, key) => isArtWalkable(point(key)));
const neighbors = walkable.map((free, key) => {
  if (!free) return [] as number[];
  const col = key % COLS, row = Math.floor(key / COLS);
  return [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].flatMap(([dx, dy]) => {
    const x = col + dx, y = row + dy, next = y * COLS + x;
    return x >= 0 && x < COLS && y >= 0 && y < ROWS && walkable[next]
      && clearSegment(point(key), point(next), []) ? [next] : [];
  });
});

/** A* with immutable furniture clearance and live elliptical feet blockers.
 * Returns waypoints excluding start and including the exact goal, or [] when
 * either endpoint or a connecting passage is occupied. No endpoint teleport. */
export function artRoute(start: Point, goal: Point, blockers: readonly Point[] = []): Point[] {
  if (!isArtWalkable(start) || !isArtWalkable(goal)) return [];
  if (clearSegment(start, goal, blockers)) return [{ ...goal }];
  const allowed = walkable.map((free, key) => free && !blockers.some(b => artFootprintsOverlap(point(key), b)));
  const near = (p: Point) => {
    let best = -1, cost = Infinity;
    for (let k = 0; k < allowed.length; k++) {
      if (!allowed[k]) continue;
      const d = distance(p, point(k));
      if (d < cost && d <= 18 && clearSegment(p, point(k), blockers)) { best = k; cost = d; }
    }
    return best;
  };
  const from = near(start), to = near(goal);
  if (from < 0 || to < 0) return [];
  const costs = new Float64Array(allowed.length).fill(Infinity);
  const parents = new Int32Array(allowed.length).fill(-1);
  const closed = new Uint8Array(allowed.length);
  const heap: { key: number; score: number }[] = [];
  const push = (key: number, score: number) => {
    let i = heap.length; heap.push({ key, score });
    while (i > 0) { const parent = (i - 1) >> 1; if (heap[parent].score <= score) break; heap[i] = heap[parent]; i = parent; }
    heap[i] = { key, score };
  };
  const pop = () => {
    const first = heap[0], tail = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
        if (heap[child].score >= tail.score) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = tail;
    }
    return first.key;
  };
  costs[from] = 0; push(from, distance(point(from), goal));
  while (heap.length) {
    const current = pop();
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === to) {
      const route: Point[] = [goal];
      for (let k = to; k !== from; k = parents[k]) route.push(point(k));
      route.push(point(from)); route.reverse();
      const smooth: Point[] = [];
      let anchor = start, index = 0;
      while (index < route.length) {
        let end = index;
        // Visibility is not monotonic around corners: inspect candidates in
        // reverse rather than binary-searching and assuming it is monotonic.
        for (let next = route.length - 1; next > index; next--) {
          if (clearSegment(anchor, route[next], blockers)) { end = next; break; }
        }
        smooth.push(route[end]); anchor = route[end]; index = end + 1;
      }
      return smooth;
    }
    for (const next of neighbors[current]) {
      if (!allowed[next] || closed[next] || !clearSegment(point(current), point(next), blockers)) continue;
      const cost = costs[current] + distance(point(current), point(next));
      if (cost >= costs[next]) continue;
      costs[next] = cost; parents[next] = current; push(next, cost + distance(point(next), goal));
    }
  }
  return [];
}
