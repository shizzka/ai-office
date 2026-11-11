import { Container, Graphics } from "pixi.js";
import { addHeroDetails, animateHeroDetails, type HeroAnimationContext } from "./heroDetails";
import * as legacy from "./drawLegacyAgent";
import { resolveAppearance, type AgentIdentity, type HeroDefinition } from "./heroRegistry";

export type AgentId = string;
export { createAgentLabel } from "./drawLegacyAgent";
export { HEROES, resolveAppearance } from "./heroRegistry";
export type HeroPose = "sit" | "walk" | "stretch" | "cooler";

// Integer rectangles only: the same 40×60 grid, feet at (20, 60), for every pose.
// Warm skin, muted fabric and cool edge light echo public/office-bg.png.
const INK = 0x202733;
const PAPER = 0xe5e4d0;
const BOOT = 0x252c39;
const WHITE = 0xf2eee0;
const RED = 0xd45356;
const SCREEN = 0x1a303c;

function rect(g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1) {
  g.rect(x, y, w, h).fill({ color, alpha });
}
function box(g: Graphics, x: number, y: number, w: number, h: number, color: number) {
  rect(g, x, y, w, h, INK);
  rect(g, x + 1, y + 1, w - 2, h - 2, color);
}
function pixels(g: Graphics, x: number, y: number, rows: string[], color: number) {
  rows.forEach((row, dy) => [...row].forEach((v, dx) => {
    if (v !== " ") rect(g, x + dx, y + dy, 1, 1, color);
  }));
}
function cup(g: Graphics, x: number, y: number, coffee = false) {
  box(g, x, y, 8, 9, coffee ? 0xcba976 : 0xc5e1df);
  rect(g, x + 7, y + 2, 3, 5, INK);
  rect(g, x + 8, y + 3, 1, 3, WHITE);
  rect(g, x + 1, y + 1, 6, 2, coffee ? 0x604335 : 0x7cb9ca);
  rect(g, x + 1, y + 4, 1, 3, WHITE);
}
function tablet(g: Graphics, x: number, y: number, tool: HeroDefinition["tool"]) {
  box(g, x, y, 17, 14, 0x5a6977);
  rect(g, x + 2, y + 2, 13, 10, SCREEN);
  if (tool === "blueprint") {
    rect(g, x + 3, y + 3, 5, 3, 0x7cbbc8);
    rect(g, x + 4, y + 4, 3, 1, SCREEN);
    rect(g, x + 9, y + 8, 5, 3, 0x7cbbc8);
    rect(g, x + 10, y + 9, 3, 1, SCREEN);
    rect(g, x + 6, y + 6, 1, 4, WHITE);
    rect(g, x + 7, y + 8, 3, 1, WHITE);
  } else if (tool === "art") {
    rect(g, x + 3, y + 3, 5, 4, 0xe77b9a);
    rect(g, x + 8, y + 5, 5, 5, 0x6bbcb6);
    rect(g, x + 4, y + 9, 3, 2, 0xedc474);
    rect(g, x + 10, y + 3, 3, 2, 0x8f8bc3);
  } else if (tool === "charts") {
    [4, 7, 9].forEach((h, i) => rect(g, x + 3 + i * 4, y + 11 - h, 3, h, i % 2 ? 0x76cbb7 : 0xe1b66b));
  } else {
    [8, 5, 10, 7].forEach((w, i) => {
      rect(g, x + 3 + (i % 2) * 2, y + 3 + i * 2, w, 1, 0x7fe0a0);
    });
  }
  rect(g, x + 7, y + 12, 3, 1, 0xb5c9cc);
}

