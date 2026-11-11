"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PultAction, PultLineId, PultSnapshot } from "@/lib/pult/types";
import { executePultAction, startBlockReason } from "@/lib/pult/actions";
import { canStart, queueActive, linePresentation, nextForYou, groupEvents } from "@/lib/pult/presentation";
import styles from "./pult.module.css";

type Command = { line: PultLineId; action: PultAction; circle?: string; label: string };
type Session = { authenticated: boolean; csrf: string };
const lineName = { shield: "Щит", smeta: "Смета" };
const queueStatus = { queued: "В очереди", running: "В работе", review: "Ревью", stopped: "Остановлен", done: "Готово" };
function duration(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return minutes < 1 ? "менее минуты" : minutes < 60 ? `${minutes} мин` : `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}
function time(seconds: number) { return new Date(seconds * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
function apiBase() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return `${path}/api`;
}

export default function PultPage() {
  const [snapshot, setSnapshot] = useState<PultSnapshot | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [command, setCommand] = useState<Command | null>(null);
  const [officeHref, setOfficeHref] = useState("./office/stream?stream=1");
  const dialog = useRef<HTMLDialogElement>(null);
  const refreshing = useRef(false);
  const telegramAttempted = useRef(false);

  const rememberSession = useCallback((value: Session | null) => { sessionRef.current = value; setSession(value); }, []);
  const expired = useCallback(() => {
    rememberSession(null); setSnapshot(null); setCommand(null); setLoginOpen(true);
    setNotice(""); setError("Сессия завершена. Войдите снова, чтобы получить данные.");
  }, [rememberSession]);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const response = await fetch(`${apiBase()}/session`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("session");
      const nextSession: Session = await response.json();
      if (sessionRef.current?.authenticated && !nextSession.authenticated) {
        expired(); rememberSession({ ...nextSession, authenticated: false }); setOffline(false); return;
      }
      rememberSession(nextSession);
      const status = await fetch(`${apiBase()}/status`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(12000) });
      if (status.status === 401) { setSnapshot(null); rememberSession({ ...nextSession, authenticated: false }); setLoginOpen(true); setOffline(false); return; }
      if (!status.ok) throw new Error("status");
      setSnapshot(await status.json()); setOffline(false); setError("");
    } catch {
      setOffline(true); setError("Нет связи с пультом. Проверяем снова каждые 15 секунд.");
    } finally { setLoading(false); refreshing.current = false; }
  }, [expired, rememberSession]);

  useEffect(() => { setOfficeHref(`${window.location.pathname.replace(/\/+$/, "")}/office/stream?stream=1`); void refresh(); const timer = setInterval(() => void refresh(), 15000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => {
    const element = dialog.current;
    if (command && element && !element.open) element.showModal();
    if (!command && element?.open) element.close();
  }, [command]);

  async function post(path: string, payload: unknown) {
    const current = sessionRef.current;
    if (!current?.csrf) throw new Error("Обновите страницу и попробуйте снова.");
    const response = await fetch(`${apiBase()}/${path}`, {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "x-csrf-token": current.csrf },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
    });
    if (response.status === 401) {
      if (current.authenticated) { expired(); void refresh(); }
      throw new Error("Вход не подтверждён. Проверьте код или войдите снова.");
    }
    if (!response.ok) throw new Error(response.status === 429 ? "Слишком много попыток. Повторите позже." : response.status === 403 ? "Доступ отклонён. Обновите страницу и войдите снова." : "Запрос не выполнен. Проверьте состояние перед повтором.");
    return response.json();
  }
  async function authenticate(path: string, payload: unknown) {
    setBusy(true); setError("");
    try {
      await post(path, payload);
      // The cookie is authoritative; fetch the new CSRF token after login.
      await refresh();
      if (!sessionRef.current?.authenticated) throw new Error("Не удалось подтвердить сессию. Обновите страницу и повторите вход.");
      setLoginOpen(false); setCode(""); setCodeSent(false); setNotice("Вход выполнен. Управление доступно.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  function telegramLogin() {
    const telegram = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp;
    if (!telegram?.initData || !sessionRef.current?.csrf || sessionRef.current.authenticated || telegramAttempted.current) return;
    telegramAttempted.current = true;
    void authenticate("auth/telegram", { initData: telegram.initData });
  }
  useEffect(() => { if (session?.csrf) telegramLogin(); }, [session?.csrf]); // SDK and session may arrive in either order.

  async function requestCode() {
    setBusy(true); setError("");
    try { await post("auth/code/request", {}); setCodeSent(true); setNotice("Код отправлен в Telegram владельца. Он действует 5 минут."); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await post("logout", {}); rememberSession(null); setCommand(null); setSnapshot(null); setNotice("Вы вышли. Режим просмотра."); await refresh(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function execute() {
    if (!command || !session?.authenticated || offline) return;
    setBusy(true); setError("");
    try { const result = await executePultAction(command, snapshot?.lines.find(line => line.id === command.line), post); setNotice(result.message); setCommand(null); await refresh(); }
    catch (cause) { setError((cause as Error).message); setCommand(null); }
    finally { setBusy(false); }
  }
  const canAct = !!session?.authenticated && !offline;
  const actionButton = (value: Command, secondary = true) => <button key={`${value.line}-${value.action}-${value.circle || ""}`} type="button" className={secondary ? styles.secondary : styles.primary} disabled={busy || offline} onClick={() => { const reason = startBlockReason(value.action, snapshot?.lines.find(line => line.id === value.line)); setError(""); if (reason) { setNotice(reason); return; } setNotice(""); setCommand(value); }}>{value.label}</button>;

  return <main className={styles.page}>
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={telegramLogin} />
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>DCM LAB / УПРАВЛЕНИЕ</p><h1>Пульт<span className={styles.titleDot} /></h1><p className={styles.subtitle}>Щит и Смета · состояние очередей</p></div>
      <a className={styles.officeLink} href={officeHref} target="_blank" rel="noopener noreferrer">Пиксельный офис <span aria-hidden="true">↗</span><span className={styles.srOnly}> — в новой вкладке</span></a>
    </header>
    <section className={styles.toolbar} aria-label="Состояние подключения и доступа">
      <div className={styles.connection}><span className={`${styles.dot} ${offline ? styles.red : loading ? styles.yellow : styles.green}`} /><span>{offline ? "Нет связи" : loading ? "Подключение…" : "На связи"}{snapshot && <small>Обновлено {time(snapshot.updatedAt)} · каждые 15 с</small>}</span></div>
      <div className={styles.access}><span>{session?.authenticated ? "Управление открыто" : "Только просмотр"}</span><button className={styles.secondary} disabled={busy || loading} onClick={() => session?.authenticated ? void logout() : setLoginOpen(!loginOpen)}>{session?.authenticated ? "Выйти" : loginOpen ? "Скрыть вход" : "Войти"}</button></div>
    </section>
    <div aria-live="polite" aria-atomic="true">{error && <p role="alert" className={styles.error}>{error}{offline && snapshot && " Ниже — последние полученные данные; управление временно недоступно."}</p>}{notice && <p className={styles.notice}>{notice}</p>}</div>
    {loginOpen && !session?.authenticated && <section className={styles.login} aria-labelledby="login-title"><div><p className={styles.eyebrow}>ДОСТУП ВЛАДЕЛЬЦА</p><h2 id="login-title">Вход через Telegram</h2><p>Запросите одноразовый код у бота, затем введите его здесь. Доступ к управлению появится после проверки.</p></div><div className={styles.loginControls}><button type="button" className={styles.secondary} disabled={busy || !session?.csrf} onClick={() => void requestCode()}>{codeSent ? "Отправить код ещё раз" : "Получить код в Telegram"}</button><form onSubmit={event => { event.preventDefault(); void authenticate("auth/code", { code }); }}><label htmlFor="pult-code">Код из Telegram</label><div className={styles.codeRow}><input id="pult-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} required /><button className={styles.primary} disabled={busy || code.length !== 6 || !session?.csrf}>{busy ? "Проверка…" : "Войти"}</button></div></form></div></section>}
    {!snapshot && <section className={styles.empty}><span className={styles.emptyIcon} aria-hidden="true">◈</span><h2>{loading ? "Получаем состояние линий" : offline ? "Данные временно недоступны" : "Ваши очереди — за одним входом"}</h2><p>{loading ? "Подключаемся к мосту DCM Lab…" : offline ? "Автоматическое обновление продолжится. Можно повторить сейчас." : "Для удалённого просмотра войдите через Telegram владельца."}</p>{offline && <button className={styles.secondary} onClick={() => void refresh()}>Обновить сейчас</button>}</section>}
    {snapshot && <>
      <section className={styles.nextStep} aria-labelledby="next-title"><h2 id="next-title">Следующее для вас</h2><p>{nextForYou(snapshot)}</p></section>
      <div className={styles.sectionHeading}><h2>Состояние линий</h2><span>01 / ОПЕРАЦИИ</span></div>
      <div className={styles.lines}>{snapshot.lines.map(line => {
        const view = linePresentation(line);
        const color = view.attention.level === "intervention" ? styles.stopped : view.attention.level === "decision" ? styles.waiting : styles.running;
        return <section key={line.id} className={styles.lineCard} aria-labelledby={`line-${line.id}`}>
          <div className={styles.lineTop}><h3 id={`line-${line.id}`}>{lineName[line.id]}</h3></div>
          <p className={styles.doing}>{view.doing}</p>
          <p className={`${styles.badge} ${styles.attention} ${color}`}><span className={styles.dot} />{view.attention.text}</p>
          {view.showSilence && <p className={styles.idle}>Без событий <strong>{duration(line.idleSeconds)}</strong> — дольше двойной нормы стадии</p>}
          <details className={styles.details}><summary>Подробности</summary><p>{line.circle || "Нет активного круга"} · {line.stage}</p>
            {line.reason && <p>{line.reason}</p>}
            <p>Оценка времени: {view.timing.source === "journal" ? `медиана по журналу (${view.timing.samples} стадий)` : "типовая, данных журнала пока мало"}.</p>
            <div className={styles.signals}><span>Сессия <b>{line.tmux ? "есть" : "нет"}</b></span><span>Codex <b>{line.processes.codex ? "работает" : "не активен"}</b></span><span>Воркер <b>{line.processes.worker ? "работает" : "не активен"}</b></span></div>
          </details>
          {queueActive(line) && <p className={styles.queueRunning}>Очередь идёт{line.pauseRequested ? " · пауза после текущего круга запрошена" : ""}</p>}
          {canAct && <div className={styles.actions}>{canStart(line) && actionButton({ line: line.id, action: "start", label: "Запустить очередь" }, false)}
            {queueActive(line) && !line.pauseRequested && <div>{actionButton({ line: line.id, action: "pause", label: "Пауза" })}<p className={styles.hint}>Остановит очередь после текущего круга, ничего не прервёт</p></div>}</div>}
        </section>;
      })}</div>
      <section className={styles.review}><div><h2>Ждёт вашего ревью</h2><p className={styles.reviewHelp}>Эти круги архитектор разбирает вместе, одной стопкой. Нажимать здесь ничего не нужно, если отдельно не сказано иначе. «Продолжить после ревью» — только после решения архитектора.</p></div>{snapshot.lines.some(line => line.review.length > 0) ? snapshot.lines.flatMap(line => line.review.map(circle => <div className={styles.reviewRow} key={`${line.id}-${circle}`}><div><strong>{circle}</strong><p>{lineName[line.id]} · в стопке для архитектора</p></div>{canAct && !queueActive(line) && line.circle === circle && line.queue.some(item => item.code === circle && item.type === "pause" && item.status === "review") && actionButton({ line: line.id, action: "approve", circle, label: "Продолжить после ревью" }, false)}</div>)) : <p className={styles.muted}>Сейчас нет кругов, ожидающих вашего решения.</p>}</section>
      <div className={styles.contentGrid}><div>
        <section className={styles.panel}><div className={styles.sectionHeading}><h2>Очереди</h2><span>ПОЛНЫЙ ORDER</span></div>{snapshot.lines.map(line => <div className={styles.queueGroup} key={line.id}><h3>{lineName[line.id]} <span className={styles.count}>{line.queue.length}</span></h3>{line.queue.length === 0 && <p className={styles.muted}>Очередь пуста.</p>}<ol className={styles.queue}>{line.queue.map((item, index) => <li key={`${item.code}-${index}`}><span className={styles.index}>{String(index + 1).padStart(2, "0")}</span><div className={styles.queueBody}><div className={styles.queueTitle}><strong>{item.code}</strong><span className={`${styles.queueBadge} ${styles[item.status]}`}>{queueStatus[item.status]}</span></div><p>{[item.block, item.type, item.state].filter(Boolean).join(" · ") || "Состояние не указано"}</p>{canAct && item.type === "dev" && item.status === "stopped" && line.circle === item.code && line.status === "stopped" && !queueActive(line) && actionButton({ line: line.id, action: "retry", circle: item.code, label: "Повторить регрессию" })}</div></li>)}</ol></div>)}</section>
        <section className={styles.panel}><div className={styles.sectionHeading}><h2>Последние события</h2><span>{Math.min(30, snapshot.events.length)} / 30</span></div>{snapshot.events.length === 0 ? <p className={styles.muted}>Событий пока нет.</p> : <ol className={styles.events}>{groupEvents(snapshot.events).map(event => <li key={event.id}><div>
          <p className={styles.eventMeta}>{lineName[event.line as PultLineId] || "DCM"}</p>
          <p><time dateTime={new Date(event.at * 1000).toISOString()}>{time(event.at)}</time> · {event.humanText || event.text}{event.entries.length > 1 && ` (×${event.entries.length}, с ${time(event.entries.at(-1)!.at)})`}</p>
          <details className={styles.details}><summary>Исходная строка{event.entries.length > 1 ? ` (${event.entries.length})` : ""}</summary>{event.entries.map(entry => <p className={styles.raw} key={entry.id}>{entry.raw || entry.text}</p>)}</details>
        </div></li>)}</ol>}</section>
      </div><aside>
        <section className={styles.panel}><h2>Воркеры</h2><p className={styles.muted}>Доступность рабочих машин</p><div className={styles.workers}>{snapshot.workers.map(worker => <div key={worker.id} className={styles.worker}><div className={styles.workerTitle}><strong>{worker.name}</strong><span className={`${styles.badge} ${worker.available ? styles.running : styles.stopped}`}>{worker.available ? "В сети" : "Недоступен"}</span></div><p>{worker.host}:{worker.port}</p><p className={styles.muted}>Проверка {time(worker.checkedAt)}{worker.downSince ? ` · нет связи ${duration(Math.max(0, snapshot.updatedAt - worker.downSince))}` : ""}</p></div>)}</div>{snapshot.workers.length === 0 && <p className={styles.muted}>Данные о воркерах ещё не получены.</p>}{canAct && actionButton({ line: "shield", action: "check-workers", label: "Проверить связь" })}</section>
        <section className={styles.panel}><h2>Последняя регрессия</h2>{snapshot.lines.map(line => <div className={styles.regression} key={line.id}><p className={styles.eyebrow}>{lineName[line.id]}</p>{line.lastRegression ? <><div className={styles.queueTitle}><strong>{line.lastRegression.code}</strong><span className={`${styles.badge} ${line.lastRegression.result === "green" ? styles.running : line.lastRegression.result === "red" ? styles.stopped : styles.waiting}`}>{line.lastRegression.result === "green" ? "Зелёная" : line.lastRegression.result === "red" ? "Красная" : "Нет результата"}</span></div><p>{line.lastRegression.text}</p></> : <p className={styles.muted}>Результатов пока нет.</p>}</div>)}</section>
      </aside></div>
    </>}
    <footer className={styles.footer}><span>DCM LAB</span><p>Щит · Смета<span aria-hidden="true"> / </span>Пульт очередей</p></footer>
    <dialog ref={dialog} className={styles.dialog} onCancel={event => { if (busy) event.preventDefault(); else setCommand(null); }} onClose={() => setCommand(null)} aria-labelledby="confirm-title" aria-describedby="confirm-description"><p className={styles.eyebrow}>ПОДТВЕРЖДЕНИЕ ДЕЙСТВИЯ</p><h2 id="confirm-title">{command?.label}?</h2><p id="confirm-description">Линия: {command ? lineName[command.line] : ""}{command?.circle ? ` · круг ${command.circle}` : ""}. {command?.action === "pause" ? "Остановит очередь после текущего круга, ничего не прервёт." : "Запрос изменит работу очереди и будет записан в журнал действий."}</p><div className={styles.dialogActions}><button type="button" autoFocus className={styles.secondary} disabled={busy} onClick={() => setCommand(null)}>Отмена</button><button type="button" className={styles.primary} disabled={busy || !canAct} onClick={() => void execute()}>{busy ? "Выполняется…" : "Подтвердить"}</button></div></dialog>
  </main>;
}
