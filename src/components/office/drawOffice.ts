import { Graphics, Container, Text, TextStyle } from "pixi.js";

// === galson.pro brand palette ===
const ACCENT = 0xecb00a;       // golden yellow
const CARD = 0x1a1a1a;
const BORDER = 0x2a2a2a;

// === Floor: dark grey (clean, not wood) ===
const FLOOR_LIGHT = 0x2a2a2a;
const FLOOR_DARK = 0x222222;

// === Walls: subtle dark, not brick-heavy ===
const WALL_COLOR = 0x333333;
const WALL_BRICK_MORTAR = 0x2a2a2a;
const WALL_TRIM = ACCENT;       // golden accent line

// === Furniture ===
const DESK_TOP = 0x5a3d2b;
const DESK_LEGS = 0x3a2515;
const CHAIR_SEAT = 0x2a2420;   // dark leather
const CHAIR_BACK = 0x2a2420;

// === Plants ===
const PLANT_POT = 0x8b4513;    // terracotta
const PLANT_GREEN_1 = 0x2d6a4f;
const PLANT_GREEN_2 = 0x40916c;
const PLANT_GREEN_3 = 0x52b788;

// === Monitors / tech ===
const MONITOR_FRAME = 0x1a1a1a;
const MONITOR_SCREEN = 0x0984e3;

// === Misc ===
const BOOKSHELF = 0x5a3d2b;
const COOLER_BODY = 0xb2ebf2;
const COOLER_TOP = 0x0288d1;
const COOLER_BASE = 0x78909c;

// === Couch ===
const COUCH_BASE = 0x3a2a20;   // dark brown leather
const COUCH_CUSHION = 0x4a3a30;

// === Meeting table ===
const MEETING_TABLE_COLOR = 0x4a3020;

// === Gaming area ===
const TV_FRAME = 0x111111;
const TV_SCREEN = 0x1a3a5a;
const CONSOLE_BODY = 0x1a1a1a;
const COFFEE_TABLE = 0x3a2515;

export const WATER_COOLER_POS = { x: 435, y: 440 };
export const MEETING_TABLE_POS = { x: 780, y: 420 };
export const COUCH_POS = { x: 650, y: 600 };
export const GAMING_AREA_POS = { x: 600, y: 570 };

export interface DeskPosition {
  x: number;
  y: number;
}

// Desk positions for 7 agents — matched to office-bg-v4 pixel art
export const DESK_POSITIONS: Record<string, DeskPosition> = {
  vanya:    { x: 140, y: 310 },
  tema:     { x: 310, y: 310 },
  pushkin:  { x: 140, y: 445 },
  coder:  { x: 310, y: 445 },
  garik:    { x: 140, y: 575 },
  stoyanov: { x: 310, y: 575 },
  proshka:  { x: 750, y: 500 },
  gary:     { x: 480, y: 180 },
  ded:      { x: 770, y: 240 },
  hunter:   { x: 480, y: 310 },
};

// Meeting table seat offsets (relative to MEETING_TABLE_POS)
export const MEETING_SEATS: { x: number; y: number }[] = [
  { x: -40, y: -135 },  // top-left (above table)
  { x: 10,  y: -135 },  // top-center
  { x: 60,  y: -135 },  // top-right
  { x: -40, y: -25 },  // bottom-left (below table)
  { x: 10,  y: -25 },  // bottom-center
  { x: 60,  y: -25 },  // bottom-right
];