function drawHead(g: Graphics, c: HeroDefinition) {
  // Hair behind the face gives buns and ponytails a different silhouette at 1x.
  if (c.head === "ponytail") {
    box(g, 29, 7, 7, 16, c.hair);
    rect(g, 31, 10, 2, 10, c.hairLight);
    rect(g, 29, 9, 5, 2, c.accent);
  }
  if (c.head === "bun") {
    box(g, 12, -1, 10, 8, c.hair);
    rect(g, 14, 0, 5, 2, c.hairLight);
    rect(g, 13, 5, 8, 1, c.accent);
  }
  if (c.head === "beret") {
    box(g, 9, 7, 23, 18, c.hair);
    rect(g, 10, 14, 3, 9, c.hairLight);
    rect(g, 28, 14, 3, 9, c.hairLight);
  }
  rect(g, 16, 21, 9, 6, INK);
  rect(g, 17, 21, 7, 5, c.skin);
  rect(g, 11, 5, 19, 17, INK);
  rect(g, 10, 11, 21, 7, INK);
  rect(g, 12, 6, 17, 14, c.skin);
  rect(g, 14, 20, 13, 3, c.skin);
  rect(g, 10, 12, 3, 4, c.skin);
  rect(g, 28, 12, 3, 4, c.skin);
  rect(g, 13, 10, 2, 7, 0xffdfb4, 0.25);
  rect(g, 26, 14, 2, 5, 0x9c6355, 0.28);
  rect(g, 15, 12, 2, 2, INK);
  rect(g, 24, 12, 2, 2, INK);
  rect(g, 20, 14, 2, 3, 0xb77e65);
  rect(g, 18, 19, 6, 1, 0x9a5d52);
  rect(g, 17, 18, 1, 1, 0x9a5d52);
  rect(g, 24, 18, 1, 1, 0x9a5d52);
  // Brows and a little fringe; no beard on the architect.
  rect(g, 14, 10, 4, 1, c.hair);
  rect(g, 23, 10, 4, 1, c.hair);
  rect(g, 12, 4, 17, 5, c.hair);
  rect(g, 11, 7, 3, 5, c.hair);
  rect(g, 27, 7, 3, 5, c.hair);
  rect(g, 14, 5, 11, 1, c.hairLight);
  if (c.head === "curls") {
    // Stepped, overlapping curls instead of a straight helmet-like fringe.
    [[11, 4], [15, 2], [20, 3], [25, 2], [28, 5], [10, 8], [27, 9]].forEach(([x, y]) => {
      rect(g, x, y, 5, 4, INK);
      rect(g, x + 1, y, 3, 3, c.hair);
      rect(g, x + 1, y, 2, 1, c.hairLight);
    });
    rect(g, 16, 7, 3, 3, c.hair);
    rect(g, 23, 7, 3, 3, c.hair);
  }
  if (c.head === "headphones") {
    rect(g, 9, 2, 23, 3, INK);
    rect(g, 10, 2, 21, 1, c.light);
    box(g, 7, 7, 6, 11, c.shirt);
    box(g, 28, 7, 6, 11, c.shirt);
    rect(g, 8, 9, 2, 6, c.accent);
    rect(g, 31, 9, 2, 6, c.accent);
  }
  if (c.head === "flatcap") {
    box(g, 11, 1, 18, 6, 0x5e6556);
    rect(g, 8, 5, 25, 3, INK);
    rect(g, 9, 5, 23, 1, 0x91937b);
    rect(g, 11, 9, 3, 4, c.hairLight);
    rect(g, 27, 9, 3, 4, c.hairLight);
    rect(g, 14, 9, 5, 1, c.hairLight);
    rect(g, 23, 9, 4, 1, c.hairLight);
  }
  if (c.head === "beret") {
    rect(g, 10, 1, 21, 7, INK);
    rect(g, 8, 3, 25, 4, INK);
    rect(g, 11, 2, 19, 5, c.accent);
    rect(g, 9, 4, 23, 2, c.accent);
    rect(g, 14, 2, 10, 1, WHITE, 0.35);
    rect(g, 22, 0, 2, 2, c.accent);
    rect(g, 12, 7, 17, 1, 0x873d62);
  }
  if (c.head === "hardhat") {
    rect(g, 12, 1, 17, 8, INK);
    rect(g, 10, 4, 21, 5, INK);
    rect(g, 12, 2, 16, 6, c.accent);
    rect(g, 11, 5, 19, 3, c.accent);
    rect(g, 8, 8, 25, 3, INK);
    rect(g, 9, 8, 23, 2, c.accent);
    rect(g, 19, 2, 3, 6, 0xffe7a1);
    rect(g, 13, 4, 1, 3, 0xffe7a1);
  }
  if (c.beard) {
    rect(g, 13, 17, 3, 4, c.hairLight);
    rect(g, 26, 17, 3, 4, c.hairLight);
    rect(g, 15, 20, 12, 4, c.hair);
    rect(g, 17, 21, 8, 2, c.hairLight);
    rect(g, 17, 18, 8, 1, c.hairLight);
  }
  if (c.glasses) {
    const y = c.moustache ? 14 : 11;
    box(g, 13, y, 7, 5, c.moustache ? 0xb5c4bc : 0xc7d9cc);
    box(g, 22, y, 7, 5, c.moustache ? 0xb5c4bc : 0xc7d9cc);
    rect(g, 20, y + 1, 2, 1, INK);
    rect(g, 15, y + 2, 2, 1, INK);
    rect(g, 24, y + 2, 2, 1, INK);
    rect(g, 14, y + 1, 2, 1, WHITE);
    rect(g, 23, y + 1, 2, 1, WHITE);
  }
  if (c.moustache) {
    rect(g, 14, 18, 14, 3, c.hairLight);
    rect(g, 14, 19, 5, 2, c.hairLight);
    rect(g, 23, 19, 5, 2, c.hairLight);
    rect(g, 20, 18, 2, 1, c.hair);
  }
  if (c.headset) {
    rect(g, 8, 4, 4, 11, c.accent);
    box(g, 7, 11, 6, 7, c.shirt);
    rect(g, 10, 16, 3, 3, INK);
    rect(g, 11, 18, 9, 2, INK);
    rect(g, 19, 17, 4, 3, c.accent);
  }
}

