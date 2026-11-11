import { Graphics, Container, Text, TextStyle } from "pixi.js";

export type AgentId = string;

// 40×60 px sprites, pivot at (20, 60) — bottom-center
// Scale in PixelOffice: 0.9x (same visual size as old 20×30 at 1.8x)
//
// Robot palette:
//   skin      = chassis metal (main body metal color)
//   hair      = joint / accent metal (elbows, bolts, dark panels)
//   shirt     = front body plate color
//   pants     = leg color
//   shoes     = foot / base color
//   accessory = LED / glow color

export interface AgentColors {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoes: number;
  accessory: number;
}

const FACE = 0x080c12;   // dark face plate

const AGENT_PALETTES: Record<AgentId, AgentColors> = {
  vanya: {
    skin: 0xb8860b, hair: 0x6d5100,
    shirt: 0xffd700, pants: 0x7a5c00, shoes: 0x3a2c00, accessory: 0xffec3d,
  },
  tema: {
    skin: 0x7b1fa2, hair: 0x4a148c,
    shirt: 0xab47bc, pants: 0x4a148c, shoes: 0x2d0a5a, accessory: 0xea80fc,
  },
  pushkin: {
    skin: 0xbf360c, hair: 0x8d2400,
    shirt: 0xff9800, pants: 0x8b4000, shoes: 0x3e1a00, accessory: 0xffd180,
  },
  coder: {
    skin: 0x1b5e20, hair: 0x0a3b0d,
    shirt: 0x4caf50, pants: 0x1b5e20, shoes: 0x0d2e10, accessory: 0x69f0ae,
  },
  garik: {
    skin: 0xb71c1c, hair: 0x7f0000,
    shirt: 0xf44336, pants: 0x8b1212, shoes: 0x3e0808, accessory: 0xff5252,
  },
  stoyanov: {
    skin: 0x1565c0, hair: 0x0d3a8f,
    shirt: 0x42a5f5, pants: 0x0d47a1, shoes: 0x061228, accessory: 0x80d8ff,
  },
  ded: {
    skin: 0x546e7a, hair: 0x37474f,
    shirt: 0x78909c, pants: 0x455a64, shoes: 0x263238, accessory: 0xb0bec5,
  },
  lenochka: {
    skin: 0xad1457, hair: 0x880e4f,
    shirt: 0xf06292, pants: 0xc2185b, shoes: 0x6a0032, accessory: 0xff80ab,
  },
  proshka: {
    skin: 0x1565c0, hair: 0x0d3a8f,
    shirt: 0x29b6f6, pants: 0x1565c0, shoes: 0x0d1b2e, accessory: 0x40c4ff,
  },
  gary: {
    skin: 0xbf360c, hair: 0x7c2000,
    shirt: 0xff6f00, pants: 0xa33000, shoes: 0x3e1200, accessory: 0xffd740,
  },
  lider: {
    skin: 0x0d47a1, hair: 0x062a6e,
    shirt: 0x1976d2, pants: 0x0d3a8f, shoes: 0x061228, accessory: 0x4dd0e1,
  },
  qa: {
    skin: 0x33691e, hair: 0x1b3a0a,
    shirt: 0x76c442, pants: 0x33691e, shoes: 0x1a2e0a, accessory: 0xccff90,
  },
  "tech-reviewer": {
    skin: 0xe65100, hair: 0xbf360c,
    shirt: 0xffc107, pants: 0xe65100, shoes: 0x3e1400, accessory: 0xffee58,
  },
  hunter: {
    skin: 0x4527a0, hair: 0x2c1570,
    shirt: 0x7c4dff, pants: 0x4527a0, shoes: 0x1a0a3e, accessory: 0xb388ff,
  },
};

const LABEL_STYLE = new TextStyle({
  fontFamily: '"Courier New", monospace',
  fontSize: 14,
  fontWeight: "bold",
  fill: 0xffffff,
  align: "center",
  dropShadow: { color: 0x000000, blur: 2, distance: 1, alpha: 0.8 },
});

// ─── Core robot body ─────────────────────────────────────────────────────────