export function createOfficeEnvironment(width: number, height: number): Container {
  const office = new Container();
  office.label = "office-environment";

  // Floor
  const floor = drawFloor(width, height);
  office.addChild(floor);

  // Walls
  const walls = drawWalls(width, height);
  office.addChild(walls);

  // Decorations (plants, bookshelf, coffee, whiteboard, clock, frames, rugs)
  const decorations = drawDecorations(width, height);
  office.addChild(decorations);

  // Desks with equipment for each agent
  office.addChild(drawDesk(DESK_POSITIONS.vanya.x, DESK_POSITIONS.vanya.y, "coordinator"));
  office.addChild(drawDesk(DESK_POSITIONS.tema.x, DESK_POSITIONS.tema.y, "designer"));
  office.addChild(drawDesk(DESK_POSITIONS.pushkin.x, DESK_POSITIONS.pushkin.y, "writer"));
  office.addChild(drawDesk(DESK_POSITIONS.coder.x, DESK_POSITIONS.coder.y, "tech"));
  office.addChild(drawDesk(DESK_POSITIONS.garik.x, DESK_POSITIONS.garik.y, "marketer"));
  office.addChild(drawDesk(DESK_POSITIONS.stoyanov.x, DESK_POSITIONS.stoyanov.y, "producer"));
  office.addChild(drawDesk(DESK_POSITIONS.proshka.x, DESK_POSITIONS.proshka.y, "publisher"));
  office.addChild(drawDesk(DESK_POSITIONS.gary.x, DESK_POSITIONS.gary.y, "mentor"));
  office.addChild(drawDesk(DESK_POSITIONS.hunter.x, DESK_POSITIONS.hunter.y, "coordinator"));

  // Ded's library corner — bookshelves + desk
  office.addChild(drawLibraryCorner(DESK_POSITIONS.ded.x, DESK_POSITIONS.ded.y));
  office.addChild(drawDesk(DESK_POSITIONS.ded.x, DESK_POSITIONS.ded.y, "knowledge"));

  // Water cooler
  const cooler = drawWaterCooler(WATER_COOLER_POS.x, WATER_COOLER_POS.y);
  office.addChild(cooler);

  // Couch
  const couch = drawCouch(COUCH_POS.x, COUCH_POS.y);
  office.addChild(couch);

  // Lounge area (right-bottom corner)
  const loungeArea = new Container();
  loungeArea.label = "lounge-area";
  const lg = new Graphics();
  // Rug under lounge
  lg.roundRect(780 - 70, 520 - 20, 140, 60, 4);
  lg.fill({ color: 0x8e3b3b, alpha: 0.5 });
  lg.roundRect(780 - 65, 520 - 15, 130, 50, 3);
  lg.fill({ color: 0xa04040, alpha: 0.4 });
  // Rug pattern
  lg.roundRect(780 - 55, 520 - 8, 110, 30, 2);
  lg.stroke({ color: 0xc06060, width: 1, alpha: 0.3 });
  loungeArea.addChild(lg);
  const loungeCouch = drawCouch(780, 520);
  loungeArea.addChild(loungeCouch);
  // Small side table
  const lt = new Graphics();
  lt.roundRect(780 + 60, 520, 16, 12, 2);
  lt.fill(COFFEE_TABLE);
  lt.roundRect(780 + 62, 520 + 2, 12, 8, 1);
  lt.fill(0x4a3020);
  // Coffee mug on table
  lt.rect(780 + 65, 520 + 3, 5, 5);
  lt.fill(0xffeaa7);
  loungeArea.addChild(lt);

  office.addChild(loungeArea);

  // Gaming area
  const gamingArea = drawGamingArea(GAMING_AREA_POS.x, GAMING_AREA_POS.y);
  office.addChild(gamingArea);

  // Meeting table with chairs
  const meetingTable = drawMeetingTable(MEETING_TABLE_POS.x, MEETING_TABLE_POS.y);
  office.addChild(meetingTable);

  // Big rug with OpenClaw crab in the center
  const centerRug = drawCenterRug(520, 360);
  office.addChild(centerRug);

  // Secretary / reception desk near the door
  const reception = drawReception(80, 180);
  office.addChild(reception);

  // Ceiling hanging lamps + warm light pools
  const lights = drawAmbientLights();
  office.addChild(lights);

  return office;
}

// ─── FLOOR: dark wood with subtle grain pattern ───

function drawFloor(w: number, h: number): Graphics {
  const g = new Graphics();

  // Wood plank pattern — alternating horizontal rectangles
  const plankH = 16;
  const plankW = 48;

  for (let y = 0; y < h; y += plankH) {
    const row = y / plankH;
    const offset = (row % 2) * (plankW / 2); // stagger every other row
    for (let x = -plankW; x < w + plankW; x += plankW) {
      const px = x + offset;
      const isLight = ((Math.floor(px / plankW) + row) % 2) === 0;
      g.rect(px, y, plankW - 1, plankH - 1); // 1px gap = grain line
      g.fill(isLight ? FLOOR_LIGHT : FLOOR_DARK);
    }
  }

  return g;
}

// ─── WALLS: exposed brick with golden trim ───

function drawWalls(w: number, h: number): Graphics {
  const g = new Graphics();

  // Back wall base — smooth dark wall
  g.rect(0, 0, w, 60);
  g.fill(WALL_COLOR);

  // Golden wall trim / baseboard
  g.rect(0, 57, w, 3);
  g.fill(WALL_TRIM);

  // Left wall accent — golden
  g.rect(0, 0, 3, h);
  g.fill(BORDER);
  g.rect(3, 0, 1, h);
  g.fill(WALL_TRIM);

  // Right wall accent — golden
  g.rect(w - 3, 0, 3, h);
  g.fill(BORDER);
  g.rect(w - 4, 0, 1, h);
  g.fill(WALL_TRIM);

  // Bottom trim
  g.rect(0, h - 3, w, 3);
  g.fill(BORDER);

  // ── Window 1 (warm evening light + city skyline) ──
  drawWindow(g, 100, 10, 80, 40);

  // ── Window 2 ──
  drawWindow(g, 420, 10, 80, 40);

  // ── Window 3 (above meeting table) ──
  drawWindow(g, 700, 10, 80, 40);

  // ── Task board on wall (between desk columns) ──
  g.rect(200, 8, 140, 48);
  g.fill(BORDER);
  g.rect(202, 10, 136, 44);
  g.fill(CARD);
  // Board columns
  for (let i = 0; i < 4; i++) {
    g.rect(204 + i * 34, 14, 32, 6);
    g.fill(i === 0 ? 0x636e72 : i === 1 ? ACCENT : i === 2 ? 0xe17055 : PLANT_GREEN_2);
    // Mini cards
    for (let j = 0; j < 2 + (i % 2); j++) {
      g.rect(204 + i * 34, 24 + j * 8, 30, 6);
      g.fill(BORDER);
    }
  }

  // ── Door on left wall ──
  g.rect(20, 62, 36, 60);
  g.fill(0x3a2515);
  g.rect(22, 64, 32, 56);
  g.fill(DESK_TOP);
  // Door handle — golden
  g.circle(48, 94, 2);
  g.fill(ACCENT);

  return g;
}