function drawClothes(g: Graphics, c: HeroDefinition, y: number) {
  box(g, 9, y, 23, 21, c.shirt);
  rect(g, 10, y + 2, 2, 16, c.light);
  rect(g, 29, y + 2, 2, 18, INK, 0.3);
  if (c.outfit === "rugby") {
    [4, 13].forEach(offset => {
      rect(g, 10, y + offset, 21, 5, c.accent);
      rect(g, 10, y + offset - 1, 21, 1, WHITE);
    });
    rect(g, 14, y, 5, 3, WHITE);
    rect(g, 23, y, 5, 3, WHITE);
    rect(g, 16, y + 3, 3, 1, WHITE);
    rect(g, 23, y + 3, 3, 1, WHITE);
    rect(g, 20, y + 1, 2, 5, WHITE);
    // Diagonal dark bag strap: actual pixel stairs, no blurred vector strokes.
    for (let i = 0; i < 10; i++) rect(g, 28 - i * 2, y + i * 2, 4, 3, 0x362f31);
    box(g, 3, y + 15, 10, 11, 0x4b4140);
    rect(g, 5, y + 17, 6, 1, 0x8a7561);
    rect(g, 9, y + 20, 2, 2, 0xb6a481);
  } else if (c.outfit === "hoodie") {
    rect(g, 13, y, 15, 4, c.light);
    rect(g, 17, y, 7, 2, INK);
    rect(g, 16, y + 4, 1, 6, WHITE);
    rect(g, 25, y + 4, 1, 6, WHITE);
    rect(g, 15, y + 13, 12, 5, INK, 0.25);
    rect(g, 16, y + 13, 10, 1, c.light);
  } else if (c.outfit === "vest") {
    rect(g, 18, y, 7, 19, 0xd4d0b4);
    rect(g, 20, y + 1, 1, 16, 0x656958);
    [12, 25].forEach(x => {
      box(g, x, y + 11, 5, 6, c.light);
      rect(g, x, y + 8, 5, 2, c.accent);
    });
    rect(g, 10, y + 18, 21, 1, c.accent);
  } else if (c.outfit === "scarf") {
    rect(g, 13, y, 16, 5, c.accent);
    rect(g, 24, y + 3, 5, 11, c.accent);
    rect(g, 14, y + 1, 13, 1, 0xf5bb99);
    rect(g, 24, y + 8, 5, 2, 0xe5bd69);
    rect(g, 25, y + 14, 1, 2, c.accent);
    rect(g, 28, y + 14, 1, 2, c.accent);
  } else if (c.outfit === "workwear") {
    rect(g, 13, y + 2, 2, 7, c.light);
    rect(g, 26, y + 2, 2, 7, c.light);
    box(g, 15, y + 6, 12, 9, PAPER);
    pixels(g, 16, y + 8, ["###  # ", "# # # #", "# # ###", "### # #", "  # # #"], INK);
  } else {
    rect(g, 16, y, 4, 4, PAPER);
    rect(g, 23, y, 4, 4, PAPER);
    rect(g, 20, y + 4, 2, 14, c.light);
    if (c.outfit === "blouse") {
      rect(g, 15, y + 7, 1, 8, c.accent);
      box(g, 13, y + 13, 6, 5, PAPER);
      rect(g, 14, y + 14, 4, 1, c.accent);
    }
  }
  if (c.beard) {
    // Hood down, civilian lanyard and a small lock pin.
    rect(g, 12, y, 4, 5, c.light);
    rect(g, 27, y, 3, 5, c.light);
    rect(g, 18, y + 3, 1, 9, c.accent);
    rect(g, 24, y + 3, 1, 9, c.accent);
    box(g, 18, y + 11, 7, 6, PAPER);
    rect(g, 20, y + 13, 3, 1, c.shirt);
    box(g, 27, y + 7, 4, 5, c.accent);
    rect(g, 28, y + 7, 2, 2, INK);
  }
  if (c.tool === "art") rect(g, 12, y + 12, 3, 3, 0xf1c85d);
}

