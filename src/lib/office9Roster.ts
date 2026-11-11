import { db } from './db';
import { agents, agentStatusHistory } from './db/schema';
import { eq } from 'drizzle-orm';
import { latestOwnerInput, ownerStatus } from './ownerActivity';
import artLayout from '../../office-art/layout-ai.json';

export const OFFICE9_AGENTS = [
  { id: 'office-owner', name: 'Евгений', emoji: '🧔', role: 'ГИП · владелец', positionX: artLayout.heroes['Евгений'].x, positionY: artLayout.heroes['Евгений'].y },
  { id: 'office-marina', name: 'Марина', emoji: '👩‍🔬', role: 'QA · ручное тестирование', positionX: artLayout.heroes['Марина'].x, positionY: artLayout.heroes['Марина'].y },
  { id: 'office-korzhik', name: 'Коржик', emoji: '🐈', role: 'Отдел критического тестирования', positionX: 570, positionY: 393 },
  { id: 'office-masyanya', name: 'Масяня', emoji: '🐈', role: 'Отдел критического тестирования', positionX: 641, positionY: 393 },
];
let seeded = false;
export async function refreshOffice9Roster() {
  if (!seeded) {
    for (const hero of OFFICE9_AGENTS) {
      const insert = db.insert(agents).values({ ...hero, currentStatus: 'idle', archived: false });
      // Synchronize both shared-desk homes on existing installations.
      // Keep their roles, statuses and other roster data.
      if (hero.id === 'office-marina' || hero.id === 'office-owner') insert.onConflictDoUpdate({
        target: agents.id, set: { positionX: hero.positionX, positionY: hero.positionY },
      }).run();
      else insert.onConflictDoNothing().run();
    }
    seeded = true;
  }
  const status = ownerStatus(await latestOwnerInput());
  const owner = db.select().from(agents).where(eq(agents.id, 'office-owner')).get();
  if (owner?.currentStatus !== status.currentStatus) {
    db.update(agents).set({ currentStatus: status.currentStatus }).where(eq(agents.id, 'office-owner')).run();
    db.insert(agentStatusHistory).values({ id: crypto.randomUUID(), agentId: 'office-owner', status: status.currentStatus, statusText: status.statusText }).run();
  }
  return status;
}