// ─── Window helper: warm evening light + city skyline ───

function drawWindow(g: Graphics, x: number, y: number, w: number, h: number) {
  // Frame
  g.rect(x, y, w, h);
  g.fill(BORDER);
  // Glass — warm evening sky
  g.rect(x + 2, y + 2, w - 4, h - 4);
  g.fill(0x1a1510);
  // Warm evening glow
  g.rect(x + 2, y + 2, w - 4, h - 4);
  g.fill({ color: 0xffd700, alpha: 0.3 });

  // City skyline silhouette (simple dark rectangles as buildings)
  const baseY = y + h - 4;
  const buildings = [
    { bx: x + 6,  bw: 8,  bh: 14 },
    { bx: x + 16, bw: 6,  bh: 20 },
    { bx: x + 24, bw: 10, bh: 10 },
    { bx: x + 36, bw: 7,  bh: 18 },
    { bx: x + 45, bw: 10, bh: 12 },
    { bx: x + 57, bw: 6,  bh: 22 },
    { bx: x + 65, bw: 9,  bh: 15 },
  ];
  for (const b of buildings) {
    g.rect(b.bx, baseY - b.bh, b.bw, b.bh + 2);
    g.fill(0x0a0a0a);
    // Tiny lit windows on buildings
    if (b.bh > 12) {
      g.rect(b.bx + 2, baseY - b.bh + 3, 2, 2);
      g.fill({ color: 0xffd700, alpha: 0.6 });
      g.rect(b.bx + b.bw - 4, baseY - b.bh + 7, 2, 2);
      g.fill({ color: 0xffd700, alpha: 0.4 });
    }
  }

  // Window cross
  const midX = x + w / 2;
  const midY = y + h / 2;
  g.rect(midX - 1, y + 2, 2, h - 4);
  g.fill(BORDER);
  g.rect(x + 2, midY - 1, w - 4, 2);
  g.fill(BORDER);
}

// ─── DECORATIONS ───

function drawDecorations(w: number, _h: number): Graphics {
  const g = new Graphics();

  // ── Plants (6 total, scattered around) ──

  // 1. Large floor plant near door (corner)
  drawLargePlant(g, 66, 100);

  // 2. Large floor plant in far-right corner
  drawLargePlant(g, w - 30, 560);

  // 3. Medium plant on windowsill 1
  drawMediumPlant(g, 140, 14);

  // 4. Medium plant on windowsill 2
  drawMediumPlant(g, 460, 14);

  // 5. Plant near the couch
  drawPlant(g, COUCH_POS.x + 70, COUCH_POS.y - 10);

  // 6. Plant near the meeting table
  drawPlant(g, MEETING_TABLE_POS.x + 80, MEETING_TABLE_POS.y - 20);

  // ── Coffee machine area (bottom left) ──
  g.rect(20, 500, 30, 24);
  g.fill(CARD);
  g.rect(22, 502, 26, 14);
  g.fill(0x636e72);
  // Cup
  g.rect(28, 518, 8, 6);
  g.fill(0xdfe6e9);
  g.rect(27, 516, 10, 3);
  g.fill(0xdfe6e9);
  // Steam
  g.rect(31, 512, 1, 4);
  g.fill({ color: 0xffffff, alpha: 0.3 });
  g.rect(34, 510, 1, 5);
  g.fill({ color: 0xffffff, alpha: 0.2 });

  // ── Bookshelf on right wall ──
  g.rect(w - 55, 70, 45, 80);
  g.fill(BOOKSHELF);
  // Shelves
  for (let i = 0; i < 4; i++) {
    g.rect(w - 53, 74 + i * 20, 41, 2);
    g.fill(0x6b4a3a);
    // Books
    for (let j = 0; j < 5; j++) {
      const bookColors = [0xe17055, ACCENT, PLANT_GREEN_2, 0xfdcb6e, 0x6c5ce7];
      g.rect(w - 51 + j * 8, 78 + i * 20, 6, 16);
      g.fill(bookColors[j % bookColors.length]);
    }
  }

  // ── Rug under meeting table ──
  g.roundRect(680, 260, 140, 100, 4);
  g.fill({ color: ACCENT, alpha: 0.06 });
  g.roundRect(685, 265, 130, 90, 3);
  g.fill({ color: ACCENT, alpha: 0.04 });

  // ── Whiteboard near meeting table ──
  g.rect(620, 8, 60, 44);
  g.fill(BORDER);           // frame
  g.rect(622, 10, 56, 40);
  g.fill(0xf0f0f0);         // white surface
  // Scribbles on whiteboard
  g.rect(626, 16, 20, 2);
  g.fill(0xe17055);
  g.rect(626, 22, 30, 2);
  g.fill(ACCENT);
  g.rect(626, 28, 16, 2);
  g.fill(0x0984e3);
  g.rect(626, 34, 24, 2);
  g.fill(PLANT_GREEN_2);
  // Small circles (bullet points)
  g.circle(650, 40, 2);
  g.fill(0xe17055);
  g.circle(660, 40, 2);
  g.fill(ACCENT);

  // ── Clock on wall ──
  g.circle(560, 28, 12);
  g.fill(BORDER);
  g.circle(560, 28, 10);
  g.fill(CARD);
  // Clock face
  g.circle(560, 28, 8);
  g.fill(0x222222);
  // Hour marks
  g.rect(560, 21, 1, 3);   // 12
  g.fill(0xffffff);
  g.rect(567, 27, 3, 1);   // 3
  g.fill(0xffffff);
  g.rect(560, 33, 1, 3);   // 6
  g.fill(0xffffff);
  g.rect(552, 27, 3, 1);   // 9
  g.fill(0xffffff);
  // Clock hands
  g.rect(560, 24, 1, 5);   // minute
  g.fill(0xffffff);
  g.rect(558, 28, 4, 1);   // hour
  g.fill(ACCENT);
  // Center dot
  g.circle(560, 28, 1);
  g.fill(ACCENT);

  // ── Picture frames on walls (golden borders) ──
  // Frame 1: left wall area
  drawPictureFrame(g, 380, 10, 24, 36);
  // Frame 2: right of task board
  drawPictureFrame(g, 350, 12, 20, 30);

  // ── Small rug under water cooler ──
  g.roundRect(WATER_COOLER_POS.x - 20, WATER_COOLER_POS.y + 14, 40, 16, 3);
  g.fill({ color: ACCENT, alpha: 0.08 });
  g.roundRect(WATER_COOLER_POS.x - 16, WATER_COOLER_POS.y + 16, 32, 12, 2);
  g.fill({ color: ACCENT, alpha: 0.05 });

  return g;
}