function drawTool(g: Graphics, c: HeroDefinition, x: number, y: number) {
  switch (c.tool) {
    case "blueprint":
      // Sunglasses are in the hand, leaving the face and smile visible.
      box(g, x - 1, y - 1, 8, 6, 0x41515c);
      box(g, x + 8, y - 1, 8, 6, 0x41515c);
      rect(g, x + 6, y + 1, 2, 1, INK);
      rect(g, x + 1, y + 1, 2, 1, 0x96bec9);
      rect(g, x + 9, y + 1, 2, 1, 0x96bec9);
      rect(g, x, y - 3, 1, 4, INK);
      break;
    case "laptop":
      cup(g, x, y, true);
      break;
    case "checklist":
      box(g, x, y, 13, 17, 0x8b634d);
      rect(g, x + 2, y + 2, 9, 13, PAPER);
      rect(g, x + 4, y, 5, 3, 0xacb8b9);
      [5, 9, 13].forEach(dy => {
        pixels(g, x + 2, y + dy, ["# #", " # "], 0x588b7b);
        rect(g, x + 6, y + dy, 4, 1, 0x8b9689);
      });
      rect(g, x + 14, y - 1, 3, 14, RED);
      rect(g, x + 14, y + 13, 2, 2, INK);
      break;
    case "pue":
      box(g, x, y, 15, 20, 0x804839);
      rect(g, x + 1, y + 1, 2, 18, 0xb4794c);
      rect(g, x + 4, y + 15, 10, 3, PAPER);
      rect(g, x + 5, y + 16, 8, 1, 0xb9baa7);
      pixels(g, x + 4, y + 4, ["### # # ###", "# # # # #  ", "# #  #  ## ", "# # #   #  ", "# # #   ###"], 0xe8c985);
      break;
    case "art":
      tablet(g, x, y, "art");
      rect(g, x + 18, y - 6, 3, 12, INK);
      rect(g, x + 19, y - 6, 2, 9, WHITE);
      rect(g, x + 15, y + 4, 1, 2, c.accent);
      break;
    case "phone":
      box(g, x, y - 1, 11, 17, 0x71878c);
      rect(g, x + 2, y + 1, 7, 11, 0x8dc7c4);
      rect(g, x + 3, y + 4, 2, 3, 0x3d807c);
      rect(g, x + 3, y + 11, 2, 1, WHITE);
      break;
    case "terminal":
      tablet(g, x, y, "terminal");
      rect(g, x - 2, y + 14, 21, 2, 0x98a9ac);
      // Red shield / lock on the terminal, separate from green command lines.
      box(g, x + 10, y + 4, 5, 7, RED);
      rect(g, x + 12, y + 5, 1, 2, WHITE);
      rect(g, x + 11, y + 7, 3, 2, WHITE);
      break;
    case "charts":
      tablet(g, x, y, "charts");
      break;
  }
}

