import { OFFICE_LAYOUT, type Point } from './officeLayout';

const STEP = 8;
const COLS = Math.floor(OFFICE_LAYOUT.canvas.width / STEP) + 1;
const ROWS = Math.floor(OFFICE_LAYOUT.canvas.height / STEP);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (key: number): Point => ({ x: key % COLS * STEP, y: Math.floor(key / COLS) * STEP });
const nodes: Record<string, number[]> = OFFICE_LAYOUT.walkways.nodes;
const segments: [Point, Point][] = OFFICE_LAYOUT.walkways.edges.map(([a, b]) => [
  { x: nodes[a][0], y: nodes[a][1] }, { x: nodes[b][0], y: nodes[b][1] },
]);
const desks = Object.entries(OFFICE_LAYOUT.heroes).filter(([name]) => name !== 'Мотя').map(([, p]) => p);
for (const home of desks) {
  const landing = { x: home.x, y: home.y < 400 ? nodes.left_top[1] : nodes.left_bottom[1] };
  segments.push([landing, { x: Math.max(nodes.left_top[0], Math.min(nodes.right_top[0], landing.x)), y: landing.y }]);
}

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Walkable footprint in container-anchor coordinates (feet are 18 px above).
 * The layout graph owns the aisles; desk stems leave through the open legs.
 * Furniture gets 14 px horizontal clearance. This does not alter the artwork.
 */
export function isLoftWalkable(p: Point): boolean {
  if (p.x < 18 || p.x > 940 || p.y < 200 || p.y > 582) return false;
  const atDeskExit = desks.some(h => Math.abs(p.x - h.x) <= 12 && p.y >= h.y && p.y <= (h.y < 400 ? 405 : 575));
  if (!atDeskExit && desks.some(h => p.x >= h.x - 67 && p.x <= h.x + 71 && p.y >= h.y - 65 && p.y <= h.y + 33)) return false;
  // Kitchen counter/cooler and door; keep the server approach on their right.
  if (p.x >= 618 && p.x <= 794 && p.y < 301) return false;
  if (p.x >= 874 && p.y >= 234 && p.y <= 356) return false;
  return atDeskExit || segments.some(([a, b]) => segmentDistance(p, a, b) <= 24)
    || (p.x >= 576 && p.x <= 812 && p.y >= 302 && p.y <= 376);
}

const walkable = Array.from({ length: COLS * ROWS }, (_, key) => isLoftWalkable(point(key)));

function clearSegment(a: Point, b: Point, blockers: readonly Point[]) {
  const steps = Math.max(1, Math.ceil(distance(a, b)));
  for (let i = 0; i <= steps; i++) {
    const p = { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps };
    if (!isLoftWalkable(p) || (i > 0 && i < steps && (!isLoftWalkable({ x: p.x - 0.5, y: p.y }) || !isLoftWalkable({ x: p.x + 0.5, y: p.y })
      || !isLoftWalkable({ x: p.x, y: p.y - 0.5 }) || !isLoftWalkable({ x: p.x, y: p.y + 0.5 })))
      || blockers.some(b => distance(p, b) < 30.5)) return false;
  }
  return true;
}

// Cache static furniture clearance once; live trips only check hero footprints.
const neighbors = walkable.map((free, key) => {
  if (!free) return [] as number[];
  const col = key % COLS, row = Math.floor(key / COLS);
  return [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].flatMap(([dx, dy]) => {
    const x = col + dx, y = row + dy, next = y * COLS + x;
    return x >= 0 && x < COLS && y >= 0 && y < ROWS && walkable[next]
      && clearSegment(point(key), point(next), []) ? [next] : [];
  });
});

/** A* on the aisle graph's walkable strips. Only runs when a trip starts or
 * needs replanning; the animation loop only consumes the resulting waypoints.
 * Blockers are the other heroes' current footprints.
 */
export function loftRoute(start: Point, goal: Point, blockers: readonly Point[] = []): Point[] {
  if (!isLoftWalkable(start) || !isLoftWalkable(goal)) return [];
  const allowed = walkable.map((free, key) => free && !blockers.some(b => distance(point(key), b) < 30));
  const near = (p: Point) => {
    let best = -1, cost = Infinity;
    for (let k = 0; k < allowed.length; k++) {
      if (!allowed[k]) continue;
      const d = distance(p, point(k));
      if (d < cost && d <= 20 && clearSegment(p, point(k), blockers)) { best = k; cost = d; }
    }
    return best;
  };
  const from = near(start), to = near(goal);
  if (from < 0 || to < 0) return [];
  const costs = new Float64Array(allowed.length).fill(Infinity);
  const parents = new Int32Array(allowed.length).fill(-1);
  const closed = new Uint8Array(allowed.length);
  // Small binary heap; stale entries are discarded via closed[].
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
      let k = to;
      while (k !== from) { route.push(point(k)); k = parents[k]; }
      route.push(point(from)); route.reverse();
      // Collapse straight stretches without cutting across aisle corners.
      const smooth: Point[] = [];
      let anchor = start, index = 0;
      while (index < route.length) {
        let end = index, low = index, high = route.length - 1;
        while (low <= high) {
          const candidate = (low + high) >> 1;
          if (clearSegment(anchor, route[candidate], blockers)) { end = candidate; low = candidate + 1; }
          else high = candidate - 1;
        }
        smooth.push(route[end]); anchor = route[end]; index = end + 1;
      }
      return smooth;
    }
    for (const next of neighbors[current]) {
      if (!allowed[next] || closed[next]) continue;
      if (blockers.some(b => segmentDistance(b, point(current), point(next)) < 30)) continue;
      const cost = costs[current] + distance(point(current), point(next));
      if (cost >= costs[next]) continue;
      costs[next] = cost; parents[next] = current; push(next, cost + distance(point(next), goal));
    }
  }
  return [];
}