// ── Picture frame helper ──

function drawPictureFrame(g: Graphics, x: number, y: number, fw: number, fh: number) {
  // Golden border
  g.rect(x, y, fw, fh);
  g.fill(ACCENT);
  // Inner dark
  g.rect(x + 2, y + 2, fw - 4, fh - 4);
  g.fill(CARD);
  // Abstract "art" — a couple of colored shapes
  g.rect(x + 4, y + 4, fw - 8, fh - 8);
  g.fill(0x1f1f1f);
  g.rect(x + 6, y + fh / 2 - 3, fw / 2 - 4, 6);
  g.fill({ color: ACCENT, alpha: 0.3 });
}

// ── Large floor plant ──

function drawLargePlant(g: Graphics, x: number, y: number) {
  // Pot
  g.rect(x - 8, y, 16, 14);
  g.fill(PLANT_POT);
  g.rect(x - 10, y - 2, 20, 4);
  g.fill(PLANT_POT);
  // Stem
  g.rect(x - 1, y - 20, 2, 20);
  g.fill(0x2d5a3f);
  // Leaves — tall with multiple greens
  g.ellipse(x, y - 26, 8, 12);
  g.fill(PLANT_GREEN_1);
  g.ellipse(x - 6, y - 20, 5, 8);
  g.fill(PLANT_GREEN_2);
  g.ellipse(x + 6, y - 20, 5, 8);
  g.fill(PLANT_GREEN_3);
  g.ellipse(x - 3, y - 32, 4, 6);
  g.fill(PLANT_GREEN_3);
  g.ellipse(x + 3, y - 30, 4, 7);
  g.fill(PLANT_GREEN_2);
}

// ── Medium plant (windowsill size) ──

function drawMediumPlant(g: Graphics, x: number, y: number) {
  // Small pot on window ledge
  g.rect(x - 5, y + 26, 10, 8);
  g.fill(PLANT_POT);
  g.rect(x - 6, y + 24, 12, 3);
  g.fill(PLANT_POT);
  // Leaves
  g.ellipse(x, y + 18, 6, 8);
  g.fill(PLANT_GREEN_2);
  g.ellipse(x - 4, y + 20, 4, 6);
  g.fill(PLANT_GREEN_1);
  g.ellipse(x + 4, y + 20, 4, 6);
  g.fill(PLANT_GREEN_3);
}

// ── Standard plant ──

function drawPlant(g: Graphics, x: number, y: number) {
  // Pot
  g.rect(x - 6, y, 12, 10);
  g.fill(PLANT_POT);
  g.rect(x - 8, y - 2, 16, 3);
  g.fill(PLANT_POT);
  // Leaves
  g.ellipse(x, y - 8, 6, 8);
  g.fill(PLANT_GREEN_1);
  g.ellipse(x - 4, y - 6, 4, 6);
  g.fill(PLANT_GREEN_2);
  g.ellipse(x + 4, y - 6, 4, 6);
  g.fill(PLANT_GREEN_3);
}