function drawRobotCore(g: Graphics, c: AgentColors, agentId: AgentId) {
  // Shadow
  g.ellipse(20, 60, 16, 5);
  g.fill({ color: 0x000000, alpha: 0.3 });

  // ── FEET ──
  g.rect(3, 56, 14, 5);          // left foot
  g.fill(c.shoes);
  g.rect(3, 56, 14, 1);          // top highlight
  g.fill({ color: 0xffffff, alpha: 0.22 });
  g.rect(3, 59, 14, 1);          // bottom edge
  g.fill({ color: 0x000000, alpha: 0.35 });
  g.rect(3, 57, 4, 2);           // toe segment
  g.fill({ color: 0x000000, alpha: 0.18 });
  g.rect(4, 57, 1, 2);
  g.fill({ color: 0xffffff, alpha: 0.1 });

  g.rect(23, 56, 14, 5);         // right foot
  g.fill(c.shoes);
  g.rect(23, 56, 14, 1);
  g.fill({ color: 0xffffff, alpha: 0.22 });
  g.rect(23, 59, 14, 1);
  g.fill({ color: 0x000000, alpha: 0.35 });
  g.rect(33, 57, 4, 2);
  g.fill({ color: 0x000000, alpha: 0.18 });
  g.rect(35, 57, 1, 2);
  g.fill({ color: 0xffffff, alpha: 0.1 });

  // ── LOWER LEGS ──
  g.rect(6, 52, 10, 5);          // left
  g.fill(c.pants);
  g.rect(6, 52, 1, 5);
  g.fill({ color: 0xffffff, alpha: 0.15 });
  g.rect(15, 52, 1, 5);
  g.fill({ color: 0x000000, alpha: 0.2 });

  g.rect(24, 52, 10, 5);         // right
  g.fill(c.pants);
  g.rect(24, 52, 1, 5);
  g.fill({ color: 0xffffff, alpha: 0.15 });
  g.rect(33, 52, 1, 5);
  g.fill({ color: 0x000000, alpha: 0.2 });

  // ── KNEE ACTUATORS ──
  g.rect(4, 48, 14, 5);          // left knee (wider = mechanical joint)
  g.fill(c.hair);
  g.rect(4, 48, 14, 1);
  g.fill({ color: 0xffffff, alpha: 0.22 });
  g.rect(8, 50, 5, 2);           // kneecap
  g.fill(c.shoes);
  g.rect(8, 50, 5, 1);
  g.fill({ color: 0xffffff, alpha: 0.15 });

  g.rect(22, 48, 14, 5);         // right knee
  g.fill(c.hair);
  g.rect(22, 48, 14, 1);
  g.fill({ color: 0xffffff, alpha: 0.22 });
  g.rect(27, 50, 5, 2);
  g.fill(c.shoes);
  g.rect(27, 50, 5, 1);
  g.fill({ color: 0xffffff, alpha: 0.15 });

  // ── THIGHS ──
  g.rect(6, 39, 11, 10);         // left thigh
  g.fill(c.pants);
  g.rect(6, 39, 1, 10);
  g.fill({ color: 0xffffff, alpha: 0.15 });
  g.rect(16, 39, 1, 10);
  g.fill({ color: 0x000000, alpha: 0.2 });
  g.rect(8, 43, 6, 1);           // thigh panel line
  g.fill({ color: 0x000000, alpha: 0.3 });

  g.rect(23, 39, 11, 10);        // right thigh
  g.fill(c.pants);
  g.rect(23, 39, 1, 10);
  g.fill({ color: 0xffffff, alpha: 0.15 });
  g.rect(33, 39, 1, 10);
  g.fill({ color: 0x000000, alpha: 0.2 });
  g.rect(26, 43, 6, 1);
  g.fill({ color: 0x000000, alpha: 0.3 });

  // ── HIP CONNECTOR ──
  g.rect(8, 35, 24, 5);
  g.fill(c.shirt);
  g.rect(8, 35, 24, 1);
  g.fill({ color: 0xffffff, alpha: 0.2 });
  g.rect(8, 39, 24, 1);
  g.fill({ color: 0x000000, alpha: 0.3 });
  g.rect(19, 35, 2, 5);          // center split
  g.fill({ color: 0x000000, alpha: 0.3 });

  // ── TORSO ──
  g.rect(4, 17, 32, 19);
  g.fill(c.shirt);
  g.rect(4, 17, 32, 1);          // top highlight
  g.fill({ color: 0xffffff, alpha: 0.25 });
  g.rect(4, 34, 32, 1);          // bottom edge
  g.fill({ color: 0x000000, alpha: 0.3 });
  g.rect(4, 17, 2, 18);          // left edge
  g.fill({ color: 0x000000, alpha: 0.2 });
  g.rect(34, 17, 2, 18);         // right edge
  g.fill({ color: 0x000000, alpha: 0.2 });
  g.rect(4, 17, 9, 7);           // shoulder pad left (darker)
  g.fill({ color: 0x000000, alpha: 0.13 });
  g.rect(27, 17, 9, 7);          // shoulder pad right
  g.fill({ color: 0x000000, alpha: 0.13 });
  g.rect(4, 25, 32, 1);          // horizontal panel seam
  g.fill({ color: 0x000000, alpha: 0.38 });
  g.rect(19, 17, 2, 18);         // vertical center seam
  g.fill({ color: 0x000000, alpha: 0.15 });
  // right side vents
  g.rect(35, 22, 2, 1);
  g.fill({ color: 0x000000, alpha: 0.45 });
  g.rect(35, 24, 2, 1);
  g.fill({ color: 0x000000, alpha: 0.45 });
  g.rect(35, 26, 2, 1);
  g.fill({ color: 0x000000, alpha: 0.45 });

  // chest LED panel (3 status lights)
  g.rect(12, 19, 16, 10);
  g.fill(FACE);
  g.rect(12, 19, 16, 1);
  g.fill({ color: 0xffffff, alpha: 0.1 });
  // LED 1
  g.rect(13, 21, 4, 3);
  g.fill(c.accessory);
  g.rect(14, 21, 2, 2);
  g.fill({ color: 0xffffff, alpha: 0.6 });
  // LED 2
  g.rect(18, 21, 4, 3);
  g.fill(c.accessory);
  g.rect(19, 21, 2, 2);
  g.fill({ color: 0xffffff, alpha: 0.6 });
  // LED 3
  g.rect(23, 21, 4, 3);
  g.fill(c.accessory);
  g.rect(24, 21, 2, 2);
  g.fill({ color: 0xffffff, alpha: 0.6 });
  // chest vent slots
  g.rect(13, 26, 14, 1);
  g.fill({ color: 0x000000, alpha: 0.4 });
  g.rect(13, 28, 14, 1);
  g.fill({ color: 0x000000, alpha: 0.35 });

  // ── LEFT ARM ──
  g.rect(0, 17, 5, 5);           // shoulder ball
  g.fill(c.skin);
  g.rect(0, 17, 5, 1);
  g.fill({ color: 0xffffff, alpha: 0.25 });
  g.rect(0, 22, 5, 10);          // upper arm
  g.fill(c.skin);
  g.rect(0, 22, 1, 10);
  g.fill({ color: 0xffffff, alpha: 0.18 });
  g.rect(4, 22, 1, 10);
  g.fill({ color: 0x000000, alpha: 0.2 });
  g.rect(0, 27, 5, 1);           // upper arm panel line
  g.fill({ color: 0x000000, alpha: 0.25 });
  g.rect(-2, 32, 8, 5);          // elbow joint (wider)
  g.fill(c.hair);
  g.rect(-2, 32, 8, 1);
  g.fill({ color: 0xffffff, alpha: 0.22 });
  g.rect(0, 33, 3, 3);           // elbow cap
  g.fill(c.shoes);
  g.rect(0, 33, 3, 1);
  g.fill({ color: 0xffffff, alpha: 0.15 });
  g.rect(0, 37, 5, 9);           // lower arm
  g.fill(c.skin);
  g.rect(0, 37, 1, 9);
  g.fill({ color: 0xffffff, alpha: 0.18 });
  g.rect(0, 41, 5, 1);           // forearm panel line
  g.fill({ color: 0x000000, alpha: 0.25 });
  g.rect(-2, 46, 8, 3);          // wrist plate
  g.fill(c.hair);
  g.rect(-2, 49, 2, 7);          // gripper prong L
  g.fill(c.hair);
  g.rect(-2, 55, 2, 1);
  g.fill(c.accessory);
  g.rect(1, 49, 2, 7);           // gripper prong C
  g.fill(c.hair);
  g.rect(1, 55, 2, 1);
  g.fill(c.accessory);
  g.rect(4, 49, 2, 7);           // gripper prong R
  g.fill(c.hair);
  g.rect(4, 55, 2, 1);
  g.fill(c.accessory);

  // ── RIGHT ARM (mirrored) ──
  g.rect(35, 17, 5, 5);
  g.fill(c.skin);
  g.rect(35, 17, 5, 1);
  g.fill({ color: 0xffffff, alpha: 0.25 });
  g.rect(35, 22, 5, 10);
  g.fill(c.skin);
  g.rect(35, 22, 1, 10);
  g.fill({ color: 0xffffff, alpha: 0.18 });
  g.rect(39, 22, 1, 10);
  g.fill({ color: 0x000000, alpha: 0.2 });
  g.rect(35, 27, 5, 1);
  g.fill({ color: 0x000000, alpha: 0.25 });
  g.rect(34, 32, 8, 5);
  g.fill(c.hair);
  g.rect(34, 32, 8, 1);
  g.fill({ color: 0xffffff, alpha: 0.22 });
  g.rect(37, 33, 3, 3);
  g.fill(c.shoes);
  g.rect(37, 33, 3, 1);
  g.fill({ color: 0xffffff, alpha: 0.15 });
  g.rect(35, 37, 5, 9);
  g.fill(c.skin);
  g.rect(39, 37, 1, 9);
  g.fill({ color: 0xffffff, alpha: 0.18 });
  g.rect(35, 41, 5, 1);
  g.fill({ color: 0x000000, alpha: 0.25 });
  g.rect(34, 46, 8, 3);
  g.fill(c.hair);
  g.rect(34, 49, 2, 7);          // gripper prong L
  g.fill(c.hair);
  g.rect(34, 55, 2, 1);
  g.fill(c.accessory);
  g.rect(37, 49, 2, 7);          // gripper prong C
  g.fill(c.hair);
  g.rect(37, 55, 2, 1);
  g.fill(c.accessory);
  g.rect(40, 49, 2, 7);          // gripper prong R
  g.fill(c.hair);
  g.rect(40, 55, 2, 1);
  g.fill(c.accessory);

  // ── NECK ──
  g.rect(15, 13, 10, 5);
  g.fill(c.skin);
  g.rect(15, 13, 10, 1);
  g.fill({ color: 0xffffff, alpha: 0.2 });
  g.rect(15, 15, 10, 1);         // ridge 1
  g.fill({ color: 0x000000, alpha: 0.3 });
  g.rect(15, 17, 10, 1);         // ridge 2
  g.fill({ color: 0x000000, alpha: 0.25 });

  // ── HEAD CHASSIS ──
  g.rect(10, 0, 20, 14);
  g.fill(c.skin);
  g.rect(10, 0, 20, 1);          // top highlight
  g.fill({ color: 0xffffff, alpha: 0.35 });
  g.rect(10, 13, 20, 1);         // bottom edge
  g.fill({ color: 0x000000, alpha: 0.3 });
  g.rect(10, 0, 1, 14);          // left edge
  g.fill({ color: 0x000000, alpha: 0.2 });
  g.rect(29, 0, 1, 14);          // right edge
  g.fill({ color: 0x000000, alpha: 0.2 });
  // corner bolts
  g.rect(10, 0, 3, 3);
  g.fill(c.hair);
  g.rect(27, 0, 3, 3);
  g.fill(c.hair);
  g.rect(10, 11, 3, 3);
  g.fill(c.hair);
  g.rect(27, 11, 3, 3);
  g.fill(c.hair);
  // bolt center (slightly lighter)
  g.rect(11, 1, 1, 1);
  g.fill({ color: 0xffffff, alpha: 0.3 });
  g.rect(28, 1, 1, 1);
  g.fill({ color: 0xffffff, alpha: 0.3 });
  g.rect(11, 12, 1, 1);
  g.fill({ color: 0xffffff, alpha: 0.3 });
  g.rect(28, 12, 1, 1);
  g.fill({ color: 0xffffff, alpha: 0.3 });

  // ── EAR PANELS ──
  g.rect(7, 2, 3, 9);            // left ear
  g.fill(c.skin);
  g.rect(7, 2, 1, 9);
  g.fill({ color: 0x000000, alpha: 0.2 });
  g.rect(8, 4, 1, 1);            // ear vent 1
  g.fill({ color: 0x000000, alpha: 0.6 });
  g.rect(8, 6, 1, 1);            // ear vent 2
  g.fill({ color: 0x000000, alpha: 0.6 });
  g.rect(8, 8, 1, 1);            // ear vent 3
  g.fill({ color: 0x000000, alpha: 0.6 });

  g.rect(30, 2, 3, 9);           // right ear
  g.fill(c.skin);
  g.rect(32, 2, 1, 9);
  g.fill({ color: 0x000000, alpha: 0.2 });
  g.rect(31, 4, 1, 1);
  g.fill({ color: 0x000000, alpha: 0.6 });
  g.rect(31, 6, 1, 1);
  g.fill({ color: 0x000000, alpha: 0.6 });
  g.rect(31, 8, 1, 1);
  g.fill({ color: 0x000000, alpha: 0.6 });

  // ── FACE PLATE ──
  g.rect(12, 1, 16, 12);
  g.fill(FACE);
  // eyebrow ridges (raised chassis metal above eyes)
  g.rect(12, 1, 7, 3);
  g.fill(c.skin);
  g.rect(21, 1, 7, 3);
  g.fill(c.skin);
  g.rect(12, 3, 7, 1);           // brow underline
  g.fill({ color: 0x000000, alpha: 0.35 });
  g.rect(21, 3, 7, 1);
  g.fill({ color: 0x000000, alpha: 0.35 });

  // ── EYES ──
  // socket depth (dark recess)
  g.rect(12, 4, 8, 5);
  g.fill({ color: 0x000000, alpha: 0.5 });
  g.rect(20, 4, 8, 5);
  g.fill({ color: 0x000000, alpha: 0.5 });
  // LED eye
  g.rect(13, 5, 6, 3);
  g.fill(c.accessory);
  g.rect(21, 5, 6, 3);
  g.fill(c.accessory);
  // inner glow (bright center column)
  g.rect(15, 5, 2, 3);
  g.fill({ color: 0xffffff, alpha: 0.65 });
  g.rect(23, 5, 2, 3);
  g.fill({ color: 0xffffff, alpha: 0.65 });
  // outer dim edges
  g.rect(13, 5, 2, 3);
  g.fill({ color: 0x000000, alpha: 0.2 });
  g.rect(19, 5, 2, 3);
  g.fill({ color: 0x000000, alpha: 0.2 });

  // ── NOSE LED ──
  g.rect(19, 9, 2, 2);
  g.fill(c.accessory);
  g.rect(19, 9, 2, 1);
  g.fill({ color: 0xffffff, alpha: 0.4 });

  // ── MOUTH / DISPLAY BAR ──
  g.rect(12, 11, 16, 3);
  g.fill(FACE);
  g.rect(13, 12, 14, 1);         // LED bar
  g.fill(c.accessory);
  // segment ticks along bar
  for (let i = 0; i < 6; i++) {
    g.rect(14 + i * 2, 12, 1, 1);
    g.fill({ color: 0xffffff, alpha: 0.5 });
  }

  // ── ANTENNA ──
  g.rect(18, -9, 4, 9);          // stick
  g.fill(c.skin);
  g.rect(18, -9, 1, 9);
  g.fill({ color: 0xffffff, alpha: 0.2 });
  g.rect(14, -14, 12, 6);        // emitter head
  g.fill(c.accessory);
  g.rect(14, -14, 12, 1);        // top highlight
  g.fill({ color: 0xffffff, alpha: 0.35 });
  g.rect(16, -13, 8, 4);         // bright core
  g.fill({ color: 0xffffff, alpha: 0.55 });
  g.rect(17, -12, 6, 2);         // center glow
  g.fill({ color: 0xffffff, alpha: 0.7 });

  // ── Per-agent head mods ──
  if (agentId === "lenochka") {
    // Bow instead of plain antenna ball
    g.rect(10, -4, 6, 3);        // left bow petal
    g.fill(c.shirt);
    g.rect(10, -4, 6, 1);
    g.fill({ color: 0xffffff, alpha: 0.25 });
    g.rect(24, -4, 6, 3);        // right bow petal
    g.fill(c.shirt);
    g.rect(24, -4, 6, 1);
    g.fill({ color: 0xffffff, alpha: 0.25 });
    g.rect(18, -4, 4, 3);        // bow center knot
    g.fill(c.accessory);
    // blush panels (cheek glow)
    g.rect(11, 7, 3, 2);
    g.fill({ color: 0xff80ab, alpha: 0.35 });
    g.rect(26, 7, 3, 2);
    g.fill({ color: 0xff80ab, alpha: 0.35 });
  }

  if (agentId === "ded") {
    // chin data-cable plate
    g.rect(13, 11, 14, 2);
    g.fill(c.hair);
    // wear scratches on face plate
    g.rect(14, 5, 1, 5);
    g.fill({ color: 0xffffff, alpha: 0.07 });
    g.rect(22, 4, 1, 4);
    g.fill({ color: 0xffffff, alpha: 0.07 });
    // dim eyes (old robot)
    g.rect(15, 5, 2, 3);
    g.fill({ color: 0x000000, alpha: 0.3 });
    g.rect(23, 5, 2, 3);
    g.fill({ color: 0x000000, alpha: 0.3 });
  }

  if (agentId === "gary") {
    // snapback panel cap
    g.rect(9, -1, 22, 3);        // brim
    g.fill(c.hair);
    g.rect(9, -1, 3, 4);         // visor tab
    g.fill(c.hair);
    g.rect(9, -1, 22, 1);
    g.fill({ color: 0xffffff, alpha: 0.2 });
  }

  if (agentId === "proshka") {
    // delivery cap stripe
    g.rect(10, 0, 20, 2);
    g.fill(c.accessory);
    g.rect(28, 0, 4, 3);         // visor tab
    g.fill(c.accessory);
  }

  if (agentId === "tech-reviewer") {
    // hard hat (electrician caska)
    g.rect(8, -5, 24, 6);        // dome
    g.fill(c.accessory);
    g.rect(8, -5, 24, 1);
    g.fill({ color: 0xffffff, alpha: 0.3 });
    g.rect(6, 0, 28, 2);         // brim
    g.fill(c.accessory);
    g.rect(6, 0, 28, 1);
    g.fill({ color: 0xffffff, alpha: 0.15 });
    // safety stripe
    g.rect(8, -2, 24, 2);
    g.fill({ color: 0x000000, alpha: 0.2 });
  }
}

