export const DELIVERY_COOLDOWN = 600_000;
export const EGG_TOAST = 'Главный тестировщик этого офиса ❤️ · 20 лет в одной команде';
export interface MomentsSignal { bugs: string | number; total: number; latestCount: number }
export interface DeliveryQueue { seenTotal: number | null; pending: number; lastStarted: number }
export const createDeliveryQueue = (): DeliveryQueue => ({ seenTotal: null, pending: 0, lastStarted: -DELIVERY_COOLDOWN });
/** Cumulative bridge totals preserve all events between polls. First observation is a baseline. */
export function ingestDeliveries(queue: DeliveryQueue, total: number) {
  if (!Number.isSafeInteger(total) || total < 0) return;
  if (queue.seenTotal !== null && total < queue.seenTotal) return;
  if (queue.seenTotal !== null) queue.pending += Math.max(0, total - queue.seenTotal);
  queue.seenTotal = total;
}
export function takeDelivery(queue: DeliveryQueue, now: number, busy: boolean): number {
  if (busy || !queue.pending || now - queue.lastStarted < DELIVERY_COOLDOWN) return 0;
  const count = queue.pending;
  queue.pending = 0; queue.lastStarted = now;
  return count;
}
export function registerTap(taps: number[], now: number): boolean {
  const recent = taps.filter(t => now - t <= 3000 && now >= t);
  taps.splice(0, taps.length, ...recent, now);
  if (taps.length < 5) return false;
  taps.length = 0;
  return true;
}
export const nextCatVisit = (now: number, random = Math.random) => now + 240 + random() * 240;
