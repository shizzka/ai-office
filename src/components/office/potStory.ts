import { artRoute, isArtWalkable } from './aiOfficeNavigation';
import { catHome, nearestFreeBed, type CatState, type CatActivity } from './catBehavior';
import type { Point } from './officeLayout';
import { potPlacement } from './potPlacement';
import { OFFICE_DOOR, DOOR_FADE_SECONDS } from './officeDoor';

export const POT_PLACES = [
  { id: 'sill', ...potPlacement('sill'), paw: { x: 554, y: 195 }, exit: { x: 575, y: 340 },
    access: [{ x: 565, y: 204 }], floor: { x: 588, y: 378 } },
  { id: 'desk', ...potPlacement('desk'), paw: { x: 694, y: 352 }, exit: { x: 681, y: 448 },
    access: [] as Point[], floor: { x: 681, y: 448 } },
] as const;
export type PotPhase = 'approach' | 'swipe' | 'falling' | 'guilty' | 'waiting' | 'run' | 'angry' | 'sweep' | 'fetch' | 'fetch-out' | 'fetch-away' | 'fetch-in' | 'carry' | 'happy' | 'return';
export interface PotPerson { position: Point; home: Point; present: boolean; atDesk: boolean }
export interface PotStory {
  phase: PotPhase; since: number; site: typeof POT_PLACES[number]; cat: CatState;
  catRoute: Point[]; catEscaping: boolean; catReleased: boolean;
  marina: PotPerson; marinaRoute: Point[]; marinaDue: number;
  marinaOpacity: number;
  whole: boolean; broken: boolean; complete: boolean;
}
const d = (a: Point, b: Point) => Math.hypot(a.x-b.x,a.y-b.y);
export const nextPotScene = (now: number, stream: boolean, random = Math.random) => now + (stream ? 300+random()*300 : 1200+random()*1200);
export const nextHeroLaser = (now: number, stream: boolean, random = Math.random) => now + (stream ? 180+random()*300 : 600+random()*900);

export function startPotStory(cats: CatState[], marina: PotPerson, now: number, random = Math.random, location?: 'sill' | 'desk'): PotStory | null {
  const sites = POT_PLACES.filter(s => (!location || s.id===location) && (s.id!=='desk' || !marina.atDesk));
  if (!sites.length) return null;
  const free = cats.filter(c => c.phase==='home' && !c.desk && !c.visit);
  if (!free.length) return null;
  const site = sites[Math.min(sites.length-1,Math.floor(random()*sites.length))];
  const cat = free[Math.min(free.length-1,Math.floor(random()*free.length))];
  const bed = catHome(cat), route = artRoute(bed.exit,site.exit);
  if (!route.length && d(bed.exit,site.exit)>1) return null;
  const catRoute = [...bed.access.map(p=>({...p})), {...bed.exit}, ...route,
    ...[...site.access].reverse().map(p=>({...p})), {...site.paw}];
  cat.phase='chasing'; cat.route=[]; cat.activity=undefined;
  if(cat.reaction)cat.reaction.belly=false;
  return {phase:'approach',since:now,site,cat,catRoute,catEscaping:false,catReleased:false,
    marina,marinaRoute:[],marinaDue:Infinity,marinaOpacity:1,whole:true,broken:false,complete:false};
}