// Ded's library corner — bookshelves with books
function drawLibraryCorner(x: number, y: number): Container {
  const container = new Container();
  container.label = "library-corner";
  const g = new Graphics();

  // Bookshelf 1 (behind desk, left)
  g.rect(x - 60, y - 50, 50, 80);
  g.fill(0x5c3a1e); // dark wood
  // Shelves
  for (let sy = 0; sy < 3; sy++) {
    g.rect(x - 58, y - 45 + sy * 25, 46, 2);
    g.fill(0x7a4f2e);
    // Books on each shelf
    const bookColors = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad, 0xe74c3c, 0x1abc9c];
    for (let bx = 0; bx < 5; bx++) {
      const bw = 4 + Math.floor(Math.random() * 4);
      const bh = 10 + Math.floor(Math.random() * 12);
      g.rect(x - 56 + bx * 9, y - 45 + sy * 25 - bh, bw, bh);
      g.fill(bookColors[bx % bookColors.length]);
    }
  }

  // Bookshelf 2 (behind desk, right)
  g.rect(x + 10, y - 50, 50, 80);
  g.fill(0x5c3a1e);
  for (let sy = 0; sy < 3; sy++) {
    g.rect(x + 12, y - 45 + sy * 25, 46, 2);
    g.fill(0x7a4f2e);
    const bookColors = [0xe67e22, 0x3498db, 0x2ecc71, 0x9b59b6, 0xe74c3c, 0x1abc9c, 0xf1c40f];
    for (let bx = 0; bx < 5; bx++) {
      const bw = 4 + Math.floor(Math.random() * 4);
      const bh = 10 + Math.floor(Math.random() * 12);
      g.rect(x + 14 + bx * 9, y - 45 + sy * 25 - bh, bw, bh);
      g.fill(bookColors[bx % bookColors.length]);
    }
  }

  // Globe on top of shelf
  g.circle(x - 35, y - 58, 8);
  g.fill(0x3498db);
  g.circle(x - 35, y - 58, 8);
  g.stroke({ color: 0x2c3e50, width: 1 });

  // Lamp on desk area
  g.rect(x - 2, y - 10, 4, 15);
  g.fill(0xbdc3c7);
  g.circle(x, y - 14, 6);
  g.fill(0xf5d76e);

  container.addChild(g);
  return container;
}

type DeskType = "coordinator" | "designer" | "writer" | "tech" | "marketer" | "producer" | "knowledge" | "publisher" | "mentor";

function drawDesk(x: number, y: number, type: DeskType): Container {
  const container = new Container();
  container.label = `desk-${type}`;
  const g = new Graphics();

  // Desk surface — warm wood
  g.rect(x - 30, y + 6, 60, 20);
  g.fill(DESK_TOP);
  // Desk front edge
  g.rect(x - 30, y + 24, 60, 3);
  g.fill(0x4a3020);

  // Desk legs — darker
  g.rect(x - 28, y + 26, 3, 10);
  g.fill(DESK_LEGS);
  g.rect(x + 25, y + 26, 3, 10);
  g.fill(DESK_LEGS);

  // Chair behind desk — dark leather
  g.rect(x - 8, y + 36, 16, 10);
  g.fill(CHAIR_SEAT);
  g.rect(x - 10, y + 28, 20, 10);
  g.fill(CHAIR_BACK);

  container.addChild(g);

  // Desk equipment based on type
  const equip = new Graphics();
  switch (type) {
    case "coordinator":
      drawMonitor(equip, x - 10, y);
      // Papers
      equip.rect(x + 10, y + 10, 12, 8);
      equip.fill(0xdfe6e9);
      equip.rect(x + 11, y + 11, 10, 1);
      equip.fill(0x636e72);
      equip.rect(x + 11, y + 13, 8, 1);
      equip.fill(0x636e72);
      break;

    case "designer":
      // Drawing tablet
      equip.rect(x - 15, y + 8, 20, 14);
      equip.fill(CARD);
      equip.rect(x - 13, y + 10, 16, 10);
      equip.fill(0x00cec9);
      // Color palette
      equip.circle(x + 12, y + 12, 2);
      equip.fill(0xe17055);
      equip.circle(x + 18, y + 12, 2);
      equip.fill(ACCENT);
      equip.circle(x + 15, y + 16, 2);
      equip.fill(PLANT_GREEN_2);
      break;

    case "writer":
      // Stack of papers
      equip.rect(x - 14, y + 8, 16, 12);
      equip.fill(0xffeaa7);
      equip.rect(x - 13, y + 9, 14, 1);
      equip.fill(0x636e72);
      equip.rect(x - 13, y + 11, 12, 1);
      equip.fill(0x636e72);
      equip.rect(x - 13, y + 13, 10, 1);
      equip.fill(0x636e72);
      // Ink well
      equip.rect(x + 8, y + 10, 6, 6);
      equip.fill(CARD);
      equip.rect(x + 9, y + 11, 4, 3);
      equip.fill(0x0984e3);
      // Book
      equip.rect(x + 16, y + 8, 8, 12);
      equip.fill(0x6c5ce7);
      break;

    case "tech":
      // Dual monitors
      drawMonitor(equip, x - 18, y);
      drawMonitor(equip, x + 2, y);
      // Server LED
      equip.circle(x + 22, y + 10, 1);
      equip.fill(PLANT_GREEN_3);
      equip.circle(x + 22, y + 14, 1);
      equip.fill(PLANT_GREEN_3);
      break;

    case "marketer":
      drawMonitor(equip, x - 10, y);
      // Phone
      equip.rect(x + 14, y + 10, 8, 12);
      equip.fill(CARD);
      equip.rect(x + 15, y + 11, 6, 8);
      equip.fill(PLANT_GREEN_3);
      break;

    case "producer":
      drawMonitor(equip, x - 14, y);
      // Clapperboard
      equip.rect(x + 8, y + 8, 14, 10);
      equip.fill(CARD);
      equip.rect(x + 8, y + 6, 14, 4);
      equip.fill(0xdfe6e9);
      // Stripes on clap
      equip.rect(x + 10, y + 6, 2, 4);
      equip.fill(CARD);
      equip.rect(x + 14, y + 6, 2, 4);
      equip.fill(CARD);
      equip.rect(x + 18, y + 6, 2, 4);
      equip.fill(CARD);
      break;

    case "knowledge":
    case "publisher":
    case "mentor":
      drawMonitor(equip, x - 10, y);
      break;
  }

  container.addChild(equip);
  return container;
}