// ─── Sitting sprite ───────────────────────────────────────────────────────────

export function createAgentSprite(agentId: AgentId): Container {
  const container = new Container();
  container.label = `agent-${agentId}`;
  const paletteIds = Object.keys(AGENT_PALETTES);
  const hash = [...agentId].reduce((value, char) => value + char.charCodeAt(0), 0);
  const c = AGENT_PALETTES[agentId] ?? AGENT_PALETTES[paletteIds[hash % paletteIds.length]];
  const g = new Graphics();
  drawRobotCore(g, c, agentId);
  container.addChild(g);
  container.addChild(drawAccessory(agentId, c));
  container.pivot.set(20, 60);
  return container;
}

// ─── Accessories ─────────────────────────────────────────────────────────────

function drawAccessory(agentId: AgentId, c: AgentColors): Graphics {
  const g = new Graphics();

  switch (agentId) {
    case "vanya":
      // Holographic coordination tablet in gripper
      g.rect(7, 20, 12, 10);
      g.fill(FACE);
      g.rect(8, 21, 10, 7);
      g.fill({ color: c.accessory, alpha: 0.65 });
      g.rect(8, 22, 7, 1);       // data row 1
      g.fill({ color: 0xffffff, alpha: 0.4 });
      g.rect(8, 24, 5, 1);       // data row 2
      g.fill({ color: 0xffffff, alpha: 0.3 });
      g.rect(8, 26, 9, 1);       // data row 3
      g.fill({ color: 0xffffff, alpha: 0.35 });
      break;

    case "tema":
      // Stylus + drawing pad on desk
      g.rect(41, 20, 13, 10);
      g.fill(FACE);
      g.rect(42, 21, 11, 8);
      g.fill({ color: c.accessory, alpha: 0.5 });
      // color swatches
      g.rect(43, 22, 3, 3);
      g.fill(0xff5252);
      g.rect(47, 22, 3, 3);
      g.fill(0x69f0ae);
      g.rect(43, 26, 3, 2);
      g.fill(0x80d8ff);
      g.rect(47, 26, 3, 2);
      g.fill(0xffd740);
      // stylus
      g.rect(54, 18, 2, 9);
      g.fill(0xdfe6e9);
      g.rect(54, 17, 2, 2);
      g.fill(c.accessory);
      break;

    case "pushkin":
      // Glowing quill pen
      g.rect(40, 15, 3, 14);
      g.fill(c.accessory);
      g.rect(41, 15, 1, 14);
      g.fill({ color: 0xffffff, alpha: 0.5 });
      g.rect(38, 13, 7, 4);      // feather tip
      g.fill({ color: c.accessory, alpha: 0.7 });
      break;

    case "coder":
      // Laptop with code
      g.rect(41, 19, 16, 12);
      g.fill(FACE);
      g.rect(42, 20, 14, 10);
      g.fill({ color: c.accessory, alpha: 0.55 });
      // code lines
      g.rect(43, 21, 9, 1);
      g.fill({ color: 0xffffff, alpha: 0.4 });
      g.rect(43, 23, 6, 1);
      g.fill({ color: 0x69f0ae, alpha: 0.6 });
      g.rect(43, 25, 11, 1);
      g.fill({ color: 0xffffff, alpha: 0.35 });
      g.rect(43, 27, 4, 1);
      g.fill({ color: 0xff5252, alpha: 0.6 });
      g.rect(43, 29, 8, 1);
      g.fill({ color: 0xffffff, alpha: 0.3 });
      // server rack LEDs
      g.rect(58, 19, 3, 2);
      g.fill(0x55efc4);
      g.rect(58, 23, 3, 2);
      g.fill(0xff7675);
      g.rect(58, 27, 3, 2);
      g.fill(c.accessory);
      break;

    case "garik":
      // Phone + signal waves
      g.rect(40, 16, 7, 12);
      g.fill(FACE);
      g.rect(41, 17, 5, 10);
      g.fill({ color: c.accessory, alpha: 0.7 });
      g.rect(42, 18, 3, 2);      // screen content
      g.fill({ color: 0xffffff, alpha: 0.4 });
      g.rect(42, 22, 3, 1);
      g.fill({ color: 0xffffff, alpha: 0.3 });
      // signal arcs
      g.rect(47, 18, 1, 3);
      g.fill(c.accessory);
      g.rect(49, 16, 1, 5);
      g.fill({ color: c.accessory, alpha: 0.6 });
      g.rect(51, 14, 1, 7);
      g.fill({ color: c.accessory, alpha: 0.4 });
      break;

    case "stoyanov":
      // Camera body + lens
      g.rect(41, 16, 13, 10);
      g.fill(FACE);
      g.rect(41, 16, 13, 1);
      g.fill({ color: 0xffffff, alpha: 0.15 });
      g.roundRect(44, 17, 7, 7, 3);
      g.fill(c.accessory);
      g.circle(47, 20, 3);       // lens
      g.fill(0x001f3f);
      g.circle(47, 20, 2);
      g.fill(0x74b9ff);
      g.circle(47, 20, 1);
      g.fill(0xffffff);
      // REC light
      g.rect(53, 16, 3, 2);
      g.fill(0xff3300);
      g.rect(54, 17, 1, 1);
      g.fill({ color: 0xffffff, alpha: 0.5 });
      break;

    case "ded":
      // Ancient data tome
      g.rect(6, 18, 14, 14);
      g.fill(0x4e342e);
      g.rect(6, 18, 14, 1);
      g.fill({ color: 0xffffff, alpha: 0.15 });
      g.rect(7, 19, 12, 12);
      g.fill(0xfff8e1);
      g.rect(8, 20, 9, 1);
      g.fill({ color: 0x000000, alpha: 0.25 });
      g.rect(8, 22, 7, 1);
      g.fill({ color: 0x000000, alpha: 0.25 });
      g.rect(8, 24, 10, 1);
      g.fill({ color: 0x000000, alpha: 0.25 });
      g.rect(8, 26, 6, 1);
      g.fill({ color: 0x000000, alpha: 0.25 });
      g.rect(8, 28, 8, 1);
      g.fill({ color: 0x000000, alpha: 0.25 });
      // HUD glasses on face
      g.rect(11, 5, 6, 5);
      g.stroke({ color: c.accessory, width: 1 });
      g.rect(22, 5, 6, 5);
      g.stroke({ color: c.accessory, width: 1 });
      g.rect(17, 7, 5, 1);
      g.stroke({ color: c.accessory, width: 1 });
      break;

    case "lenochka":
      // Reception terminal
      g.rect(40, 17, 9, 10);
      g.fill(FACE);
      g.rect(41, 18, 7, 8);
      g.fill({ color: c.accessory, alpha: 0.6 });
      g.rect(41, 19, 5, 1);
      g.fill({ color: 0xffffff, alpha: 0.4 });
      g.rect(41, 21, 7, 1);
      g.fill({ color: 0xffffff, alpha: 0.3 });
      g.rect(41, 23, 4, 1);
      g.fill({ color: 0xffffff, alpha: 0.35 });
      break;

    case "proshka":
      // Delivery cart (wheeled)
      g.rect(41, 22, 16, 14);    // cart body
      g.fill(0x5d4037);
      g.rect(41, 22, 16, 1);
      g.fill({ color: 0xffffff, alpha: 0.15 });
      g.rect(41, 18, 16, 5);     // cart top tray
      g.fill(0x795548);
      g.rect(42, 19, 5, 3);      // envelope 1
      g.fill(0xffffff);
      g.rect(48, 19, 5, 3);      // envelope 2
      g.fill(0xfff9c4);
      g.rect(42, 23, 14, 1);     // LED stripe
      g.fill(c.accessory);
      g.circle(43, 36, 3);       // wheel L
      g.fill(0x212121);
      g.circle(53, 36, 3);       // wheel R
      g.fill(0x212121);
      break;

    case "gary":
      // Phone camera + mic
      g.rect(40, 13, 8, 13);     // phone
      g.fill(FACE);
      g.rect(41, 14, 6, 11);
      g.fill({ color: 0x74b9ff, alpha: 0.8 });
      g.rect(42, 15, 4, 3);
      g.fill({ color: 0xffffff, alpha: 0.35 });
      g.circle(49, 14, 1);       // LIVE dot
      g.fill(0xff0000);
      g.rect(49, 19, 3, 7);      // mic stand
      g.fill(0x636e72);
      g.rect(47, 17, 7, 3);      // mic head
      g.fill(0x636e72);
      g.rect(48, 18, 5, 1);
      g.fill({ color: 0xffffff, alpha: 0.2 });
      break;

    case "lider":
      // Blueprint / architecture plans
      g.rect(7, 19, 13, 13);
      g.fill(0x1565c0);
      g.rect(7, 19, 13, 1);
      g.fill({ color: 0xffffff, alpha: 0.2 });
      g.rect(8, 20, 11, 11);
      g.fill(0x1976d2);
      g.rect(9, 21, 9, 1);       // line 1
      g.fill({ color: 0xffffff, alpha: 0.45 });
      g.rect(9, 23, 5, 1);       // line 2
      g.fill({ color: 0xffffff, alpha: 0.45 });
      g.rect(9, 21, 1, 7);       // vertical
      g.fill({ color: 0xffffff, alpha: 0.35 });
      g.rect(9, 25, 9, 1);       // line 3
      g.fill({ color: 0xffffff, alpha: 0.4 });
      g.rect(9, 27, 7, 1);       // line 4
      g.fill({ color: 0xffffff, alpha: 0.35 });
      break;

    case "qa":
      // Bug scanner / test device
      g.rect(40, 14, 11, 14);
      g.fill(FACE);
      g.rect(41, 15, 9, 11);
      g.fill({ color: c.accessory, alpha: 0.55 });
      g.rect(42, 17, 7, 1);      // scan line
      g.fill({ color: 0xff0000, alpha: 0.6 });
      g.rect(42, 20, 7, 1);
      g.fill({ color: 0xff0000, alpha: 0.3 });
      g.rect(40, 26, 3, 7);      // probe wire red
      g.fill(0xff1744);
      g.rect(48, 26, 3, 6);      // probe wire blue
      g.fill(0x00b0ff);
      break;

    case "tech-reviewer":
      // Multimeter / voltage tester
      g.rect(40, 14, 11, 14);
      g.fill(FACE);
      g.rect(41, 15, 9, 11);
      g.fill({ color: c.accessory, alpha: 0.65 });
      g.rect(42, 16, 6, 3);      // display
      g.fill({ color: 0xffffff, alpha: 0.5 });
      g.rect(43, 17, 3, 1);
      g.fill({ color: 0x000000, alpha: 0.4 });
      g.rect(40, 26, 2, 8);      // probe red
      g.fill(0xff1744);
      g.rect(49, 26, 2, 7);      // probe blue
      g.fill(0x0000ff);
      break;
  }

  return g;
}