/** Travel consumes distance, so sparse ticks cannot skip corners or overshoot. */
export function moveStoryActor(position: Point, route: Point[], dt: number, speed: number) {
  let budget=Math.max(0,dt)*speed;
  while(route.length && budget>0) {
    const p=route[0], length=d(position,p), step=Math.min(length,budget);
    if(length){position.x+=(p.x-position.x)*step/length;position.y+=(p.y-position.y)*step/length;}
    budget-=step;
    if(length<=step+1e-6)route.shift();else break;
  }
}
function escape(story: PotStory, cats: CatState[]) {
  const bed=nearestFreeBed(story.cat,cats);
  if(!bed)return;
  const [id,home]=bed;
  story.cat.bed=id;story.cat.home={...home.place};
  story.catRoute=[...story.site.access.map(p=>({...p})),{...story.site.exit},
    ...artRoute(story.site.exit,home.exit),...[...home.access].reverse().map(p=>({...p})),{...home.place}];
  story.catEscaping=true;
  story.cat.chaseReturning=true;
}
export function cancelPotStory(s:PotStory,cats:CatState[]) {
  s.whole=true;s.broken=false;s.complete=true;
  if(!cats.includes(s.cat) || s.catReleased)return;
  const index=s.catRoute.findIndex(isArtWalkable);
  s.cat.route=isArtWalkable(s.cat.position)?[]:index>=0?s.catRoute.slice(0,index+1)
    :[...s.site.access.map(p=>({...p})),{...s.site.exit}];
  s.cat.phase='returning';s.cat.chaseReturning=true;
}
export function advancePotStory(s: PotStory, cats: CatState[], dt: number, now: number, random=Math.random): CatActivity[] {
  const events: CatActivity[]=[];
  const change=(phase:PotPhase)=>{s.phase=phase;s.since=now;};
  if(s.catEscaping && !s.catReleased) {
    moveStoryActor(s.cat.position,s.catRoute,dt,210);
    if(!s.catRoute.length){s.catReleased=true;s.cat.phase='home';s.cat.chaseReturning=undefined;}
  }
  switch(s.phase) {
    case 'approach':
      moveStoryActor(s.cat.position,s.catRoute,dt,95);
      if(!s.catRoute.length)change('swipe');
      break;
    case 'swipe': if(now-s.since>=.8){s.whole=false;change('falling');}break;
    case 'falling': if(now-s.since>=.5){
      s.broken=true;change('guilty');s.marinaDue=now+(s.marina.present?0:10+random()*20);
      events.push({name:s.cat.name,message:`🪴 ${s.cat.name} ${s.cat.name==='Масяня'?'уронила':'уронил'} горшок. Марина в ярости.`});
    }break;
    case 'guilty': if(now-s.since>=2.5){escape(s,cats);change('waiting');}break;
    case 'waiting': if(now>=s.marinaDue){
      s.marinaRoute=artRoute(s.marina.position,s.site.floor);
      if(s.marinaRoute.length || d(s.marina.position,s.site.floor)<1)change('run');
    }break;
    case 'run':
      moveStoryActor(s.marina.position,s.marinaRoute,dt,190);
      if(!s.marinaRoute.length)change('angry');
      break;
    case 'angry':if(now-s.since>=2.5)change('sweep');break;
    case 'sweep':if(now-s.since>=3.5){
      s.broken=false;s.marinaRoute=artRoute(s.marina.position,OFFICE_DOOR);change('fetch');
    }break;
    case 'fetch':
      moveStoryActor(s.marina.position,s.marinaRoute,dt,100);
      if(!s.marinaRoute.length&&d(s.marina.position,OFFICE_DOOR)<1)change('fetch-out');
      break;
    case 'fetch-out':
      s.marinaOpacity=Math.max(0,1-(now-s.since)/DOOR_FADE_SECONDS);
      if(now-s.since>=DOOR_FADE_SECONDS-1e-9){s.marinaOpacity=0;change('fetch-away');}
      break;
    case 'fetch-away':if(now-s.since>=.5)change('fetch-in');break;
    case 'fetch-in':
      s.marinaOpacity=Math.min(1,(now-s.since)/DOOR_FADE_SECONDS);
      if(now-s.since>=DOOR_FADE_SECONDS-1e-9){s.marinaOpacity=1;s.marinaRoute=artRoute(s.marina.position,s.site.exit);change('carry');}
      break;
    case 'carry':
      moveStoryActor(s.marina.position,s.marinaRoute,dt,80);
      if(!s.marinaRoute.length){s.whole=true;change('happy');events.push({name:'Марина',message:'🪴 Новый горшок на месте'});}
      break;
    case 'happy':if(now-s.since>=2){s.marinaRoute=artRoute(s.marina.position,s.marina.home);change('return');}break;
    case 'return':
      moveStoryActor(s.marina.position,s.marinaRoute,dt,95);
      s.complete=!s.marinaRoute.length && s.catReleased;
      break;
  }
  return events;
}
export function potCatFrame(s:PotStory,now:number) {
  if(s.catReleased)return null;
  if(['swipe','falling'].includes(s.phase))return 'scene_swipe';
  if(s.phase==='guilty')return 'scene_guilty';
  if(s.phase==='approach' && s.catRoute.length===1)return 'scene_jump';
  return `run_${Math.floor(now*10)%4+1}`;
}
export function potMarinaFrame(s:PotStory,now:number) {
  if(['approach','swipe','falling','guilty','waiting'].includes(s.phase))return null;
  return ({angry:'scene_angry',sweep:'scene_sweep','fetch-out':'cup','fetch-away':'cup','fetch-in':'scene_carry',carry:'scene_carry',happy:'scene_happy'} as Record<string,string>)[s.phase]
    || `run_${Math.floor(now*9)%4+1}`;
}
