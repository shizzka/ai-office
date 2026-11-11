import type { Agent } from '@/lib/utils/types';
import { normalizeHeroName } from './heroRegistry';
import { heroStatusColor } from './officeAnnotations';

export const JH_BOARD_ID = 'office-jh-board';
export const isJhAgent = (name: string) => ['шарик', 'люда'].includes(normalizeHeroName(name));
/** The original agents remain the source of truth; this is a presentation only. */
export function jhBoard(agents: readonly Agent[]): Agent | null {
  const sources = agents.filter(a => isJhAgent(a.name));
  if (!sources.length) return null;
  const severity = (a: Agent) => /(?:rc=[1-9]\d*|ошибок этапов [1-9]\d*)/.test(a.statusText || '') || heroStatusColor(a.currentStatus || 'idle', a.statusText || '') === 0xef4444 ? 4
    : a.currentStatus === 'offline' ? 3 : ['working','thinking','busy'].includes(a.currentStatus || '') ? 2 : 1;
  const worst = [...sources].sort((a,b) => severity(b)-severity(a))[0];
  const bot = sources.find(a => normalizeHeroName(a.name) === 'шарик');
  const ops = sources.find(a => normalizeHeroName(a.name) === 'люда');
  const summary = (a: Agent | undefined) => !a ? 'нет данных' :
    `${severity(a) === 4 ? 'ошибка' : a.currentStatus === 'offline' ? 'не в сети' : ['working','thinking','busy'].includes(a.currentStatus || '') ? normalizeHeroName(a.name) === 'шарик' ? 'ищет' : 'работает' : 'живой'} · ${a.statusText || 'Нет активного задания'}`;
  return { ...worst, id: JH_BOARD_ID, name: 'JH', emoji: '📋', role: 'Поиск вакансий и эксплуатация',
    statusText: `${severity(worst) === 4 ? 'Ошибка!\n' : ''}Бот поиска: ${summary(bot)}\nЭксплуатация jh-ops: ${summary(ops)}` };
}
export function sceneAgents(agents: readonly Agent[]): Agent[] {
  const board = jhBoard(agents);
  return [...agents.filter(a => !isJhAgent(a.name)), ...(board ? [board] : [])];
}
export function panelAgent(agent: Agent): Agent {
  const key = normalizeHeroName(agent.name);
  return key === 'шарик' ? { ...agent, name: 'JH · бот', emoji: '📋' }
    : key === 'люда' ? { ...agent, name: 'JH · эксплуатация', emoji: '🛠️' } : agent;
}