// ─── Walking sprite ───────────────────────────────────────────────────────────

export function createWalkingSprite(agentId: AgentId, frame: 0 | 1): Container {
  const container = new Container();
  container.label = `walk-${agentId}-${frame}`;
  const paletteIds = Object.keys(AGENT_PALETTES);
  const hash = [...agentId].reduce((value, char) => value + char.charCodeAt(0), 0);
  const c = AGENT_PALETTES[agentId] ?? AGENT_PALETTES[paletteIds[hash % paletteIds.length]];
  const g = new Graphics();

  // Shadow
  g.ellipse(20, 60, 16, 5);
  g.fill({ color: 0x000000, alpha: 0.3 });

  // ── FEET (walking positions) ──
  if (frame === 0) {
    g.rect(0, 56, 14, 5);        // left foot forward
    g.fill(c.shoes);
    g.rect(24, 56, 14, 5);       // right foot back
    g.fill(c.shoes);
  } else {
    g.rect(2, 56, 14, 5);        // left foot back
    g.fill(c.shoes);
    g.rect(26, 56, 14, 5);       // right foot forward
    g.fill(c.shoes);
  }
  g.rect(0, 56, 40, 1);
  g.fill({ color: 0xffffff, alpha: 0.15 });

  // ── LEGS (walking stride) ──
  if (frame === 0) {
    g.rect(3, 39, 11, 17);       // left thigh+lower forward
    g.fill(c.pants);
    g.rect(3, 50, 14, 5);        // left knee
    g.fill(c.hair);
    g.rect(22, 39, 11, 17);      // right back
    g.fill(c.pants);
    g.rect(22, 50, 14, 5);
    g.fill(c.hair);
  } else {
    g.rect(6, 39, 11, 17);
    g.fill(c.pants);
    g.rect(4, 50, 14, 5);
    g.fill(c.hair);
    g.rect(25, 39, 11, 17);
    g.fill(c.pants);
    g.rect(23, 50, 14, 5);
    g.fill(c.hair);
  }

  // ── TORSO ──
  g.rect(4, 17, 32, 19);
  g.fill(c.shirt);
  g.rect(4, 17, 32, 1);
  g.fill({ color: 0xffffff, alpha: 0.25 });
  g.rect(4, 25, 32, 1);
  g.fill({ color: 0x000000, alpha: 0.38 });
  g.rect(4, 17, 2, 18);
  g.fill({ color: 0x000000, alpha: 0.2 });
  g.rect(34, 17, 2, 18);
  g.fill({ color: 0x000000, alpha: 0.2 });
  g.rect(12, 19, 16, 10);
  g.fill(FACE);
  g.rect(13, 21, 4, 3);
  g.fill(c.accessory);
  g.rect(18, 21, 4, 3);
  g.fill(c.accessory);
  g.rect(23, 21, 4, 3);
  g.fill(c.accessory);

  // ── ARMS (opposite swing to legs) ──
  if (frame === 0) {
    // left arm back, right forward
    g.rect(0, 19, 5, 20);        // left upper+lower back
    g.fill(c.skin);
    g.rect(-2, 33, 8, 4);
    g.fill(c.hair);
    g.rect(35, 15, 5, 20);       // right upper+lower forward
    g.fill(c.skin);
    g.rect(34, 29, 8, 4);
    g.fill(c.hair);
  } else {
    g.rect(0, 15, 5, 20);        // left forward
    g.fill(c.skin);
    g.rect(-2, 29, 8, 4);
    g.fill(c.hair);
    g.rect(35, 19, 5, 20);       // right back
    g.fill(c.skin);
    g.rect(34, 33, 8, 4);
    g.fill(c.hair);
  }

  // ── NECK ──
  g.rect(15, 13, 10, 5);
  g.fill(c.skin);
  g.rect(15, 15, 10, 1);
  g.fill({ color: 0x000000, alpha: 0.3 });

  // ── HEAD ──
  g.rect(10, 0, 20, 14);
  g.fill(c.skin);
  g.rect(10, 0, 20, 1);
  g.fill({ color: 0xffffff, alpha: 0.35 });
  g.rect(10, 0, 3, 3);
  g.fill(c.hair);
  g.rect(27, 0, 3, 3);
  g.fill(c.hair);
  g.rect(7, 2, 3, 9);
  g.fill(c.skin);
  g.rect(30, 2, 3, 9);
  g.fill(c.skin);
  g.rect(12, 1, 16, 12);
  g.fill(FACE);
  g.rect(12, 1, 7, 3);
  g.fill(c.skin);
  g.rect(21, 1, 7, 3);
  g.fill(c.skin);
  g.rect(12, 4, 8, 5);
  g.fill({ color: 0x000000, alpha: 0.5 });
  g.rect(20, 4, 8, 5);
  g.fill({ color: 0x000000, alpha: 0.5 });
  g.rect(13, 5, 6, 3);
  g.fill(c.accessory);
  g.rect(21, 5, 6, 3);
  g.fill(c.accessory);
  g.rect(15, 5, 2, 3);
  g.fill({ color: 0xffffff, alpha: 0.65 });
  g.rect(23, 5, 2, 3);
  g.fill({ color: 0xffffff, alpha: 0.65 });
  g.rect(13, 12, 14, 1);
  g.fill(c.accessory);
  // antenna
  g.rect(18, -9, 4, 9);
  g.fill(c.skin);
  g.rect(14, -14, 12, 6);
  g.fill(c.accessory);
  g.rect(17, -12, 6, 2);
  g.fill({ color: 0xffffff, alpha: 0.7 });

  // agent head mods on walk
  if (agentId === "tech-reviewer") {
    g.rect(8, -5, 24, 6);
    g.fill(c.accessory);
    g.rect(6, 0, 28, 2);
    g.fill(c.accessory);
  }
  if (agentId === "proshka") {
    g.rect(10, 0, 20, 2);
    g.fill(c.accessory);
  }
  if (agentId === "gary") {
    g.rect(9, -1, 22, 3);
    g.fill(c.hair);
  }
  if (agentId === "lenochka") {
    g.rect(10, -4, 6, 3);
    g.fill(c.shirt);
    g.rect(24, -4, 6, 3);
    g.fill(c.shirt);
    g.rect(18, -4, 4, 3);
    g.fill(c.accessory);
  }
  if (agentId === "ded") {
    g.rect(13, 11, 14, 2);
    g.fill(c.hair);
  }

  container.addChild(g);
  container.pivot.set(20, 60);
  return container;
}