function drawMonitor(g: Graphics, x: number, y: number) {
  // Monitor stand
  g.rect(x + 6, y + 6, 4, 4);
  g.fill(MONITOR_FRAME);
  // Monitor body
  g.rect(x, y - 6, 16, 14);
  g.fill(MONITOR_FRAME);
  // Screen
  g.rect(x + 1, y - 5, 14, 12);
  g.fill(MONITOR_SCREEN);
  // Code lines on screen
  g.rect(x + 2, y - 3, 8, 1);
  g.fill({ color: 0xffffff, alpha: 0.5 });
  g.rect(x + 2, y - 1, 10, 1);
  g.fill({ color: 0xffffff, alpha: 0.3 });
  g.rect(x + 2, y + 1, 6, 1);
  g.fill({ color: ACCENT, alpha: 0.5 });
  g.rect(x + 2, y + 3, 9, 1);
  g.fill({ color: 0xffffff, alpha: 0.3 });
}

function drawWaterCooler(x: number, y: number): Container {
  const container = new Container();
  container.label = "water-cooler";
  const g = new Graphics();

  // Base/stand
  g.rect(x - 8, y + 10, 16, 6);
  g.fill(COOLER_BASE);

  // Body
  g.rect(x - 10, y - 14, 20, 24);
  g.fill(COOLER_BODY);

  // Front panel
  g.rect(x - 8, y - 10, 16, 16);
  g.fill(0xe0f7fa);

  // Water bottle on top (blue jug)
  g.roundRect(x - 6, y - 28, 12, 16, 3);
  g.fill(0x4dd0e1);
  g.roundRect(x - 4, y - 30, 8, 6, 2);
  g.fill(COOLER_TOP);

  // Spigot
  g.rect(x - 2, y + 2, 4, 4);
  g.fill(0x455a64);
  g.rect(x - 1, y + 6, 2, 2);
  g.fill(0x90a4ae);

  // Cup area
  g.rect(x + 6, y + 2, 6, 6);
  g.fill(0xdfe6e9);
  g.rect(x + 7, y + 3, 4, 4);
  g.fill(0xffffff);

  // Water level shimmer
  g.roundRect(x - 4, y - 22, 8, 10, 2);
  g.fill({ color: 0xffffff, alpha: 0.15 });

  container.addChild(g);
  return container;
}

function drawCouch(x: number, y: number): Container {
  const container = new Container();
  container.label = "couch";
  const g = new Graphics();

  // Couch base — dark brown leather
  g.roundRect(x - 50, y, 100, 20, 3);
  g.fill(COUCH_BASE);

  // Seat cushions — slightly lighter
  g.roundRect(x - 48, y + 2, 46, 16, 2);
  g.fill(COUCH_CUSHION);
  g.roundRect(x + 2, y + 2, 46, 16, 2);
  g.fill(COUCH_CUSHION);

  // Back cushions
  g.roundRect(x - 50, y - 14, 100, 16, 3);
  g.fill(COUCH_BASE);
  // Back cushion dividers
  g.roundRect(x - 48, y - 12, 30, 12, 2);
  g.fill(COUCH_CUSHION);
  g.roundRect(x - 16, y - 12, 30, 12, 2);
  g.fill(COUCH_CUSHION);
  g.roundRect(x + 16, y - 12, 32, 12, 2);
  g.fill(COUCH_CUSHION);

  // Armrests
  g.roundRect(x - 54, y - 10, 6, 28, 2);
  g.fill(COUCH_BASE);
  g.roundRect(x + 48, y - 10, 6, 28, 2);
  g.fill(COUCH_BASE);

  // Legs
  g.rect(x - 46, y + 20, 4, 4);
  g.fill(DESK_LEGS);
  g.rect(x + 42, y + 20, 4, 4);
  g.fill(DESK_LEGS);

  container.addChild(g);
  return container;
}