function human(c: HeroDefinition, pose: HeroPose, frame: 0 | 1): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  rect(g, 6, 59, 29, 3, 0x111a24, 0.35);
  const sitting = pose === "sit";
  const torsoY = sitting ? 28 : 24;
  if (sitting) {
    // Seat, bent knees, tucked shins: a distinct sitting silhouette.
    box(g, 8, 34, 26, 16, 0x455563);
    rect(g, 11, 35, 20, 1, 0x7a8b91);
    rect(g, 19, 49, 3, 8, INK);
    rect(g, 10, 58, 24, 2, INK);
    box(g, 9, 47, 12, 7, c.pants);
    box(g, 23, 47, 12, 7, c.pants);
    rect(g, 12, 53, 7, 5, c.pants);
    rect(g, 26, 53, 7, 5, c.pants);
    box(g, 10, 57, 11, 4, BOOT);
    box(g, 25, 57, 11, 4, BOOT);
  } else {
    const walking = pose === "walk";
    const leftStep = walking ? (frame === 0 ? -5 : 3) : 0;
    const rightStep = walking ? (frame === 0 ? 4 : -3) : 0;
    const leftLift = walking && frame === 1 ? -2 : 0;
    const rightLift = walking && frame === 0 ? -2 : 0;
    box(g, 11, 43, 9, 16, c.pants);
    box(g, 22, 43, 9, 16, c.pants);
    rect(g, 12 + leftStep, 49, 7, 9 + leftLift, c.pants);
    rect(g, 23 + rightStep, 49, 7, 9 + rightLift, c.pants);
    box(g, 10 + leftStep, 57 + leftLift, 11, 4, BOOT);
    box(g, 22 + rightStep, 57 + rightLift, 11, 4, BOOT);
    rect(g, 11 + leftStep, 58 + leftLift, 5, 1, 0x627080);
    rect(g, 23 + rightStep, 58 + rightLift, 5, 1, 0x627080);
  }
  drawClothes(g, c, torsoY);
  // Sleeves and hands are pose-specific, the clothes and head stay consistent.
  if (pose === "stretch") {
    box(g, 6, 20, 6, 11, c.shirt);
    box(g, 3, 16, 6, 10, c.shirt);
    box(g, 1, 10, 6, 10, c.skin);
    box(g, 29, 20, 6, 11, c.shirt);
    box(g, 32, 16, 6, 10, c.shirt);
    box(g, 34, 10, 6, 10, c.skin);
    rect(g, 5, 18, 2, 10, c.light);
    rect(g, 32, 18, 2, 10, c.light);
  } else {
    const armY = torsoY + (pose === "walk" ? frame * 2 : 2);
    box(g, 4, armY, 7, 10, c.shirt);
    rect(g, 5, armY + 1, 2, 7, c.light);
    box(g, 4, armY + 9, 6, 7, c.skin);
    box(g, 31, torsoY + 2, 7, 10, c.shirt);
    box(g, 32, torsoY + 11, 6, 6, c.skin);
    if (pose === "cooler") {
      box(g, 1, 28, 6, 9, c.skin);
      cup(g, -5, 24);
    }
  }
  const head = new Graphics();
  drawHead(head, c);
  head.label = "hero-head";
  head.y = sitting ? 4 : 0;
  root.addChild(head);
  const props = new Graphics();
  props.label = "hero-tools";
  root.addChild(props);
  // Work prop stays in the same hand in every standing pose.
  const propX = 33;
  const propY = pose === "stretch" ? (c.tool === "blueprint" ? 11 : 3) : (sitting ? 33 : 34);
  const tuckedBook = c.tool === "pue" && (pose === "sit" || pose === "walk");
  if (!(sitting && c.tool === "terminal") && pose !== "stretch") drawTool(props, c, tuckedBook ? 29 : propX, tuckedBook ? propY - 6 : propY);
  if (tuckedBook) rect(props, 29, propY + 3, 3, 5, c.skin);
  if (sitting) {
    if (["blueprint", "laptop", "charts", "terminal"].includes(c.tool)) {
      const deskY = c.tool === "charts" ? 49 : 47;
      box(props, -16, deskY, 25, 3, 0x7b9299);
      rect(props, -14, deskY + 3, 2, 10, 0x435361);
      rect(props, -14, deskY + 3, 1, 8, 0x90a9ae);
    }
    if (c.tool === "blueprint") {
      tablet(props, -12, 33, "blueprint");
    }
    if (c.tool === "terminal") drawTool(props, c, -12, 31);
    if (c.tool === "laptop") {
      tablet(props, -12, 31, "laptop");
      rect(props, -14, 45, 22, 2, 0x98a9ac);
      rect(props, -10, 45, 13, 1, INK);
    }
    if (c.tool === "charts") {
      tablet(props, -13, 29, "charts");
      rect(props, -6, 43, 3, 4, 0x82939c);
      rect(props, -10, 47, 11, 2, 0x82939c);
    }
  }
  return root;
}

