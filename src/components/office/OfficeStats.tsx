'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMCWebSocket } from '@/lib/ws';
import type { OfficeStatsCounters, OfficeStatsSnapshot, OfficeStatsTotals } from '@/lib/officeStatsTypes';

const COUNTERS: [keyof OfficeStatsCounters, string][] = [
  ['potsBroken','🪴 Разбито горшков'], ['pizzas','🍕 Съедено пицц'],
  ['shortCircuits','⚡ Коротких замыканий'], ['breakerChecks','✅ Проверок УЗО'],
  ['standups','📋 Планёрок'], ['catChases','🐈 Догонялок котов'],
  ['keyboards','⌨️ Кот на клавиатуре'], ['laserGames','🔴 Игр с лазером'],
  ['officeNights','🌙 Ночёвок в офисе'], ['mattressNights','🛏️ Ночёвок на матрасе'],
  ['urgentArrivals','🏃 Срочных приездов'], ['blackouts','💡 Отключений света'],
];
const METRICS: [keyof OfficeStatsTotals,string][] = [
  ['bugsFound','Найдено багов'],['bugsClosed','Закрыто багов'],
  ['tasksCreated','Создано задач'],['tasksDone','Сделано задач'],
  ['regressionsPassed','Регрессии: успешно'],['regressionsFailed','Регрессии: ошибки'],
  ['loops','🔁 Кругов Лёхи'],['reviews','🔍 Ревью Аси'],['vacancies','📄 Найдено вакансий'],
];
export const formatOfficeMetric = (value: number | null | undefined) => typeof value === 'number' ? value.toLocaleString('ru-RU') : 'нет данных';
const number = formatOfficeMetric;
export function hasOfficeTaskMetrics(stats: OfficeStatsSnapshot) {
  return [stats.totals, ...stats.projects].every(value => 'tasksCreated' in value && 'tasksDone' in value);
}

/** One read-only observation shared with the canvas through office:stats-updated. */
export function useOfficeStats() {
  const [stats,setStats]=useState<OfficeStatsSnapshot|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let cancelled=false, running=false;
    const controller=new AbortController();
    const stream=new URLSearchParams(window.location.search).get('stream')==='1';
    const refresh=async()=>{
      if(running)return;running=true;
      try{
        const response=await fetch(`/api/office/stats${stream?'?stream=1':''}`,{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('Stats unavailable');
        const data:OfficeStatsSnapshot=await response.json();
        if(!cancelled){setStats(data);setError(false);window.dispatchEvent(new CustomEvent('office:stats-updated',{detail:data}));}
      }catch{if(!cancelled)setError(true);}finally{running=false;}
    };
    void refresh();const timer=setInterval(refresh,10_000);
    const ws=getMCWebSocket();
    const stopStats=ws.on('office:stats',refresh);
    const stopState=ws.on('office:state',(event:{stats?:OfficeStatsSnapshot})=>{
      if(!cancelled&&event.stats){
        if(!hasOfficeTaskMetrics(event.stats)){void refresh();return;}
        setStats(event.stats);setError(false);window.dispatchEvent(new CustomEvent('office:stats-updated',{detail:event.stats}));
      }
    });
    window.addEventListener('office:request-stats',refresh);
    return()=>{cancelled=true;controller.abort();clearInterval(timer);stopStats();stopState();window.removeEventListener('office:request-stats',refresh);};
  },[]);
  return {stats,error};
}

export function MetricList({value,stream}:{value:OfficeStatsTotals;stream:boolean}) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{METRICS.filter(([key])=>!(stream&&key==='vacancies')&&(key!=='vacancies'||value[key]!==undefined)).map(([key,label])=><div key={key} className="flex justify-between gap-3"><dt className="text-[#aab1a5]">{label}</dt><dd className="font-mono text-[#e9e5d2]">{number(value[key]!)}</dd></div>)}</dl>;
}