function drawGamingArea(x: number, y: number): Container {
  const container = new Container();
  container.label = "gaming-area";
  const g = new Graphics();

  // ── Rug under gaming area ──
  g.roundRect(x - 70, y - 20, 140, 70, 4);
  g.fill({ color: 0x6c5ce7, alpha: 0.06 });
  g.roundRect(x - 65, y - 15, 130, 60, 3);
  g.fill({ color: 0x6c5ce7, alpha: 0.04 });

  // ── TV/monitor on stand (facing down, i.e. viewer looks south) ──
  // TV stand (small table)
  g.rect(x - 10, y - 16, 20, 8);
  g.fill(COFFEE_TABLE);
  g.rect(x - 6, y - 8, 12, 4);
  g.fill(DESK_LEGS);
  // TV body
  g.rect(x - 16, y - 30, 32, 16);
  g.fill(TV_FRAME);
  // TV screen
  g.rect(x - 14, y - 28, 28, 12);
  g.fill(TV_SCREEN);
  // Screen glow lines (game graphics)
  g.rect(x - 12, y - 26, 10, 2);
  g.fill({ color: 0x00e676, alpha: 0.6 });
  g.rect(x - 4, y - 22, 14, 2);
  g.fill({ color: 0xff5252, alpha: 0.5 });
  g.rect(x + 4, y - 26, 8, 2);
  g.fill({ color: 0x448aff, alpha: 0.5 });

  // ── Coffee table between TV and couch ──
  g.roundRect(x - 14, y + 2, 28, 12, 2);
  g.fill(COFFEE_TABLE);
  g.roundRect(x - 12, y + 4, 24, 8, 1);
  g.fill(0x4a3020);
  // Snack on coffee table
  g.rect(x - 6, y + 5, 6, 4);
  g.fill(0xe17055);
  // Drink can
  g.rect(x + 4, y + 5, 4, 5);
  g.fill(0x0984e3);

  // ── Gaming couch (wider, facing TV — north) ──
  // Couch base
  g.roundRect(x - 46, y + 18, 92, 18, 3);
  g.fill(COUCH_BASE);
  // Seat cushions
  g.roundRect(x - 44, y + 20, 42, 14, 2);
  g.fill(COUCH_CUSHION);
  g.roundRect(x + 2, y + 20, 42, 14, 2);
  g.fill(COUCH_CUSHION);
  // Back cushions
  g.roundRect(x - 46, y + 34, 92, 12, 3);
  g.fill(COUCH_BASE);
  g.roundRect(x - 44, y + 36, 28, 8, 2);
  g.fill(COUCH_CUSHION);
  g.roundRect(x - 14, y + 36, 28, 8, 2);
  g.fill(COUCH_CUSHION);
  g.roundRect(x + 16, y + 36, 28, 8, 2);
  g.fill(COUCH_CUSHION);
  // Armrests
  g.roundRect(x - 50, y + 20, 6, 26, 2);
  g.fill(COUCH_BASE);
  g.roundRect(x + 44, y + 20, 6, 26, 2);
  g.fill(COUCH_BASE);
  // Legs
  g.rect(x - 42, y + 46, 4, 3);
  g.fill(DESK_LEGS);
  g.rect(x + 38, y + 46, 4, 3);
  g.fill(DESK_LEGS);

  // ── Game console (small box with colored lights) ──
  g.rect(x + 22, y - 12, 14, 8);
  g.fill(CONSOLE_BODY);
  g.rect(x + 23, y - 11, 12, 6);
  g.fill(0x222222);
  // Colored LED lights
  g.circle(x + 26, y - 8, 1);
  g.fill(0x00e676);       // green power light
  g.circle(x + 30, y - 8, 1);
  g.fill(0x448aff);       // blue disc light
  g.circle(x + 34, y - 8, 1);
  g.fill({ color: 0xff5252, alpha: 0.6 }); // red activity light

  container.addChild(g);
  return container;
}

function drawMeetingTable(x: number, y: number): Container {
  const container = new Container();
  container.label = "meeting-table";
  const g = new Graphics();

  // Table shadow
  g.ellipse(x, y + 42, 64, 8);
  g.fill({ color: 0x000000, alpha: 0.15 });

  // Table top — richer wood
  g.roundRect(x - 60, y - 40, 120, 80, 4);
  g.fill(MEETING_TABLE_COLOR);
  // Table top highlight
  g.roundRect(x - 58, y - 38, 116, 76, 3);
  g.fill(0x5a3a28);
  // Inner edge
  g.roundRect(x - 54, y - 34, 108, 68, 2);
  g.fill(MEETING_TABLE_COLOR);

  // Table legs
  g.rect(x - 52, y + 38, 4, 6);
  g.fill(DESK_LEGS);
  g.rect(x + 48, y + 38, 4, 6);
  g.fill(DESK_LEGS);
  g.rect(x - 52, y - 40, 4, 6);
  g.fill(DESK_LEGS);
  g.rect(x + 48, y - 40, 4, 6);
  g.fill(DESK_LEGS);

  // Papers/documents on table
  g.rect(x - 20, y - 15, 16, 12);
  g.fill(0xdfe6e9);
  g.rect(x - 18, y - 13, 12, 1);
  g.fill(0x636e72);
  g.rect(x - 18, y - 10, 10, 1);
  g.fill(0x636e72);

  g.rect(x + 8, y - 10, 14, 10);
  g.fill(0xffeaa7);
  g.rect(x + 10, y - 8, 10, 1);
  g.fill(0x636e72);

  // Chairs — 3 top, 3 bottom — dark leather
  for (let i = -1; i <= 1; i++) {
    const cx = x + i * 40;
    g.rect(cx - 8, y - 52, 16, 10);
    g.fill(CHAIR_SEAT);
    g.rect(cx - 10, y - 60, 20, 10);
    g.fill(CHAIR_BACK);
  }
  for (let i = -1; i <= 1; i++) {
    const cx = x + i * 40;
    g.rect(cx - 8, y + 42, 16, 10);
    g.fill(CHAIR_SEAT);
    g.rect(cx - 10, y + 50, 20, 10);
    g.fill(CHAIR_BACK);
  }

  container.addChild(g);
  return container;
}

