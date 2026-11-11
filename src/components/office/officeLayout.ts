import layout from '../../../office-art/layout.json';
import artLayout from '../../../office-art/layout-ai.json';
import { normalizeHeroName } from './heroRegistry';

export type OfficeTheme = 'art' | 'loft' | 'cyber';
export interface Point { x: number; y: number }
export const OFFICE_LAYOUT = layout;
export const ART_OFFICE_LAYOUT = artLayout;
export const DEFAULT_OFFICE_THEME: OfficeTheme = 'art';
export const OFFICE_THEME_STORAGE_KEY = 'office-theme';
const homes = new Map(Object.entries(layout.heroes).map(([name, pos]) => [normalizeHeroName(name), pos]));
const artHomes = new Map(Object.entries(artLayout.heroes).map(([name, pos]) => [normalizeHeroName(name), pos]));


export function officeFixture(theme: OfficeTheme, name: string) {
  return theme === 'art'
    ? Object.entries(artLayout.fixtures).find(([key]) => normalizeHeroName(key) === normalizeHeroName(name))?.[1]
    : undefined;
}

export function officeHome(theme: OfficeTheme, agent: { name: string; positionX?: number | null; positionY?: number | null }): Point {
  const key = normalizeHeroName(agent.name);
  return (theme === 'art' ? artHomes.get(key) : theme === 'loft' ? homes.get(key) : null)
    || { x: agent.positionX ?? 0, y: agent.positionY ?? 0 };
}

export type RegressionResult = 'green' | 'red' | 'unknown';
export function dcmRegression(agents: ReadonlyArray<{ name: string; statusText?: string | null }>): RegressionResult {
  const text = agents.find(a => normalizeHeroName(a.name) === 'мотя')?.statusText || '';
  const result = text.match(/Последняя регрессия:\s*(?:⚠\s*)?(красная|зел[её]ная)/i)?.[1];
  return !result ? 'unknown' : /красная/i.test(result) ? 'red' : 'green';
}

// Parking is below the counter and outside the main aisle. Each visit reserves a
// distinct place, including meetings, so arriving heroes never share an anchor.
export const KITCHEN_PLACES: readonly Point[] = Array.from({ length: 10 }, (_, i) => ({
  x: layout.destinations.cooler.x - (i % 5) * 36,
  y: layout.destinations.cooler.y + Math.floor(i / 5) * 42,
}));