function dog(c: HeroDefinition, pose: HeroPose, frame: 0 | 1): Container {
  const root = new Container();
  const g = new Graphics();
  const tail = new Graphics();
  tail.label = "dog-tail";
  tail.position.set(9, 43);
  rect(tail, -11, -8, 5, 10, INK);
  rect(tail, -9, -7, 3, 9, c.skin);
  rect(tail, -6, -1, 9, 4, c.skin);
  root.addChild(tail, g);
  rect(g, 3, 59, 38, 3, 0x111a24, 0.35);
  const sit = pose === "sit", stretch = pose === "stretch";
  if (sit) {
    box(g, 8, 46, 27, 13, c.skin);
    box(g, 7, 55, 12, 6, c.hairLight);
    box(g, 25, 55, 12, 6, c.hairLight);
  } else {
    const step = pose === "walk" ? (frame ? 4 : -4) : 0;
    box(g, 11 + step, 43, 8, 17, c.skin);
    box(g, 24 - step, 43, 8, 17, c.skin);
    box(g, 9 + step, 56, 12, 5, c.hairLight);
    box(g, 22 - step, 56, 12, 5, c.hairLight);
  }
  box(g, 10, 25, 23, 23, c.skin);
  box(g, 11, 27, 21, 16, c.shirt);
  rect(g, 20, 27, 3, 15, c.hairLight);
  // Soft long hunting-dog ears, pale muzzle, black nose and alert eyes.
  box(g, 9, 5, 24, 21, c.skin);
  box(g, 5, 7, 8, 23, c.hair);
  box(g, 29, 7, 8, 23, c.hair);
  rect(g, 7, 10, 3, 15, 0x865333);
  rect(g, 31, 10, 3, 15, 0x865333);
  box(g, 13, 17, 18, 11, c.hairLight);
  rect(g, 19, 17, 8, 4, INK);
  rect(g, 21, 18, 2, 1, WHITE);
  rect(g, 21, 21, 2, 3, INK);
  rect(g, 17, 24, 5, 1, INK);
  rect(g, 24, 24, 3, 1, INK);
  rect(g, 14, 12, 4, 4, INK);
  rect(g, 25, 12, 4, 4, INK);
  rect(g, 15, 12, 1, 1, WHITE);
  rect(g, 26, 12, 1, 1, WHITE);
  box(g, 13, 27, 17, 4, RED);
  rect(g, 21, 29, 3, 3, c.accent);
  const armY = stretch ? 13 : 34;
  box(g, 4, armY, 7, stretch ? 17 : 10, c.skin);
  box(g, 32, armY, 7, stretch ? 17 : 10, c.skin);
  // Binoculars hang from a strap; folder remains on the right.
  rect(g, 15, 31, 1, 6, INK);
  rect(g, 28, 31, 1, 6, INK);
  box(g, 13, 35, 8, 10, 0x3b4b52);
  box(g, 23, 35, 8, 10, 0x3b4b52);
  rect(g, 20, 37, 4, 3, INK);
  rect(g, 15, 41, 4, 2, 0x8fd3d5);
  rect(g, 25, 41, 4, 2, 0x8fd3d5);
  const fy = stretch ? 3 : 36;
  box(g, 36, fy, 15, 18, 0xc59758);
  rect(g, 38, fy + 2, 11, 13, PAPER);
  pixels(g, 39, fy + 5, ["### # #", "#   # #", "#   # #", "#    # ", "###  # "], INK);
  if (pose === "cooler") cup(g, -5, 28);
  return root;
}

