/** All current appearances live here. A new hero needs one entry, never an ID mapping. */
export interface HeroDefinition {
  role: string;
  skin: number;
  hair: number;
  hairLight: number;
  shirt: number;
  light: number;
  pants: number;
  accent: number;
  head: "curls" | "headphones" | "ponytail" | "flatcap" | "beret" | "hardhat" | "server" | "security" | "bun" | "dog";
  outfit: "rugby" | "hoodie" | "jacket" | "vest" | "scarf" | "workwear" | "server" | "blouse";
  tool: "blueprint" | "laptop" | "checklist" | "pue" | "art" | "phone" | "worker" | "terminal" | "charts" | "cv";
  glasses?: boolean;
  moustache?: boolean;
  headset?: boolean;
  beard?: boolean;
}

export const HEROES: Readonly<Record<string, HeroDefinition>> = {
  "ярик": { role: "Архитектор", skin: 0xe8b58e, hair: 0x30221f, hairLight: 0x614234, shirt: 0x214b40, light: 0x326452, pants: 0x495b6a, accent: 0x172b49, head: "curls", outfit: "rugby", tool: "blueprint" },
  "лёха": { role: "Разработчик", skin: 0xdca079, hair: 0x41302c, hairLight: 0x755142, shirt: 0x545180, light: 0x7473a0, pants: 0x29384e, accent: 0x7ce3a1, head: "headphones", outfit: "hoodie", tool: "laptop" },
  "ася": { role: "Код-ревью · приёмка QA", skin: 0xf0c4a4, hair: 0x683d2c, hairLight: 0xa06843, shirt: 0x94535d, light: 0xb77579, pants: 0x3f3d55, accent: 0xf16d69, head: "ponytail", outfit: "jacket", tool: "checklist", glasses: true },
  "иваныч": { role: "Нормоконтроль · ГОСТ / ПУЭ / СП", skin: 0xdcb394, hair: 0xa7b0b0, hairLight: 0xe2dfcd, shirt: 0x77784e, light: 0xa4a370, pants: 0x4b5152, accent: 0xe5bd66, head: "flatcap", outfit: "vest", tool: "pue", glasses: true, moustache: true },
  "тая": { role: "Визуал и оформление", skin: 0xeec09c, hair: 0xa14e30, hairLight: 0xdb8652, shirt: 0x306b79, light: 0x5095a0, pants: 0x414967, accent: 0xf2799a, head: "beret", outfit: "scarf", tool: "art" },
  "саня": { role: "Тестировщик", skin: 0xd6a17e, hair: 0x8b673a, hairLight: 0xc29859, shirt: 0x3d7881, light: 0x68a6a7, pants: 0x34434b, accent: 0xf0c45f, head: "hardhat", outfit: "workwear", tool: "phone" },
  "мотя": { role: "Прогонщик на воркере", skin: 0x738d9a, hair: 0x304655, hairLight: 0xb3cbd0, shirt: 0x4c6575, light: 0x839eac, pants: 0x293a48, accent: 0x6ad9d0, head: "server", outfit: "server", tool: "worker" },
  "whoami": { role: "Безопасник", skin: 0xc69678, hair: 0x777d80, hairLight: 0xc5c9c3, shirt: 0x29323e, light: 0x49515e, pants: 0x263342, accent: 0x9ab8b2, head: "security", outfit: "hoodie", tool: "terminal", glasses: true, beard: true },
  "люда": { role: "Диспетчер JH", skin: 0xe9b999, hair: 0x3f2b3f, hairLight: 0x77516c, shirt: 0xa57947, light: 0xc8a06b, pants: 0x45415b, accent: 0x7bd5d5, head: "bun", outfit: "blouse", tool: "charts", headset: true },
  "шарик": { role: "Поиск и отклики (бот job-hunter)", skin: 0xc68d52, hair: 0x66422d, hairLight: 0xe0b77d, shirt: 0x637348, light: 0x8f9b66, pants: 0x885d3c, accent: 0xe5bd66, head: "dog", outfit: "vest", tool: "cv" },
};

/** Explicit archive allowlist: an unknown name must never inherit someone else's body. */
export const LEGACY_AGENT_IDS = new Set([
  "vanya", "tema", "pushkin", "coder", "garik", "stoyanov", "ded",
  "lenochka", "proshka", "gary", "lider", "qa", "tech-reviewer", "hunter",
]);

export const UNKNOWN_HERO: HeroDefinition = {
  role: "Агент", skin: 0xd9ad8b, hair: 0x454047, hairLight: 0x746772,
  shirt: 0x627880, light: 0x8da2a5, pants: 0x384958, accent: 0xbed3cf,
  head: "curls", outfit: "jacket", tool: "checklist",
};

export interface AgentIdentity { id: string; name: string }

export function normalizeHeroName(name: string): string {
  const key = name.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  return ['михалыч', 'mihalych', 'mikhalych'].includes(key) ? 'whoami' : key;
}

const namedHeroes = new Map(Object.entries(HEROES).map(([name, hero]) => [normalizeHeroName(name), hero]));

export function resolveAppearance(agent: AgentIdentity):
  | { kind: "hero"; hero: HeroDefinition; key: string }
  | { kind: "legacy"; id: string }
  | { kind: "unknown"; hero: HeroDefinition; key: string } {
  const key = normalizeHeroName(agent.name);
  const hero = namedHeroes.get(key);
  if (hero) return { kind: "hero", hero, key };
  if (LEGACY_AGENT_IDS.has(agent.id)) return { kind: "legacy", id: agent.id };
  return { kind: "unknown", hero: UNKNOWN_HERO, key };
}
