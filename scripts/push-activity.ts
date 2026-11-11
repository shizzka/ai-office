import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL || "./data/database.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Activity templates per role
const ACTIVITIES: Record<string, { action: string; messages: string[] }[]> = {
  "Тимлид": [
    { action: "status_changed", messages: ["Планирую задачи на спринт", "Провожу стендап", "Расставляю приоритеты"] },
    { action: "review", messages: ["Ревьюю PR кодера", "Проверяю архитектуру", "Даю фидбек по коду"] },
    { action: "sync", messages: ["Синхронизируюсь с командой", "Обновляю роадмап", "Провожу 1-on-1"] },
  ],
  "Техлид": [
    { action: "status_changed", messages: ["Разблокирую кодера", "Принимаю архитектурное решение", "Ревьюю PR"] },
    { action: "review", messages: ["Проверяю код на code smell", "Оцениваю техдолг", "Согласую архитектуру"] },
    { action: "planning", messages: ["Декомпозирую задачу", "Оцениваю сложность", "Пишу тех-спек"] },
  ],
  "Разработчик": [
    { action: "status_changed", messages: ["Пишу новый модуль", "Фикшу баг", "Рефакторю код", "Деплою на стейджинг"] },
    { action: "commit", messages: ["Закоммитил фичу", "Открыл PR", "Разрешил конфликты"] },
    { action: "debug", messages: ["Дебажу проблему с API", "Исследую ошибку", "Пишу unit-тесты"] },
  ],
  "QA-инженер": [
    { action: "status_changed", messages: ["Пишу автотесты", "Проверяю новую фичу", "Гоняю регрессию"] },
    { action: "test_run", messages: ["Запустил тест-сьют", "Все тесты прошли ✅", "Нашёл баг, создаю тикет"] },
    { action: "review", messages: ["Проверяю PR перед мержем", "Тестирую edge cases", "Верифицирую фикс"] },
  ],
  "Координатор": [
    { action: "status_changed", messages: ["Обновляю статусы задач", "Готовлю отчёт", "Планирую следующую неделю"] },
    { action: "sync", messages: ["Синхронизируюсь с заказчиком", "Обновляю доску задач", "Провожу ретро"] },
  ],
  "Дизайнер": [
    { action: "status_changed", messages: ["Рисую макет", "Делаю иконки", "Готовлю баннер"] },
    { action: "design", messages: ["Обновил UI-кит", "Согласовал дизайн", "Экспортирую ассеты"] },
  ],
  "Копирайтер": [
    { action: "status_changed", messages: ["Пишу статью", "Редактирую текст", "Готовлю посты"] },
    { action: "publish", messages: ["Опубликовал статью", "Загрузил контент", "Написал заголовки"] },
  ],
  "Маркетолог": [
    { action: "status_changed", messages: ["Анализирую метрики", "Запускаю кампанию", "Изучаю конкурентов"] },
    { action: "analytics", messages: ["Отчёт по трафику готов", "Обновил UTM-метки", "Тестирую гипотезу"] },
  ],
  "Продюсер": [
    { action: "status_changed", messages: ["Монтирую видео", "Записываю подкаст", "Планирую контент"] },
    { action: "publish", messages: ["Выложил видео", "Опубликовал подкаст", "Обновил контент-план"] },
  ],
};

const FALLBACK: { action: string; messages: string[] }[] = [
  { action: "status_changed", messages: ["Работаю над задачей", "Разбираюсь с вопросом", "Завершаю работу"] },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pushActivity() {
  const agents = db.prepare(
    "SELECT id, role, current_status FROM agents WHERE archived = 0 AND current_status != 'offline'"
  ).all() as { id: string; role: string; current_status: string }[];

  if (agents.length === 0) {
    console.log("[push-activity] No active agents");
    return;
  }

  // Pick 1-3 random agents to generate activity for
  const shuffled = agents.sort(() => Math.random() - 0.5);
  const count = Math.min(shuffled.length, Math.floor(Math.random() * 3) + 1);
  const selected = shuffled.slice(0, count);

  for (const agent of selected) {
    // Skip idle agents most of the time
    if (agent.current_status === "idle" && Math.random() > 0.3) continue;

    const templates = ACTIVITIES[agent.role] ?? FALLBACK;
    const template = pick(templates);
    const message = pick(template.messages);

    const id = uuidv4();
    db.prepare(
      "INSERT INTO activity_logs (id, entity_type, entity_id, action, details) VALUES (?, 'agent', ?, ?, ?)"
    ).run(id, agent.id, template.action, JSON.stringify({ message, status: agent.current_status }));

    console.log(`[push-activity] ${agent.id} → ${template.action}: ${message}`);
  }
}

// Run once
pushActivity();