// ─── CENTER RUG: large ornamental rug ───

function drawCenterRug(cx: number, cy: number): Container {
  const container = new Container();
  container.label = "center-rug";
  const g = new Graphics();

  // Outer rug border — deep red/burgundy
  g.roundRect(cx - 100, cy - 70, 200, 140, 6);
  g.fill({ color: 0x8b2020, alpha: 0.35 });

  // Inner border — golden trim
  g.roundRect(cx - 94, cy - 64, 188, 128, 4);
  g.stroke({ color: ACCENT, width: 1.5, alpha: 0.25 });

  // Inner fill — darker
  g.roundRect(cx - 90, cy - 60, 180, 120, 4);
  g.fill({ color: 0x6b1a1a, alpha: 0.25 });

  // Inner golden border
  g.roundRect(cx - 80, cy - 50, 160, 100, 3);
  g.stroke({ color: ACCENT, width: 1, alpha: 0.15 });

  // Corner ornaments (small golden diamonds)
  for (const [dx, dy] of [[-80, -50], [80, -50], [-80, 50], [80, 50]]) {
    g.rect(cx + dx - 3, cy + dy - 3, 6, 6);
    g.fill({ color: ACCENT, alpha: 0.2 });
  }

  container.addChild(g);
  return container;
}

// ─── RECEPTION: secretary desk near the door ───

function drawReception(x: number, y: number): Container {
  const container = new Container();
  container.label = "reception";
  const g = new Graphics();

  // Reception desk — curved front, darker wood
  g.roundRect(x - 25, y, 50, 22, 4);
  g.fill(0x4a3020);
  g.roundRect(x - 23, y + 2, 46, 18, 3);
  g.fill(DESK_TOP);
  // Front panel accent
  g.roundRect(x - 25, y + 18, 50, 4, 2);
  g.fill(0x3a2515);

  // Monitor on desk
  drawMonitor(g, x - 8, y - 6);

  // Small plant on desk
  g.rect(x + 14, y + 4, 6, 6);
  g.fill(PLANT_POT);
  g.ellipse(x + 17, y, 4, 5);
  g.fill(PLANT_GREEN_2);

  // Phone on desk
  g.rect(x - 20, y + 6, 8, 5);
  g.fill(CARD);
  g.rect(x - 19, y + 7, 6, 3);
  g.fill(0x636e72);

  // Secretary character (pixel girl)
  // Chair
  g.rect(x - 6, y + 24, 12, 8);
  g.fill(CHAIR_SEAT);
  g.rect(x - 8, y + 16, 16, 10);
  g.fill(CHAIR_BACK);

  container.addChild(g);

  return container;
}

function drawAmbientLights(): Graphics {
  const g = new Graphics();

  // Desk light positions (above each desk)
  const deskLights = [
    DESK_POSITIONS.vanya,
    DESK_POSITIONS.tema,
    DESK_POSITIONS.pushkin,
    DESK_POSITIONS.coder,
    DESK_POSITIONS.garik,
    DESK_POSITIONS.stoyanov,
    DESK_POSITIONS.proshka,
    DESK_POSITIONS.gary,
    DESK_POSITIONS.ded,
  ];

  // Warm golden glow circles above each desk
  for (const pos of deskLights) {
    // Outer glow
    g.ellipse(pos.x, pos.y, 50, 25);
    g.fill({ color: ACCENT, alpha: 0.08 });
    // Inner glow
    g.ellipse(pos.x, pos.y, 30, 15);
    g.fill({ color: ACCENT, alpha: 0.05 });

    // Ceiling hanging lamp above desk
    // Cord
    g.rect(pos.x - 1, 60, 2, 20);
    g.fill(BORDER);
    // Lamp shade (small rectangle)
    g.rect(pos.x - 8, 78, 16, 6);
    g.fill(0x2a2a2a);
    // Warm glow from lamp
    g.rect(pos.x - 6, 84, 12, 2);
    g.fill({ color: ACCENT, alpha: 0.4 });
  }

  // Additional light pools for key areas
  const areaLights = [
    { x: WATER_COOLER_POS.x, y: WATER_COOLER_POS.y },
    { x: MEETING_TABLE_POS.x, y: MEETING_TABLE_POS.y },
    { x: COUCH_POS.x, y: COUCH_POS.y },
    { x: GAMING_AREA_POS.x, y: GAMING_AREA_POS.y },
  ];

  for (const pos of areaLights) {
    g.ellipse(pos.x, pos.y, 60, 30);
    g.fill({ color: ACCENT, alpha: 0.06 });
    g.ellipse(pos.x, pos.y, 40, 20);
    g.fill({ color: ACCENT, alpha: 0.03 });
  }

  // Hanging lamp above meeting table (larger)
  g.rect(MEETING_TABLE_POS.x - 1, 60, 2, 20);
  g.fill(BORDER);
  g.rect(MEETING_TABLE_POS.x - 12, 78, 24, 8);
  g.fill(0x2a2a2a);
  g.rect(MEETING_TABLE_POS.x - 10, 86, 20, 2);
  g.fill({ color: ACCENT, alpha: 0.5 });

  return g;
}
