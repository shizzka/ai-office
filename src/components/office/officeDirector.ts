import type { OwnerScene } from './ownerFeatures';
import { demoQuotas, EMPTY_QUOTAS, officeHoliday, type OfficeHoliday } from './officeHoliday';

export type DirectorGroup = 'Коты' | 'Офис' | 'Герои' | '🤫 Секретное';
export type DirectorTime = 'auto' | 'morning' | 'day' | 'evening' | 'night';
export type DirectorHoliday = 'codex' | 'claude' | 'all' | 'off' | null;
export interface DirectorTask { done: () => boolean; stop: () => void }
export interface DirectorRuntime {
  attendance: (mode: 'rush'|'mattress') => DirectorTask;
  owner: (mode: OwnerScene) => DirectorTask;
  cat: (mode: string) => DirectorTask;
  play: (mode: 'pot' | 'pot-desk' | 'laser' | 'hero') => DirectorTask;
  moment: (mode: 'visit' | 'vacancies' | 'egg' | 'surprise') => DirectorTask;
  tap: (name: 'Саня' | 'whoami' | 'Марина') => DirectorTask;
  regression: (status: 'pass' | 'fail') => DirectorTask;
  holiday: (mode: DirectorHoliday) => DirectorTask;
  time: (mode: DirectorTime) => DirectorTask;
  cursor: () => DirectorTask;
  reset: () => void;
}
export interface DirectorEvent {
  id: string; name: string; icon: string; group: DirectorGroup;
  query?: readonly [string, string][];
  run: (runtime: DirectorRuntime) => DirectorTask;
}

// Single registry for buttons AND demo links. OFFICE-23 (рубильник, планёрка,
// пицца, обход, КЗ, нормоконтроль), 24 (вечер, ночь, матрас, срочно), 25 (табло):
// register every new scene here, with its launch function and ?scene= alias.
// Manual launches are viewer-local presentations; never write counters or API state.
export const OFFICE_EVENTS: readonly DirectorEvent[] = [
  {id:'evening',name:'Уход домой',icon:'🌇',group:'Офис',query:[['scene','evening']],run:r=>r.time('evening')},
  {id:'night',name:'Ночь ГИПа',icon:'🌙',group:'Офис',query:[['scene','night']],run:r=>r.time('night')},
  {id:'blackout',name:'Отключение света',icon:'😱',group:'Офис',query:[['scene','blackout']],run:r=>r.owner('breaker')},
  {id:'rush',name:'Срочно на работу',icon:'🏃',group:'Офис',query:[['scene','rush']],run:r=>r.attendance('rush')},
  {id:'mattress',name:'ГИП на матрасе',icon:'🛏️',group:'Офис',query:[['scene','mattress']],run:r=>r.attendance('mattress')},
  ...([['breaker','Рубильник','⚡'],['standup','Планёрка','📋'],['pizza','Пицца','🍕'],['rounds','Обход','👀'],['short','Иваныч ловит КЗ','⚡'],['review','Нормоконтроль вдвоём','📏']] as const).map(([id,name,icon]):DirectorEvent=>({id,name,icon,group:'Офис',query:[['scene',id]],run:r=>r.owner(id)})),
  { id:'cat-wash', name:'Умывается', icon:'🧼', group:'Коты', query:[['cats','wash']], run:r=>r.cat('wash') },
  { id:'cat-stretch', name:'Потягивается', icon:'🐈', group:'Коты', query:[['cats','stretch']], run:r=>r.cat('stretch') },
  { id:'cat-belly', name:'Пузико', icon:'😸', group:'Коты', query:[['cats','belly']], run:r=>r.cat('belly') },
  { id:'cat-window', name:'Окно', icon:'🪟', group:'Коты', query:[['cats','window']], run:r=>r.cat('window') },
  { id:'cat-chase', name:'Догонялки', icon:'🐾', group:'Коты', query:[['cats','chase']], run:r=>r.cat('chase') },
  { id:'cat-night', name:'Ночь', icon:'🌙', group:'Коты', query:[['cats','night']], run:r=>r.cat('night') },
  { id:'cat-visit', name:'Визит к Марине', icon:'💕', group:'Коты', run:r=>r.moment('visit') },
  { id:'cat-keyboard', name:'Захват клавиатуры', icon:'⌨️', group:'Коты', run:r=>r.cat('keyboard') },
  { id:'cat-laser', name:'Лазер', icon:'🔴', group:'Коты', query:[['cats','laser']], run:r=>r.play('laser') },
  { id:'cat-hero', name:'Герой играет с котами', icon:'😄', group:'Коты', query:[['cats','hero']], run:r=>r.play('hero') },
  { id:'cat-cursor', name:'Курсор: охота вкл/выкл', icon:'🖱️', group:'Коты', run:r=>r.cursor() },
  { id:'pot', name:'Горшок на окне', icon:'🪴', group:'Коты', query:[['scene','pot']], run:r=>r.play('pot') },
  { id:'pot-desk', name:'Горшок на столе', icon:'🪴', group:'Коты', run:r=>r.play('pot-desk') },
  { id:'holiday-codex', name:'Выходной: Codex', icon:'🏖️', group:'Офис', query:[['holiday','codex']], run:r=>r.holiday('codex') },
  { id:'holiday-claude', name:'Выходной: Claude', icon:'🏖️', group:'Офис', query:[['holiday','claude']], run:r=>r.holiday('claude') },
  { id:'holiday-all', name:'Выходной: все', icon:'🏖️', group:'Офис', query:[['holiday','all']], run:r=>r.holiday('all') },
  { id:'holiday-off', name:'Снять выходной', icon:'🏢', group:'Офис', run:r=>r.holiday('off') },
  { id:'time-morning', name:'Утро', icon:'🌅', group:'Офис', query:[['time','morning']], run:r=>r.time('morning') },
  { id:'time-day', name:'День', icon:'☀️', group:'Офис', query:[['time','day']], run:r=>r.time('day') },
  { id:'time-evening', name:'Вечер', icon:'🌇', group:'Офис', query:[['time','evening']], run:r=>r.time('evening') },
  { id:'time-night', name:'Ночь', icon:'🌃', group:'Офис', query:[['time','night']], run:r=>r.time('night') },
  { id:'time-auto', name:'Время: авто', icon:'🕰️', group:'Офис', run:r=>r.time('auto') },
  { id:'tap-sanya', name:'Саня: 5 тапов', icon:'✋', group:'Герои', run:r=>r.tap('Саня') },
  { id:'tap-whoami', name:'whoami: тап', icon:'💬', group:'Герои', run:r=>r.tap('whoami') },
  { id:'tap-marina', name:'Марина: тап', icon:'💬', group:'Герои', run:r=>r.tap('Марина') },
  { id:'sanya-red', name:'Саня: «Попался!»', icon:'🐞', group:'Герои', run:r=>r.regression('fail') },
  { id:'sanya-green', name:'Саня: «Все зелёные»', icon:'✅', group:'Герои', run:r=>r.regression('pass') },
  { id:'secret-cat', name:'Кот к Марине', icon:'💗', group:'🤫 Секретное', run:r=>r.moment('visit') },
  { id:'secret-vacancies', name:'Вакансии на планшете', icon:'📄', group:'🤫 Секретное', run:r=>r.moment('vacancies') },
  { id:'secret-egg', name:'Пасхалка: 5 тапов', icon:'❤️', group:'🤫 Секретное', run:r=>r.moment('egg') },
  { id:'surprise', name:'Сюрпризы Марины', icon:'🎁', group:'🤫 Секретное', query:[['surprise','1']], run:r=>r.moment('surprise') },
];

