"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ActivityLog, Agent, Project, Task } from "@/lib/utils/types";
import styles from "./page.module.css";

const COLUMNS = [
  { id: "todo", label: "Очередь", mark: "○" },
  { id: "in_progress", label: "В работе", mark: "◐" },
  { id: "review", label: "Ревью", mark: "◈" },
  { id: "done", label: "Готово", mark: "✓" },
];
const STATUS_LABELS: Record<string, string> = {
  working: "Работает", thinking: "Думает", busy: "Занят", idle: "Ожидает", offline: "Не в сети",
};

function time(value: string | null) {
  if (!value) return "—";
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function hasError(task: Task) {
  return task.title.includes("⚠") || task.priority === "urgent";
}

function eventDetails(item: ActivityLog): { message: string; agentId?: string; agentName?: string } {
  try {
    const details = JSON.parse(item.details || "{}");
    return { ...details, message: details.message || details.statusText || details.title || item.action };
  } catch {
    return { message: item.details || item.action };
  }
}

interface Snapshot { tasks: Task[]; projects: Project[]; agents: Agent[]; feed: ActivityLog[] }

export default function BoardPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    async function refresh() {
      if (fetching) return;
      fetching = true;
      try {
        const data = await Promise.all(["tasks", "projects", "agents", "activity/feed"].map(async (path) => {
          const res = await fetch(`/api/${path}`, {
            method: "GET", cache: "no-store", signal: controller.signal,
          });
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        }));
        if (controller.signal.aborted) return;
        setSnapshot({ tasks: data[0].tasks, projects: data[1].projects, agents: data[2].agents, feed: data[3].feed });
        setUpdated(new Date().toISOString());
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        fetching = false;
      }
    }
    void refresh();
    const interval = setInterval(refresh, 10_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, []);

  const projects = (snapshot?.projects || []).filter((p) => !p.archived && ["DCM Lab", "job-hunter", "Офис", "Прочее"].includes(p.name));
  const agents = (snapshot?.agents || []).filter((a) => !a.archived);
  const tasks = (snapshot?.tasks || []).filter((t) => !t.archived && projects.some((p) => p.id === t.projectId));
  const errors = tasks.filter(hasError);

  function card(task: Task) {
    const agent = agents.find((a) => a.id === task.assignedTo);
    const project = projects.find((p) => p.id === task.projectId);
    return (
      <article key={task.id} className={`${styles.card} ${hasError(task) ? styles.errorCard : ""}`}>
        <span className={styles.project}>{project?.name}</span>
        <h3>{task.title}</h3>
        {task.description && <p title={task.description}>{task.description}</p>}
        {task.statusDetail && <p className={styles.technicalStatus} title={task.statusDetail}>{task.statusDetail}</p>}
        <div className={styles.cardMeta}>
          <span>{agent ? `${agent.emoji} ${agent.name}` : task.statusDetail?.includes("Ярик (ночная смена)") ? "Ярик (ночная смена)" : "Без исполнителя"}</span>
          <time title="Время изменения, Москва" dateTime={task.updatedAt || undefined}>{time(task.updatedAt || task.createdAt)}</time>
        </div>
      </article>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>AI OFFICE / LIVE</span><h1>Доска задач</h1><p>DCM Lab · job-hunter · Офис · Прочее</p></div>
        <nav aria-label="Офис"><Link href="/office/stream" prefetch={false}>← Офис</Link><span>Только чтение</span></nav>
      </header>
      <div className={styles.connection} role="status">
        {error ? "⚠ Нет связи. Показаны последние полученные данные; повтор через 10 с." :
          snapshot ? `● Обновлено ${time(updated)} МСК · каждые 10 с` : "Загрузка доски…"}
      </div>
      <div className={styles.layout}>
        <main className={styles.main}>
          {errors.length > 0 && <section className={styles.errors} aria-label="Ошибки">
            <h2>⚠ Требуют внимания <span>{errors.length}</span></h2>
            <div className={styles.errorGrid}>{errors.map(card)}</div>
          </section>}
          <div className={styles.columns}>
            {COLUMNS.map((column) => {
              const items = tasks.filter((task) => (task.status === "in_progress" || task.status === "review" || task.status === "done" ? task.status : "todo") === column.id)
                .sort((a, b) => Number(hasError(b)) - Number(hasError(a)) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
              return <section key={column.id} className={styles.column} aria-label={column.label}>
                <h2><span>{column.mark} {column.label}</span><span>{items.length}</span></h2>
                <div className={styles.cards}>{items.map(card)}{items.length === 0 && <p className={styles.empty}>Задач нет</p>}</div>
              </section>;
            })}
          </div>
        </main>
        <aside className={styles.sidebar}>
          <section className={styles.panel} aria-label="Агенты">
            <h2>Команда <span>{agents.length}</span></h2>
            {agents.map((agent) => <article key={agent.id} className={styles.agent}>
              <div className={styles.agentHeading}><h3>{agent.emoji} {agent.name}</h3><span className={`status-${agent.currentStatus || "idle"}`}>{STATUS_LABELS[agent.currentStatus || "idle"]}</span></div>
              <div className={styles.role}>{agent.role}</div>
              <p>{agent.statusText || "Нет активного задания"}</p>
            </article>)}
          </section>
          <section className={styles.panel} aria-label="Последние события">
            <h2>Последние события</h2>
            {(snapshot?.feed || []).map((item) => {
              const detail = eventDetails(item);
              const agent = agents.find((a) => a.id === (detail.agentId || item.entityId));
              return <article key={item.id} className={styles.event}>
                <div className={styles.cardMeta}><span>{agent ? `${agent.emoji} ${agent.name}` : detail.agentName || "Офис"}</span><time dateTime={item.createdAt || undefined}>{time(item.createdAt)}</time></div>
                <p>{detail.message}</p>
              </article>;
            })}
            {snapshot && snapshot.feed.length === 0 && <p className={styles.empty}>Пока нет событий</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
