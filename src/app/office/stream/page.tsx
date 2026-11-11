"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuthStore } from "@/stores/authStore";
import { useAgentsStore } from "@/stores/agentsStore";
import { DEFAULT_HERO_RENDERER, HERO_RENDERER_STORAGE_KEY, type HeroRenderer } from "@/components/office/heroAtlas";
import { PixelOffice, type PixelOfficeHandle } from "@/components/office/PixelOffice";
import { DEFAULT_OFFICE_THEME, OFFICE_THEME_STORAGE_KEY, dcmRegression, type OfficeTheme } from "@/components/office/officeLayout";

import { useOfficeHoliday } from '@/components/office/useOfficeHoliday';
import { heroHoliday, holidayLabel, quotaWarning, holidaySceneMode } from '@/components/office/officeHoliday';
import { panelAgent } from '@/components/office/jhBoard';
import { useOfficePresenceStore } from '@/stores/officePresenceStore';
import { normalizeHeroName } from '@/components/office/heroRegistry';

import { OfficeStats } from '@/components/office/OfficeStats';
import { OfficeDirectorPanel } from '@/components/office/OfficeDirectorPanel';
import { EMPTY_DIRECTOR, directorHoliday } from '@/components/office/officeDirector';

interface ActivityItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: string | null;
  createdAt: string | null;
}

