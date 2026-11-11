import { normalizeHeroName } from './heroRegistry';

export type QuotaProvider = 'codex' | 'claude';
export interface QuotaWindow { usedPercent: number; resetsAt: number }
export interface ProviderQuota { windows: QuotaWindow[]; error: { blocked: true; resetsAt: number | null } | null }
export type QuotaSignal = Record<QuotaProvider, ProviderQuota>;
export interface ProviderHoliday { exhausted: boolean; resetsAt: number | null; warning: boolean; usedPercent: number }
export interface OfficeHoliday { codex: ProviderHoliday; claude: ProviderHoliday; all: boolean; returnsAt: number | null }
export const EMPTY_QUOTAS: QuotaSignal = { codex: { windows: [], error: null }, claude: { windows: [], error: null } };
export const HOLIDAY_COLOR = 0x93afc2;

/** Both server and client take an allowlisted, numeric projection only. Epochs are seconds. */
export function publicQuotas(value: unknown): QuotaSignal {
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' ? v as Record<string, unknown> : {};
  const epoch = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 32503680000 ? v : null;
  const root = object(value);
  const provider = (key: QuotaProvider): ProviderQuota => {
    const data = object(root[key]), error = object(data.error);
    const windows = Array.isArray(data.windows) ? data.windows.slice(0, 2).flatMap(w => {
      const row = object(w), resetsAt = epoch(row.resetsAt);
      return typeof row.usedPercent === 'number' && Number.isFinite(row.usedPercent) && row.usedPercent >= 0 && resetsAt
        ? [{ usedPercent: row.usedPercent, resetsAt }] : [];
    }) : [];
    return { windows, error: error.blocked === true ? { blocked: true, resetsAt: epoch(error.resetsAt) } : null };
  };
  return { codex: provider('codex'), claude: provider('claude') };
}

export function officeHoliday(signal: QuotaSignal, now: number): OfficeHoliday {
  const state = (quota: ProviderQuota): ProviderHoliday => {
    const active = quota.windows.filter(w => w.resetsAt > now);
    const blocked = active.filter(w => w.usedPercent >= 100);
    const error = quota.error && (quota.error.resetsAt === null || quota.error.resetsAt > now) ? quota.error : null;
    const exhausted = blocked.length > 0 || !!error;
    const usedPercent = Math.max(0, ...active.map(w => w.usedPercent));
    const warningWindows = active.filter(w => w.usedPercent >= 90);
    const times = [...blocked, ...(error?.resetsAt ? [{ resetsAt: error.resetsAt }] : [])].map(w => w.resetsAt);
    return { exhausted, usedPercent, warning: !exhausted && usedPercent >= 90,
      resetsAt: exhausted ? error && error.resetsAt === null ? null : Math.max(...times)
        : warningWindows.sort((a, b) => b.usedPercent - a.usedPercent)[0]?.resetsAt ?? null };
  };
  const codex = state(signal.codex), claude = state(signal.claude);
  const times = [codex.resetsAt, claude.resetsAt].filter((n): n is number => n !== null);
  return { codex, claude, all: codex.exhausted && claude.exhausted, returnsAt: times.length ? Math.min(...times) : null };
}

export function demoQuotas(mode: string | null, now: number): QuotaSignal | null {
  if (!['all', 'codex', 'claude'].includes(mode || '')) return null;
  const quota = (provider: string): ProviderQuota => mode === 'all' || mode === provider
    ? { windows: [], error: { blocked: true, resetsAt: now + (provider === 'codex' ? 3 * 86400 + 4 * 3600 : 2 * 86400 + 5 * 3600) } }
    : { windows: [], error: null };
  return { codex: quota('codex'), claude: quota('claude') };
}

export function heroProvider(name: string): QuotaProvider | null {
  const key = normalizeHeroName(name);
  if (['леха', 'ася', 'иваныч', 'тая', 'саня', 'whoami'].includes(key)) return 'codex';
  return key === 'ярик' ? 'claude' : null;
}
export function heroHoliday(name: string, holiday: OfficeHoliday): ProviderHoliday | null {
  const provider = heroProvider(name);
  return provider && holiday[provider].exhausted ? holiday[provider] : null;
}
/** Shared policy used by the simulation, meetings, routes, and UI tests. */
export function holidaySceneMode(name: string, holiday: OfficeHoliday): 'away' | 'quiet' | 'normal' {
  if (heroHoliday(name, holiday)) return 'away';
  if (holiday.all) {
    const key = normalizeHeroName(name);
    if (key === 'мотя') return 'quiet';
    return ['евгений', 'марина', 'коржик', 'масяня', 'jh'].includes(key) ? 'normal' : 'away';
  }
  return 'normal';
}
export function formatReset(epoch: number): string {
  const date = new Date(epoch * 1000);
  const parts = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value || '';
  return `${part('weekday')} ${part('day')}.${part('month')} ${part('hour')}:${part('minute')}`;
}
export const holidayLabel = (state: ProviderHoliday) => state.resetsAt ? `на выходном до ${formatReset(state.resetsAt)}` : 'на выходном · ждём сброса';
export function holidayCountdown(reset: number, now: number): string {
  const minutes = Math.max(0, Math.ceil((reset - now) / 60));
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60);
  return days ? `ещё ${days} дн ${hours} ч` : hours ? `ещё ${hours} ч ${minutes % 60} мин` : `ещё ${minutes} мин`;
}
export function quotaWarning(holiday: OfficeHoliday): string | null {
  return holiday.codex.warning ? `лимит Codex ${Math.floor(holiday.codex.usedPercent)} % · сброс ${formatReset(holiday.codex.resetsAt!)}` : null;
}