// ─── Stretch sprite (arms raised) ────────────────────────────────────────────

export function createStretchSprite(agentId: AgentId): Container {
  const container = new Container();
  container.label = `stretch-${agentId}`;
  const paletteIds = Object.keys(AGENT_PALETTES);
  const hash = [...agentId].reduce((value, char) => value + char.charCodeAt(0), 0);
  const c = AGENT_PALETTES[agentId] ?? AGENT_PALETTES[paletteIds[hash % paletteIds.length]];
  const g = new Graphics();

  g.ellipse(20, 60, 16, 5);
  g.fill({ color: 0x000000, alpha: 0.3 });

  // Feet
  g.rect(3, 56, 14, 5);
  g.fill(c.shoes);
  g.rect(23, 56, 14, 5);
  g.fill(c.shoes);
  // Legs
  g.rect(6, 39, 11, 17);
  g.fill(c.pants);
  g.rect(4, 48, 14, 5);
  g.fill(c.hair);
  g.rect(23, 39, 11, 17);
  g.fill(c.pants);
  g.rect(22, 48, 14, 5);
  g.fill(c.hair);
  // Torso
  g.rect(4, 17, 32, 19);
  g.fill(c.shirt);
  g.rect(4, 17, 32, 1);
  g.fill({ color: 0xffffff, alpha: 0.25 });
  g.rect(4, 25, 32, 1);
  g.fill({ color: 0x000000, alpha: 0.35 });
  g.rect(12, 19, 16, 10);
  g.fill(FACE);
  g.rect(13, 21, 4, 3);
  g.fill(c.accessory);
  g.rect(18, 21, 4, 3);
  g.fill(c.accessory);
  g.rect(23, 21, 4, 3);
  g.fill(c.accessory);

  // ARMS raised high
  g.rect(0, 0, 5, 18);           // left arm raised
  g.fill(c.skin);
  g.rect(-2, 10, 8, 4);          // left elbow
  g.fill(c.hair);
  g.rect(-2, 2, 2, 5);           // left gripper prong L
  g.fill(c.hair);
  g.rect(1, 2, 2, 5);            // left gripper prong C
  g.fill(c.hair);
  g.rect(4, 2, 2, 5);            // left gripper prong R
  g.fill(c.hair);
  // prong tips glow
  g.rect(-2, 2, 2, 1);
  g.fill(c.accessory);
  g.rect(1, 2, 2, 1);
  g.fill(c.accessory);
  g.rect(4, 2, 2, 1);
  g.fill(c.accessory);

  g.rect(35, 0, 5, 18);          // right arm raised
  g.fill(c.skin);
  g.rect(34, 10, 8, 4);
  g.fill(c.hair);
  g.rect(34, 2, 2, 5);
  g.fill(c.hair);
  g.rect(37, 2, 2, 5);
  g.fill(c.hair);
  g.rect(40, 2, 2, 5);
  g.fill(c.hair);
  g.rect(34, 2, 2, 1);
  g.fill(c.accessory);
  g.rect(37, 2, 2, 1);
  g.fill(c.accessory);
  g.rect(40, 2, 2, 1);
  g.fill(c.accessory);

  // Neck
  g.rect(15, 13, 10, 5);
  g.fill(c.skin);

  // Head
  g.rect(10, 0, 20, 14);
  g.fill(c.skin);
  g.rect(10, 0, 20, 1);
  g.fill({ color: 0xffffff, alpha: 0.35 });
  g.rect(7, 2, 3, 9);
  g.fill(c.skin);
  g.rect(30, 2, 3, 9);
  g.fill(c.skin);
  g.rect(12, 1, 16, 12);
  g.fill(FACE);
  g.rect(12, 1, 7, 3);
  g.fill(c.skin);
  g.rect(21, 1, 7, 3);
  g.fill(c.skin);
  // eyes half-closed (rebooting)
  g.rect(13, 6, 6, 1);
  g.fill(c.accessory);
  g.rect(21, 6, 6, 1);
  g.fill(c.accessory);
  // mouth wide open
  g.roundRect(14, 10, 12, 3, 1);
  g.fill(c.accessory);
  g.rect(15, 11, 10, 1);
  g.fill({ color: 0xffffff, alpha: 0.5 });
  // antenna
  g.rect(18, -9, 4, 9);
  g.fill(c.skin);
  g.rect(14, -14, 12, 6);
  g.fill(c.accessory);
  g.rect(17, -12, 6, 2);
  g.fill({ color: 0xffffff, alpha: 0.7 });

  container.addChild(g);
  container.pivot.set(20, 60);
  return container;
}