export function OfficeStats() {
  const {stats,error}=useOfficeStats();
  const [open,setOpen]=useState(false);
  const [stream,setStream]=useState(false);
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{setStream(new URLSearchParams(window.location.search).get('stream')==='1');const show=()=>setOpen(true);window.addEventListener('office:open-stats',show);return()=>window.removeEventListener('office:open-stats',show);},[]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keyboard=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setOpen(false);}
      if(event.key==='Tab'){
        const items=dialog.current?.querySelectorAll<HTMLElement>('button, summary, [href], input, select, textarea, [tabindex="0"]');
        if(!items?.length)return;
        const first=items[0],last=items[items.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',keyboard);
    return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',keyboard);previous?.focus();};
  },[open]);
  return <>
    <details className="border-b border-[#2a2a2a] px-4 py-3 text-sm text-[#c9c3b0]">
      <summary className="cursor-pointer select-none">Статистика</summary>
      <div className="mt-3 space-y-3">
        {stats?<><p className="text-xs text-[#919b89]">🐞 Найдено багов: <strong className="font-mono text-[#daebbf]">{number(stats.totals.bugsFound)}</strong></p><p className="text-xs text-[#919b89]">📋 Создано задач: <strong className="font-mono text-[#daebbf]">{number(stats.totals.tasksCreated)}</strong></p><p className="text-xs text-[#919b89]">🍕 Пиццы: <strong className="font-mono text-[#daebbf]">{number(stats.counters.pizzas)}</strong></p></>:<p className="text-xs">{error?'Статистика временно недоступна':'Загрузка…'}</p>}
        <button type="button" onClick={()=>setOpen(true)} className="rounded border border-[#5b624f] px-3 py-1.5 text-xs hover:bg-[#242a20] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#cfda9e]">Вся статистика</button>
      </div>
    </details>
    {open&&createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="office-stats-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[#796749] bg-[#171c17] p-5 text-[#e9e5d2] shadow-2xl">
        <div className="mb-2 flex items-start justify-between gap-4"><h2 id="office-stats-title" className="text-lg font-semibold">Статистика офиса</h2><button type="button" onClick={()=>setOpen(false)} aria-label="Закрыть статистику" className="rounded px-2 py-1 text-xl hover:bg-white/10 focus-visible:outline">×</button></div>
        {stats?<>
          <p className="mb-5 text-xs text-[#aab1a5]">Игровые счётчики с {new Date(stats.since).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'})}</p>
          {error&&<p role="status" className="mb-3 text-xs text-[#d7bd83]">Показаны последние полученные данные. Обновление временно недоступно.</p>}
          <h3 className="mb-3 text-sm font-semibold">Жизнь офиса</h3>
          <dl className="mb-6 grid gap-3 sm:grid-cols-2">{COUNTERS.map(([key,label])=><div key={key} className="flex justify-between gap-4 rounded bg-black/20 px-3 py-2 text-sm"><dt className="text-[#aab1a5]">{label}</dt><dd className="font-mono">{number(stats.counters[key])}</dd></div>)}</dl>
          <h3 className="mb-3 text-sm font-semibold">Реальная работа · сумма</h3>
          <MetricList value={stats.totals} stream={stream}/>
          <h3 className="mb-3 mt-6 text-sm font-semibold">По проектам</h3>
          <div className="space-y-3">{stats.projects.map(project=><section key={project.id} className="rounded border border-[#3c4538] p-3"><h4 className="text-sm">{project.name}</h4><div className="mt-3"><MetricList value={project} stream={stream}/></div></section>)}{stats.projects.length===0&&<p className="text-sm text-[#aab1a5]">Нет данных по проектам.</p>}</div>
        </>:<p role="status" className="py-8 text-sm text-[#aab1a5]">{error?'Статистика временно недоступна. Повторяем загрузку автоматически.':'Загрузка…'}</p>}
      </div>
    </div>,document.body)}
  </>;
}
