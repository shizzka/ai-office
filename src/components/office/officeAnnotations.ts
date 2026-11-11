export interface Rect { x: number; y: number; width: number; height: number }
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width + 3 && a.x + a.width + 3 > b.x
  && a.y < b.y + b.height + 3 && a.y + a.height + 3 > b.y;

/** Prefer above the owner; search nearby rows when moving heroes approach. */
export function placeAnnotation(preferred: Rect, obstacles: readonly Rect[], width: number, height: number): Rect {
  const candidates: Rect[] = [];
  for (let row = 0; row <= Math.ceil(height / 16); row++) {
    for (const dx of [0, -preferred.width - 8, preferred.width + 8, -2 * (preferred.width + 8), 2 * (preferred.width + 8)]) {
      for (const direction of row === 0 ? [0] : [-1, 1]) {
        candidates.push({ ...preferred,
          x: Math.max(4, Math.min(width - preferred.width - 4, preferred.x + dx)),
          y: Math.max(4, Math.min(height - preferred.height - 4, preferred.y + direction * row * 16)),
        });
      }
    }
  }
  const nearby = candidates.find(candidate => obstacles.every(obstacle => !overlaps(candidate, obstacle)));
  if (nearby) return nearby;
  // A dense upper desk can fill the nearby columns. Search the remaining
  // canvas before declaring that no optional detail card fits.
  for (let y = 4; y + preferred.height <= height - 4; y += 4) {
    for (let x = 4; x + preferred.width <= width - 4; x += 4) {
      const candidate = { ...preferred, x, y };
      if (obstacles.every(obstacle => !overlaps(candidate, obstacle))) return candidate;
    }
  }
  return candidates[0];
}

/** A name belongs to its hero: no collision solver may move it to a desk. */
export function heroNamePosition(feet: { x: number; y: number }, headY: number, scale: number, plateHeight: number) {
  return { x: feet.x, y: feet.y + headY * scale - plateHeight - 6 };
}

export function heroStatusColor(status: string, text = ''): number {
  // Do not treat routine summaries such as “ошибок этапов 0” as failures.
  if (status === 'error' || /(?:регрессия:\s*(?:⚠\s*)?красная|^\s*(?:ошибка|сбой|error|failed)\s*[:!])/i.test(text)) return 0xef4444;
  return ['working', 'thinking', 'busy'].includes(status) ? 0x22c55e : 0x87908c;
}

/** Artwork screen bounds in the registered 960×600 scene (frame included). */
export const ART_MONITORS: readonly Rect[] = [
  { x: 81, y: 386, width: 80, height: 51 },
  { x: 230, y: 386, width: 82, height: 51 },
  { x: 381, y: 383, width: 170, height: 57 },
  { x: 730, y: 313, width: 46, height: 35 },
  { x: 265, y: 255, width: 82, height: 48 },
  { x: 422, y: 218, width: 82, height: 53 },
  { x: 737, y: 141, width: 158, height: 57 },
];

/** The ordinary six-pixel gap stays unless the name would cover a screen. */
export function avoidNameMonitors(preferred: Rect, monitors: readonly Rect[]): Rect {
  if (monitors.every(m => !overlaps(preferred, m))) return preferred;
  const candidates = monitors.flatMap(m => [
    { ...preferred, y: m.y - preferred.height - 5 },
    { ...preferred, x: m.x - preferred.width - 5 },
    { ...preferred, x: m.x + m.width + 5 },
  ]).filter(c => c.y <= preferred.y && c.x >= 4 && c.x + c.width <= 956 && c.y >= 4 && monitors.every(m => !overlaps(c, m)));
  return candidates.sort((a,b) => Math.hypot(a.x-preferred.x,a.y-preferred.y)-Math.hypot(b.x-preferred.x,b.y-preferred.y))[0] || preferred;
}

/** Exact screen edges avoid pushing a seated name several label-widths away.
 * Every candidate stays above the crown; the shared solver resolves neighbours. */
export function seatedNamePosition(preferred: Rect, monitors: readonly Rect[], obstacles: readonly Rect[]): Rect {
  const candidates = [preferred, ...monitors.flatMap(m => [
    {...preferred,x:m.x-preferred.width-5}, {...preferred,x:m.x+m.width+5},
    {...preferred,y:m.y-preferred.height-5},
  ])].filter(c=>c.x>=4&&c.x+c.width<=956&&c.y>=4&&c.y<=preferred.y
    && [...monitors,...obstacles].every(m=>!overlaps(c,m)));
  const nearest = candidates.sort((a,b)=>Math.hypot(a.x-preferred.x,(a.y-preferred.y)*1.5)
    -Math.hypot(b.x-preferred.x,(b.y-preferred.y)*1.5))[0] || preferred;
  return placeAnnotation(nearest,[...monitors,...obstacles],960,600);
}