export const directorEvent = (id: string) => OFFICE_EVENTS.find(event => event.id === id);
/** All ?scene= values are registry IDs; old demo URLs are aliases of the same launches. */
export function directorQueryEvents(query: URLSearchParams): string[] {
  const scene = query.get('scene');
  const result = OFFICE_EVENTS.filter(event => event.query?.some(([key,value]) => key !== 'scene' && query.get(key) === value)).map(event=>event.id);
  if (scene && directorEvent(scene)) result.push(scene === 'pot' && query.get('pot') === 'desk' ? 'pot-desk' : scene);
  return [...new Set(result)].sort((a,b)=>Number(!/^(time-|holiday-)/.test(a))-Number(!/^(time-|holiday-)/.test(b)));
}
export const directorHour = (mode: DirectorTime) => ({morning:8,day:12,evening:19,night:0,auto:new Date().getHours()+new Date().getMinutes()/60})[mode];
export const directorHoliday = (live: OfficeHoliday, mode: DirectorHoliday): OfficeHoliday => mode === null ? live
  : officeHoliday(mode === 'off' ? EMPTY_QUOTAS : demoQuotas(mode,Date.now()/1000)!,Date.now()/1000);

export interface DirectorSnapshot { active: string | null; queued: number; ready: boolean; error: string | null; holiday: DirectorHoliday; cursor: boolean }
export const EMPTY_DIRECTOR: DirectorSnapshot = {active:null,queued:0,ready:false,error:null,holiday:null,cursor:true};
/** No network, storage, or analytics: one FIFO per mounted viewer. */
export function createDirectorQueue(runtime: DirectorRuntime, busy: () => boolean, changed: (state: Pick<DirectorSnapshot,'active'|'queued'|'error'>) => void) {
  let active: {id:string;task:DirectorTask} | null = null;
  const pending: string[] = [];
  let error: string | null = null;
  const publish = () => changed({active:active?.id ?? null,queued:pending.length,error});
  function tick() {
    if (active?.task.done()) { active.task.stop(); active=null; }
    while (!active && pending.length && !busy()) {
      const id=pending.shift()!;
      try {
        const task=directorEvent(id)!.run(runtime);
        if (task.done()) task.stop(); else active={id,task};
        error=null;
      } catch (e) { runtime.reset(); error=e instanceof Error ? e.message : 'Сценка недоступна'; }
      publish();
    }
    publish();
  }
  return {
    enqueue(id:string) { if (!directorEvent(id)) return; pending.push(id); tick(); },
    tick,
    stop() { pending.length=0; active?.task.stop(); active=null; runtime.reset(); error=null; publish(); },
  };
}
