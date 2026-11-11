'use client';
import { useEffect, useRef, useState } from 'react';
import { directorEvent, OFFICE_EVENTS, type DirectorGroup, type DirectorSnapshot } from './officeDirector';

const STORAGE_KEY='office-director-open';
export function OfficeDirectorPanel({state,launch,stop}: {state:DirectorSnapshot;launch:(id:string)=>void;stop:()=>void}) {
  const [open,setOpen]=useState(false);
  const [stream,setStream]=useState(true);
  const toggle=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const hidden=new URLSearchParams(window.location.search).get('stream')==='1';
    setStream(hidden);
    if(!hidden)try{setOpen(localStorage.getItem(STORAGE_KEY)==='true');}catch{}
  },[]);
  const changeOpen=(value:boolean)=>{setOpen(value);try{localStorage.setItem(STORAGE_KEY,String(value));}catch{}};
  useEffect(()=>{
    if(!open)return;
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){changeOpen(false);toggle.current?.focus();}};
    window.addEventListener('keydown',escape);return ()=>window.removeEventListener('keydown',escape);
  },[open]);
  if(stream)return null;
  const buttons=(group:DirectorGroup)=><div className="director-buttons">{OFFICE_EVENTS.filter(event=>event.group===group).map(event=><button type="button" key={event.id} data-office-event={event.id} disabled={!state.ready} onClick={()=>launch(event.id)} aria-pressed={event.id==='cat-cursor'?state.cursor:undefined}>
    <span aria-hidden="true">{event.icon}</span> {event.id==='cat-cursor'?`Курсор: охота ${state.cursor?'вкл':'выкл'}`:event.name}
  </button>)}</div>;
  return <>
    <button ref={toggle} type="button" aria-label="Режиссёр" aria-expanded={open} aria-controls="office-director" onClick={()=>changeOpen(!open)} className="director-toggle">🎬</button>
    {open&&<aside id="office-director" aria-label="Режиссёр" className="director-panel">
      <div className="director-heading"><div><strong>🎬 Режиссёр</strong><p>Сценки только для вас</p></div><button type="button" aria-label="Закрыть режиссёра" onClick={()=>{changeOpen(false);toggle.current?.focus();}}>×</button></div>
      <div className="director-status" role="status" aria-live="polite">{!state.ready?'Готовим сцену…':state.active?`Сейчас: ${directorEvent(state.active)?.name}`:'Офис живёт своей жизнью'}<span>В очереди: {state.queued}</span></div>
      <button type="button" className="director-stop" onClick={stop} disabled={!state.ready}>⏹ остановить всё</button>
      {state.error&&<p role="alert" className="director-error">{state.error}</p>}
      <div className="director-scroll">{(['Коты','Офис','Герои'] as const).map(group=><section key={group}><h2>{group}</h2>{buttons(group)}</section>)}
        <details><summary>🤫 Секретное <small>не открывать при Марине</small></summary>{buttons('🤫 Секретное')}</details>
      </div>
    </aside>}
    <style jsx>{`
      .director-toggle {min-width:40px;min-height:40px;font-size:21px;border:1px solid #71543f;border-radius:8px;background:#262623;cursor:pointer}
      .director-panel {position:fixed;z-index:45;right:16px;top:84px;bottom:16px;width:370px;max-width:calc(100vw - 32px);display:flex;flex-direction:column;background:#191e1bf5;color:#f4eadb;border:1px solid #8d7651;border-radius:18px;box-shadow:0 12px 48px #0008;padding:16px;backdrop-filter:blur(14px);font-size:13px;box-sizing:border-box}
      .director-heading {display:flex;align-items:start;justify-content:space-between;gap:12px}.director-heading strong {font-size:20px}.director-heading p {color:#b4b4a1;font-size:12px;margin:5px 0 12px}.director-heading button {background:#30372f;border-radius:8px;width:36px;height:36px;font-size:24px;cursor:pointer}
      .director-status {font-size:12px;color:#e6cd9a;line-height:1.6}.director-status span{display:block;color:#b8c4b0}
      .director-stop {margin:12px 0 4px;border:1px solid #ab7361;background:#543b32;color:#ffe8d9;border-radius:8px;padding:10px;cursor:pointer;text-align:left}
      .director-scroll {min-height:0;overflow:auto;overscroll-behavior:contain;padding-right:3px}.director-scroll section{margin:16px 0}.director-scroll h2{font-size:13px;font-weight:700;letter-spacing:.04em;margin:0 0 8px;color:#f1d59f}
      .director-error{color:#ffb8a8;margin:8px 0}.director-scroll details {border-top:1px solid #596148;padding:12px 0}.director-scroll summary{cursor:pointer;margin-bottom:10px;font-weight:600}.director-scroll small{display:block;font-size:11px;color:#afa799;font-weight:400;margin:4px 0}
      @media(max-width:767px){.director-panel{top:auto;bottom:0;left:0;right:0;width:100%;max-width:100%;height:50dvh;max-height:50dvh;border-radius:18px 18px 0 0;padding:12px 14px;padding-bottom:max(12px,env(safe-area-inset-bottom));box-shadow:0 -8px 32px #0006}.director-heading strong{font-size:18px}.director-heading p{margin:3px 0 6px}.director-status span{display:inline;margin-left:10px}.director-stop{margin:8px 0 0;padding:8px}}
    `}</style>
    <style jsx global>{`
      #office-director .director-buttons{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      #office-director .director-buttons button{min-height:42px;padding:8px 9px;background:#30382e;border:1px solid #526147;border-radius:8px;color:#e9e9d8;text-align:left;font-size:12px;line-height:1.35;cursor:pointer;transition:background .15s}
      #office-director .director-buttons button:hover{background:#42513b}#office-director button:disabled{opacity:.45;cursor:wait}#office-director button:focus-visible,.director-toggle:focus-visible{outline:2px solid #edc674;outline-offset:2px}
    `}</style>
  </>;
}