// ─── Cooler sprite (holding cup) ─────────────────────────────────────────────

export function createCoolerSprite(agentId: AgentId): Container {
  const container = new Container();
  container.label = `cooler-${agentId}`;
  const paletteIds = Object.keys(AGENT_PALETTES);
  const hash = [...agentId].reduce((value, char) => value + char.charCodeAt(0), 0);
  const c = AGENT_PALETTES[agentId] ?? AGENT_PALETTES[paletteIds[hash % paletteIds.length]];
  const g = new Graphics();

  g.ellipse(20, 60, 16, 5);
  g.fill({ color: 0x000000, alpha: 0.3 });

  g.rect(3, 56, 14, 5);
  g.fill(c.shoes);
  g.rect(23, 56, 14, 5);
  g.fill(c.shoes);
  g.rect(6, 39, 11, 17);
  g.fill(c.pants);
  g.rect(4, 48, 14, 5);
  g.fill(c.hair);
  g.rect(23, 39, 11, 17);
  g.fill(c.pants);
  g.rect(22, 48, 14, 5);
  g.fill(c.hair);

  g.rect(4, 17, 32, 19);
  g.fill(c.shirt);
  g.rect(4, 17, 32, 1);
  g.fill({ color: 0xffffff, alpha: 0.25 });
  g.rect(4, 25, 32, 1);
  g.fill({ color: 0x000000, alpha: 0.35 });
  g.rect(12, 19, 16, 10);
  g.fill(FACE);
  g.rect(13, 21, 4, 3);
  g.fill(c.accessory);
  g.rect(18, 21, 4, 3);
  g.fill(c.accessory);
  g.rect(23, 21, 4, 3);
  g.fill(c.accessory);

  // Left arm normal
  g.rect(0, 17, 5, 30);
  g.fill(c.skin);
  g.rect(-2, 32, 8, 5);
  g.fill(c.hair);

  // Right arm bent holding cup
  g.rect(35, 17, 5, 12);         // upper arm down
  g.fill(c.skin);
  g.rect(34, 29, 8, 4);          // elbow
  g.fill(c.hair);
  g.rect(35, 30, 14, 5);         // forearm horizontal
  g.fill(c.skin);
  // cup
  g.rect(44, 22, 7, 9);          // cup body
  g.fill(0xdfe6e9);
  g.rect(44, 22, 7, 1);
  g.fill({ color: 0xffffff, alpha: 0.4 });
  g.rect(45, 23, 5, 7);          // water
  g.fill(0x4dd0e1);
  g.rect(45, 24, 3, 1);          // water highlight
  g.fill({ color: 0xffffff, alpha: 0.4 });
  // steam
  g.rect(46, 21, 1, 2);
  g.fill({ color: 0x4dd0e1, alpha: 0.45 });
  g.rect(49, 20, 1, 2);
  g.fill({ color: 0x4dd0e1, alpha: 0.3 });
  g.rect(47, 19, 1, 1);
  g.fill({ color: 0x4dd0e1, alpha: 0.2 });

  g.rect(15, 13, 10, 5);
  g.fill(c.skin);

  g.rect(10, 0, 20, 14);
  g.fill(c.skin);
  g.rect(10, 0, 20, 1);
  g.fill({ color: 0xffffff, alpha: 0.35 });
  g.rect(7, 2, 3, 9);
  g.fill(c.skin);
  g.rect(30, 2, 3, 9);
  g.fill(c.skin);
  g.rect(12, 1, 16, 12);
  g.fill(FACE);
  g.rect(12, 1, 7, 3);
  g.fill(c.skin);
  g.rect(21, 1, 7, 3);
  g.fill(c.skin);
  g.rect(12, 4, 8, 5);
  g.fill({ color: 0x000000, alpha: 0.5 });
  g.rect(20, 4, 8, 5);
  g.fill({ color: 0x000000, alpha: 0.5 });
  // eyes narrow (content/relaxed)
  g.rect(13, 6, 6, 1);
  g.fill(c.accessory);
  g.rect(21, 6, 6, 1);
  g.fill(c.accessory);
  // smile curve
  g.rect(14, 11, 2, 1);
  g.fill(c.accessory);
  g.rect(16, 12, 8, 1);
  g.fill(c.accessory);
  g.rect(24, 11, 2, 1);
  g.fill(c.accessory);
  // antenna
  g.rect(18, -9, 4, 9);
  g.fill(c.skin);
  g.rect(14, -14, 12, 6);
  g.fill(c.accessory);

  container.addChild(g);
  container.pivot.set(20, 60);
  return container;
}

// ─── Label ────────────────────────────────────────────────────────────────────

export function createAgentLabel(name: string): Text {
  const label = new Text({ text: name, style: LABEL_STYLE });
  label.anchor.set(0.5, 0);
  return label;
}