export default function StreamPage() {
  const { checkAuth, user } = useAuthStore();
  const { agents, costs, fetchAgents, fetchLiveStatus, fetchCosts } = useAgentsStore();
  const { holiday: liveHoliday, now: holidayNow } = useOfficeHoliday();
  const [director,setDirector]=useState(EMPTY_DIRECTOR);
  const holiday=directorHoliday(liveHoliday,director.holiday);
  const presence=useOfficePresenceStore(s=>s.presence);
  const panelAgents = agents.map(source => {
    const agent = panelAgent(source);
    const away = heroHoliday(agent.name, holiday);
    return { ...agent, onHoliday: !!away, atHome:!away&&presence[normalizeHeroName(agent.name)]==='home', rushing:!away&&presence[normalizeHeroName(agent.name)]==='rushing',
      statusText: away ? holidayLabel(away) : holidaySceneMode(agent.name, holiday) === 'quiet' ? 'Тихий режим' : agent.statusText,
      quotaWarning: normalizeHeroName(agent.name) === 'леха' ? quotaWarning(holiday) : null };
  });
  const catEventTimes = useRef<Record<string, number>>({});
  const [catFeed, setCatFeed] = useState<ActivityItem[]>([]);
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [theme, setTheme] = useState<OfficeTheme>(DEFAULT_OFFICE_THEME);
  const [heroRenderer, setHeroRenderer] = useState<HeroRenderer>(DEFAULT_HERO_RENDERER);
  const [details, setDetails] = useState(false);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const panoramaRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const sceneScale = zoom === "fit" ? fitScale : zoom;
  useEffect(() => {
    const element = panoramaRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setFitScale(Math.min(entry.contentRect.width / 960, entry.contentRect.height / 600));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function changeZoom(next: number | "fit") {
    setZoom(next);
    try { localStorage.setItem("office-zoom", String(next)); } catch {}
  }
  function changeRenderer(next: HeroRenderer) {
    setHeroRenderer(next);
    try { localStorage.setItem(HERO_RENDERER_STORAGE_KEY, next); } catch {}
  }
  useEffect(() => {
    try {
      const savedRenderer = localStorage.getItem(HERO_RENDERER_STORAGE_KEY);
      if (savedRenderer === "art" || savedRenderer === "atlas" || savedRenderer === "graphics") setHeroRenderer(savedRenderer);
      const saved = localStorage.getItem(OFFICE_THEME_STORAGE_KEY);
      if (saved === "art" || saved === "loft" || saved === "cyber") setTheme(saved);
    } catch { /* Storage may be unavailable in a private browser. */ }
  }, []);
  function changeTheme(next: OfficeTheme) {
    setTheme(next);
    try { localStorage.setItem(OFFICE_THEME_STORAGE_KEY, next); } catch {}
  }
  const [tokenCount, setTokenCount] = useState(0);
  const [tokenCost, setTokenCost] = useState(0);
  const [displayTokens, setDisplayTokens] = useState(0);
  const officeRef = useRef<PixelOfficeHandle>(null);

  // Fetch real token stats from API
  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/openclaw/stats");
        if (res.ok) {
          const data = await res.json();
          setTokenCount(data.totalTokens || 0);
          setTokenCost(data.cost || 0);
        }
      } catch {}
    }
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  // Smooth animated counter
  useEffect(() => {
    if (displayTokens === tokenCount) return;
    const diff = tokenCount - displayTokens;
    const step = Math.max(1, Math.ceil(Math.abs(diff) / 20));
    const timer = setTimeout(() => {
      setDisplayTokens(prev => diff > 0 ? Math.min(prev + step, tokenCount) : Math.max(prev - step, tokenCount));
    }, 30);
    return () => clearTimeout(timer);
  }, [tokenCount, displayTokens]);

  useEffect(() => {
    const refreshAgents = () => {
      fetchAgents().then(() => fetchLiveStatus());
    };

    checkAuth();
    refreshAgents();
    fetchCosts();
    fetchFeed();

    const agentsDbInterval = setInterval(fetchAgents, 20000);
    const agentInterval = setInterval(fetchLiveStatus, 7000);
    const feedInterval = setInterval(fetchFeed, 12000);
    const costInterval = setInterval(fetchCosts, 45000);
    return () => {
      clearInterval(agentsDbInterval);
      clearInterval(agentInterval);
      clearInterval(feedInterval);
      clearInterval(costInterval);
    };
  }, [checkAuth, fetchAgents, fetchLiveStatus, fetchCosts]);

  async function fetchFeed() {
    try {
      const res = await fetch("/api/activity/feed");
      if (res.ok) {
        const data = await res.json();
        setFeed(data.feed);
      }
    } catch {}
  }

  const onlineAgents = agents.filter((a) => a.currentStatus !== "offline");

  function getActivityMessage(item: ActivityItem): string {
    try {
      const details = item.details ? JSON.parse(item.details) : {};
      if (details.message) return details.message;
      if (details.statusText) return details.statusText;
      if (details.title) return `${item.action}: ${details.title}`;
      return `${item.entityType} ${item.action}`;
    } catch {
      return `${item.entityType} ${item.action}`;
    }
  }

  function getAgentForActivity(item: ActivityItem) {
    if (item.entityType === "agent") {
      return agents.find((a) => a.id === item.entityId);
    }
    return null;
  }

  const STATUS_COLORS: Record<string, string> = {
    working: "text-green-400",
    thinking: "text-yellow-400",
    busy: "text-orange-400",
    idle: "text-gray-500",
    offline: "text-gray-700",
  };

  return (
    <div className="h-screen flex flex-col bg-[#0a0a12]">
      {/* Header */}
      <header className="min-h-11 bg-[#0f0f0f] border-b border-[#2a2a2a] flex flex-wrap items-center justify-between gap-2 px-3 py-2 md:px-6 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg">📁</span>
          <h1 className="text-sm md:text-base font-bold tracking-wider text-white">AI Office <span className="text-[#ecb00a]">DCM Lab · job-hunter</span></h1>
          <span className="text-[10px] text-[#9ca3af] border border-[#2a2a2a] px-1.5 py-0.5 rounded">LIVE</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-[#d6bd98]">
            Тема
            <select aria-label="Тема офиса" value={theme} onChange={e => changeTheme(e.target.value as OfficeTheme)} className="rounded border border-[#71543f] bg-[#262623] px-2 py-1 text-xs cursor-pointer">
              <option value="art">Лофт (арт)</option>
              <option value="loft">Лофт-мастерская</option>
              <option value="cyber">Киберофис</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-[#d6bd98]">
            Герои
            <select aria-label="Отрисовка героев" value={heroRenderer} onChange={e => changeRenderer(e.target.value as HeroRenderer)} className="rounded border border-[#71543f] bg-[#262623] px-2 py-1 text-xs cursor-pointer">
              <option value="art">Арт</option>
              <option value="atlas">Спрайты</option>
              <option value="graphics">Graphics (запасной)</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[#d6bd98] cursor-pointer">
            <input type="checkbox" aria-label="Подробно" checked={details} onChange={e => setDetails(e.target.checked)} className="accent-[#ecb00a]" />
            Подробно
          </label>
          <OfficeDirectorPanel state={director} launch={id=>officeRef.current?.launchEvent(id)} stop={()=>officeRef.current?.stopEvents()} />
          <div role="group" aria-label="Масштаб офиса" className="flex items-center text-xs text-[#d6bd98] border border-[#71543f] rounded">
            <button type="button" aria-label="Уменьшить офис" disabled={sceneScale <= 0.25} onClick={() => changeZoom(Math.max(0.25, Math.round((sceneScale - 0.25) * 100) / 100))} className="min-w-10 min-h-10 cursor-pointer disabled:opacity-40">−</button>
            <button type="button" aria-label="Вписать офис" aria-pressed={zoom === "fit"} onClick={() => changeZoom("fit")} className="min-h-10 px-2 cursor-pointer">{zoom === "fit" ? "Вписать" : `${Math.round(sceneScale * 100)}%`}</button>
            <button type="button" aria-label="Увеличить офис" disabled={sceneScale >= 3} onClick={() => changeZoom(Math.min(3, Math.round((sceneScale + 0.25) * 100) / 100))} className="min-w-10 min-h-10 cursor-pointer disabled:opacity-40">+</button>
          </div>
          <Link href="/office/board" prefetch={false} className="text-xs text-[#ecb00a] hover:underline">Доска →</Link>
          <span className="text-[10px] text-[#9ca3af] font-mono">
            {agents.length} агентов • {onlineAgents.length} онлайн
          </span>
          {user && (<>
            <span className="text-[10px] text-[#ecb00a] font-mono tabular-nums">
              {displayTokens > 0 ? `${(displayTokens / 1000).toFixed(1)}k tokens` : "—"}
            </span>
            <span className="text-[10px] text-green-400/70 font-mono">
              {tokenCost > 0 ? `$${tokenCost.toFixed(2)}` : ""}
            </span>
          </>)}
          <span className="text-xs text-green-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block animate-pulse" />
          </span>
        </div>
      </header>

      {/* Main: Office (left) + Feed (right) */}
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 min-w-0 relative flex flex-col overflow-hidden" style={{ backgroundColor: theme === 'art' ? '#39231e' : '#292c2d' }}>
          <div ref={panoramaRef} className="relative flex-1 min-h-0 overflow-auto overscroll-contain" aria-label="Панорама офиса" tabIndex={0}>
            <div className="office-viewport">
            <div className="office-scene select-none" style={{ width: 960 * sceneScale, height: 600 * sceneScale }}>
              <PixelOffice ref={officeRef} agents={agents} onDirectorChange={setDirector} holiday={liveHoliday} holidayNow={holidayNow} theme={theme} heroRenderer={heroRenderer} details={details} className="w-full h-full" onCatActivity={event => {
                const now = Date.now();
                const eventKey = event.kind === 'chase' ? 'chase' : event.name+':'+event.message;
                if (now - (catEventTimes.current[eventKey] ?? -Infinity) < 30_000) return;
                catEventTimes.current[eventKey] = now;
                const agent = agents.find(a => a.name === event.name);
                setCatFeed(previous => [{ id: `cat-${eventKey}-${now}`, entityType: "agent", entityId: agent?.id || event.name, action: event.kind === 'chase' ? 'cat_chase' : 'cat_keyboard', details: JSON.stringify({ message: event.message }), createdAt: new Date().toISOString() }, ...previous].slice(0, 20));
              }} />
              {theme === "cyber" && <div className="crt-overlay" />}
            </div>
            </div>
          </div>
          <style jsx>{`
            .office-viewport { min-width: 100%; min-height: 100%; width: max-content; display: grid; place-items: center; }
            .office-scene { position: relative; }
            :global([aria-label="Панорама офиса"]:focus-visible) { outline: 2px solid #ecb00a; outline-offset: -2px; }
          `}</style>

          <section aria-label="Статусы команды" className="md:hidden shrink-0 max-h-[38vh] overflow-y-auto bg-[#171916] border-t border-[#71543f] px-3 py-2">
            <div className="text-xs text-[#d6bd98] mb-2">Команда · {theme !== "cyber" && `Щит DCM: ${{ green: "зелёная", red: "красная", unknown: "нет результата" }[dcmRegression(agents)]}`}</div>
            {panelAgents.map(agent => (
              <div key={agent.id} className="py-1.5 border-t border-white/10 text-xs leading-relaxed">
                <span className="font-semibold text-white">{agent.emoji} {agent.name}</span>
                <span className={`ml-2 ${agent.onHoliday ? "text-[#93afc2]" : STATUS_COLORS[agent.currentStatus ?? "idle"]}`}>● {agent.onHoliday ? "На выходном" : agent.atHome ? "🏠 дома" : agent.rushing ? "🏃 спешит в офис" : ({ working: "Работает", thinking: "Думает", busy: "Занят", idle: "Отдыхает", offline: "Не в сети" })[agent.currentStatus ?? "idle"]}</span>
                {agent.quotaWarning && <p className="text-[#d9be84]">⛽ {agent.quotaWarning}</p>}
                {agent.statusText && <p className="text-[#d1d5db] break-words">{agent.statusText}</p>}
              </div>
            ))}
          </section>

          {/* Stats overlay bottom-left */}
          <div className="absolute bottom-3 left-3 hidden md:flex items-center gap-3 text-[10px] text-[#9ca3af] bg-[#0f0f0f]/80 border border-[#2a2a2a] px-3 py-1.5 rounded backdrop-blur">
            <span className="text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block animate-pulse" />
              LIVE
            </span>
            {theme !== "cyber" && <span role="status">Щит DCM: {({ green: "зелёная регрессия", red: "красная регрессия", unknown: "нет результата" })[dcmRegression(agents)]}</span>}
          </div>

          {/* Admin controls */}
          {user && (
            <div className="absolute bottom-3 right-3 flex gap-2 pointer-events-auto z-10">
              <button
                onClick={() => officeRef.current?.triggerAllMeeting()}
                className="text-[10px] bg-[#ecb00a]/20 hover:bg-[#ecb00a]/40 text-[#ecb00a] border border-[#ecb00a]/30 px-3 py-1.5 rounded backdrop-blur transition-colors cursor-pointer"
              >
                🤝 Собрать всех
              </button>
            </div>
          )}
        </main>

        {/* Right sidebar */}
        <aside className="w-80 bg-[#0f0f0f] border-l border-[#2a2a2a] flex flex-col shrink-0 overflow-hidden hidden md:flex">
          <OfficeStats />
          {/* Agent list */}
          <div className="p-4 border-b border-[#2a2a2a]/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
                👥 Agents
              </h3>
            </div>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {panelAgents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-3 text-sm">
                  <span className="text-lg">{agent.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">{agent.name}</div>
                    <div className="text-xs text-[#6b7280] truncate">{agent.role}</div>
                    {agent.quotaWarning && <div className="text-[10px] text-[#d9be84] leading-relaxed">⛽ {agent.quotaWarning}</div>}
                    {agent.statusText && <div className={`text-[10px] text-[#9ca3af] whitespace-normal break-words leading-relaxed`} title={agent.statusText}>{agent.statusText}</div>}
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={`text-xs font-medium ${agent.onHoliday ? "text-[#93afc2]" : STATUS_COLORS[agent.currentStatus ?? "idle"] || "text-gray-500"}`}>
                      {agent.onHoliday && "● На выходном"}
                      {agent.atHome && "🏠 дома"}
                      {agent.rushing && "🏃 спешит в офис"}
                      {!agent.onHoliday && !agent.atHome && !agent.rushing && agent.currentStatus === "working" && "● Working"}
                      {!agent.onHoliday && !agent.atHome && !agent.rushing && agent.currentStatus === "thinking" && "● Thinking"}
                      {!agent.onHoliday && !agent.atHome && !agent.rushing && agent.currentStatus === "busy" && "● Busy"}
                      {!agent.onHoliday && !agent.atHome && !agent.rushing && agent.currentStatus === "idle" && "● Idle"}
                      {!agent.onHoliday && !agent.atHome && !agent.rushing && agent.currentStatus === "offline" && "● Offline"}
                    </span>
                    {user && costs[agent.id] > 0 && (
                      <span className="text-[10px] text-[#6b7280] font-mono">${costs[agent.id].toFixed(2)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Feed — только для авторизованных */}
          <div className="flex-1 overflow-y-auto p-4">
            {true ? ( /* лента открыта без входа: LAN, только чтение (решение владельца 01.11) */
              <>
                <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full inline-block animate-pulse" />
                  Live Feed
                </h3>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {[...catFeed, ...feed].sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "")).slice(0, 30).map((item) => {
                    const agent = getAgentForActivity(item);
                    return (
                      <div key={item.id} className="text-xs py-1.5 border-b border-[#2a2a2a]/30">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[#6b7280]">
                            {item.createdAt
                              ? new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(item.createdAt) ? item.createdAt : item.createdAt.replace(" ", "T") + "Z").toLocaleTimeString("ru", {
                                  timeZone: "Europe/Moscow",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : ""}
                          </span>
                          {agent && <span>{agent.emoji} {agent.name}</span>}
                        </div>
                        <div className="text-[#e4e6f0]">{getActivityMessage(item)}</div>
                      </div>
                    );
                  })}
                  {feed.length === 0 && catFeed.length === 0 && (
                    <div className="text-[#6b7280] text-xs">Waiting for activity...</div>
                  )}
                </div>
              </>
            ) : (
              <div className="text-[#6b7280] text-xs text-center mt-4">🔒</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
