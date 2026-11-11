import type { PultAction, PultLine } from './types';
import { queueActive } from './presentation';

type Command = { line: PultLine['id']; action: PultAction; circle?: string; label: string };
export interface ActionResult { ok: boolean; outcome?: 'deferred'; message?: string }

export function startBlockReason(action: PultAction, line?: PultLine): string {
  if (action === 'start' && line && queueActive(line)) return 'Очередь уже идёт. Ничего запускать не нужно.';
  if (action === 'start' && line?.completed) return 'Все круги очереди уже пройдены.';
  if (action === 'start' && line?.status === 'waiting' && !/пауза/i.test(line.reason)) return 'Очередь ждёт решения. Разберите стопку с архитектором перед продолжением.';
  return action === 'start' && line?.status === 'awaiting-start'
    ? line.reason || 'Линия ожидает подготовки к запуску.' : '';
}

export async function executePultAction(command: Command, line: PultLine | undefined,
  post: (path: string, body: Record<string, unknown>) => Promise<ActionResult>) {
  const blocked = startBlockReason(command.action, line);
  if (blocked) return { ok: false, outcome: 'deferred', message: blocked };
  const { label, ...payload } = command;
  const result = await post('action', { ...payload, confirmed: true });
  return { ...result, message: result.message || (result.ok
    ? `«${label}»: запрос принят. Проверяем состояние очереди.`
    : 'Запуск очереди отложен. Проверьте подготовку линии.') };
}
