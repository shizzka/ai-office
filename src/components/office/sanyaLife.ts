import type { OfficeDcmSignal } from '../../lib/officeDcm';

export const SANYA_VICTORY_SECONDS = 3;
export const BUG_ALERT_SECONDS = 10;
export interface SanyaAlert { seen: string | null; until: number }
/** A timestamp identifies one regression; polling must never restart its bubble. */
export function advanceSanyaAlert(alert: SanyaAlert, signal: OfficeDcmSignal | null, now: number) {
  const regression = signal?.regression;
  if (regression?.timestamp && regression.timestamp !== alert.seen) {
    alert.seen = regression.timestamp;
    if (regression.status === 'fail' && regression.fresh) alert.until = now + BUG_ALERT_SECONDS;
    else alert.until = 0;
  }
  return now < alert.until;
}
export function sanyaVictoryToast(signal: OfficeDcmSignal | null) {
  return signal?.regression.status === 'pass' ? 'Все тесты зелёные! ✅'
    : signal?.regression.status === 'fail' ? 'Нашёл! 🐞 Регрессия красная'
    : 'Результат регрессии пока неизвестен';
}
export function sanyaBugTooltip(signal: OfficeDcmSignal | null) {
  return signal?.bugCount == null ? 'Баги пока не посчитаны'
    : `Поймано багов: ${signal.bugCount}${signal.bugTitle ? '\n'+signal.bugTitle : ''}`;
}
