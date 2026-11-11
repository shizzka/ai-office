import type { PultEvent, PultLine, PultSnapshot, LinePresentation } from './types';

const defaults: Record<string, [number, string, string]> = {
  code: [45, '30–60', 'Лёха пишет код'], regression: [35, '30–40', 'Идут тесты'],
  critic: [22.5, '5–40', 'Ася — критик — проверяет код'], night: [15, '10–20', 'Ночной Ярик делает ревью'],
};
export function queueActive(line: PultLine): boolean {
  return line.status === 'running' || line.tmux || Object.values(line.processes).some(Boolean);
}
export function canStart(line: PultLine): boolean {
  return !queueActive(line) && !line.completed && line.status !== 'awaiting-start' &&
    !(line.status === 'waiting' && !/пауза/i.test(line.reason));
}

// Compatibility while the architect installs the watcher and UI together.
// An old snapshot has no phase start time: do not mistake idle time for elapsed.
export function linePresentation(line: PultLine): LinePresentation {
  if (line.presentation) return line.presentation;
  const key = /лимит|перегруз/i.test(line.stage) ? 'limit' : /ночн|ярик/i.test(line.stage) ? 'night'
    : /регресси/i.test(line.stage) ? 'regression' : /критик/i.test(line.stage) ? 'critic' : 'code';
  const [minutes, label, phrase] = defaults[key] || defaults.code;
  const level = line.status === 'stopped' ? 'intervention' : line.status === 'waiting' && key !== 'limit' ? 'decision' : 'none';
  const attention = { level, reason: line.reason, action: level === 'intervention' ? 'Попросите архитектора проверить журнал и возобновить круг.' : '',
    text: level === 'intervention' ? `Встало — нужно вмешательство: ${line.reason}. Что делать: попросите архитектора проверить журнал.`
      : level === 'decision' ? `Нужно ваше решение: ${line.reason}` : 'Ничего делать не нужно' } as LinePresentation['attention'];
  return {
    doing: line.status === 'awaiting-start' ? line.reason : line.status === 'stopped' ? `Работа круга ${line.circle || ''} остановилась`
      : key === 'limit' ? 'Ждём лимит/перегрузку модели, работа сохранена'
      : level === 'decision' ? `Ждём решения: ${line.reason}` : `${phrase} круга ${line.circle || '—'} (обычно ${label} мин; время начала неизвестно)`,
    attention, timing: { key, expectedMinutes: minutes, typicalLabel: label, source: 'default', samples: 0, startedAt: null, elapsedMinutes: null },
    showSilence: line.status === 'running' && key !== 'limit' && line.idleSeconds > minutes * 120,
    expectedAt: null, queueActive: queueActive(line),
  };
}

export function nextForYou(snapshot: PultSnapshot): string {
  const lines = snapshot.lines.map(line => ({ line, view: linePresentation(line) }));
  const intervention = lines.filter(({ view }) => view.attention.level === 'intervention');
  const decisions = lines.filter(({ view }) => view.attention.level === 'decision');
  if (intervention.length || decisions.length) return [...intervention, ...decisions]
    .map(({ line, view }) => `${line.name}: ${view.attention.text}${view.attention.level === 'decision' && view.attention.action ? `. ${view.attention.action}` : ''}`).join(' ');
  const eta = lines.map(({ view }) => view.expectedAt).filter((at): at is number => !!at && at > snapshot.updatedAt).sort((a, b) => a - b)[0];
  return 'Сейчас вмешательство не нужно.' + (eta ? ` Ближайшее событие примерно в ${new Date(eta * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}. Это оценка по длительности стадии.`
    : ' Следим за очередями; точное время ближайшего события пока неизвестно.');
}

export function groupEvents(events: PultEvent[]): (PultEvent & { entries: PultEvent[] })[] {
  const groups: (PultEvent & { entries: PultEvent[] })[] = [];
  for (const event of events.slice(0, 30)) {
    const last = groups.at(-1);
    const kind = event.eventType && event.eventType !== 'unknown' ? event.eventType : event.humanText || event.text;
    const lastKind = last?.eventType && last.eventType !== 'unknown' ? last.eventType : last?.humanText || last?.text;
    if (last && last.line === event.line && last.code === event.code && kind === lastKind) last.entries.push(event);
    else groups.push({ ...event, entries: [event] });
  }
  return groups;
}
