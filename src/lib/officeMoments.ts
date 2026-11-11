import type { MomentsSignal } from '../components/office/officeMoments';

export function publicMoments(value: unknown): MomentsSignal {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const count = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0 ? Number(n) : 0;
  return {
    bugs: typeof data.bugs === 'string' || typeof data.bugs === 'number' && Number.isFinite(data.bugs) ? data.bugs : 'вагон 🚃',
    total: count(data.total), latestCount: count(data.latestCount),
  };
}