function server(c: HeroDefinition, pose: HeroPose, frame: 0 | 1): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  rect(g, 3, 59, 34, 3, 0x111a24, 0.35);
  const lift = pose === "stretch" ? -5 : 0;
  // Four casters and a low rack base: deliberately no human face, legs or hair.
  [7, 27].forEach(x => {
    box(g, x, 53, 7, 8, BOOT);
    rect(g, x + 2, 55 + (pose === "walk" ? frame : 0), 3, 3, c.light);
  });
  box(g, 5, 49, 31, 7, c.hair);
  rect(g, 7, 50, 27, 2, c.light);
  rect(g, 15, 43 + lift, 12, 9 - lift, c.hair);
  box(g, 4, 10 + lift, 33, 40, c.skin);
  rect(g, 6, 12 + lift, 2, 35 - lift, c.light);
  rect(g, 33, 12 + lift, 2, 35 - lift, c.hair);
  box(g, 9, 14 + lift, 23, 9, SCREEN);
  pixels(g, 11, 16 + lift, ["#        ##", " #  ###  ##", "#          "], c.accent);
  [26, 34, 42].forEach((y, i) => {
    box(g, 9, y + lift, 23, 7, c.shirt);
    rect(g, 11, y + lift + 2, 12, 1, INK);
    rect(g, 11, y + lift + 4, 9, 1, INK);
    rect(g, 27, y + lift + 2, 3, 2, i === 1 ? 0xe3b966 : c.accent, 0.35);
  });
  const leds = new Graphics();
  leds.label = "worker-leds";
  [26, 34, 42].forEach(y => rect(leds, 27, y + lift + 2, 3, 2, 0x77cc8f));
  // Deterministic different light phases even in a static preview.
  leds.alpha = pose === "walk" && frame === 1 ? 0.3 : 1;
  root.addChild(leds);
  const regression = new Graphics();
  regression.label = "regression-red";
  rect(regression, 27, 36 + lift, 3, 2, RED);
  regression.visible = false;
  root.addChild(regression);
  rect(g, 19, 5 + lift, 2, 5, c.hair);
  box(g, 17, 2 + lift, 6, 4, c.accent);
  const armY = pose === "stretch" ? 9 : 30;
  rect(g, 0, armY, 5, 4, c.hair);
  rect(g, 36, armY, 5, 4, c.hair);
  rect(g, -2, armY - (pose === "stretch" ? 5 : 0), 3, 8, c.light);
  rect(g, 40, armY - (pose === "stretch" ? 5 : 0), 3, 8, c.light);
  if (pose === "cooler") {
    // A gripper carries a cup; liquid never enters the server chassis.
    cup(g, 40, 26);
    rect(g, 36, 33, 5, 3, c.light);
  }
  if (pose === "sit") {
    rect(g, -3, 37, 7, 3, c.hair);
    box(g, -9, 31, 8, 10, SCREEN);
    rect(g, -7, 33, 4, 2, c.accent);
    rect(g, -7, 37, 3, 1, c.accent);
  }
  return root;
}

export function createHeroSprite(agent: AgentIdentity, pose: HeroPose, frame: 0 | 1 = 0): Container {
  const appearance = resolveAppearance(agent);
  if (appearance.kind === "legacy") {
    switch (pose) {
      case "sit": return legacy.createAgentSprite(appearance.id);
      case "walk": return legacy.createWalkingSprite(appearance.id, frame);
      case "stretch": return legacy.createStretchSprite(appearance.id);
      case "cooler": return legacy.createCoolerSprite(appearance.id);
    }
  }
  const root = appearance.hero.head === "dog"
    ? dog(appearance.hero, pose, frame)
    : appearance.hero.head === "server"
    ? server(appearance.hero, pose, frame)
    : human(appearance.hero, pose, frame);
  root.label = `hero-${appearance.key}-${pose}-${frame}`;
  addHeroDetails(root, appearance.key, pose);
  root.pivot.set(20, 60);
  return root;
}

/** Called from the office's existing clock; no per-sprite timers or subscriptions. */
export function animateHeroSprite(sprite: Container, elapsed: number, context: HeroAnimationContext = {}) {
  animateHeroDetails(sprite, elapsed, context);
}

export const createAgentSprite = (agent: AgentIdentity) => createHeroSprite(agent, "sit");
export const createWalkingSprite = (agent: AgentIdentity, frame: 0 | 1) => createHeroSprite(agent, "walk", frame);
export const createStretchSprite = (agent: AgentIdentity) => createHeroSprite(agent, "stretch");
export const createCoolerSprite = (agent: AgentIdentity) => createHeroSprite(agent, "cooler");
