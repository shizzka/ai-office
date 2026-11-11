import layout from '../../../office-art/layout-ai.json';
import { artRoute, isArtWalkable } from './aiOfficeNavigation';
import { catHome, nearestFreeBed, type CatState } from './catBehavior';
import { normalizeHeroName } from './heroRegistry';
import type { Point } from './officeLayout';

const distance = (a: Point, b: Point) => Math.hypot(a.x-b.x, a.y-b.y);
const copy = (p: Point): Point => ({ ...p });
type HuntPhase = 'departing' | 'running' | 'crouch' | 'jump' | 'escaping';
interface Hunter { phase: HuntPhase; until: number; target?: Point; lift: number; frame: string; }
export interface CatHunt {
  pointer: Point | null;
  pointerAt: number;
  laser: { source: 'auto' | 'hero'; until: number; position: Point; route: Point[] } | null;
  hunters: Map<CatState, Hunter>;
  escaped: Set<CatState>;
  clock: number;
  owns(cat: CatState): boolean;
  frame(cat: CatState): string | null;
  lift(cat: CatState): number;
}

/** Project input onto the navigation mesh. Grid candidates are immutable and
 * include apron edges that a coarse floor bounding box would miss. */
const floorPoints: Point[] = [];
for (let y=0;y<=600;y+=2) for (let x=0;x<=960;x+=2) {
  const p={x,y}; if (isArtWalkable(p)) floorPoints.push(p);
}
export function nearestWalkablePoint(p: Point): Point | null {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  if (isArtWalkable(p)) return copy(p);
  let best: Point | null=null, cost=Infinity;
  for (const candidate of floorPoints) {
    const d=distance(p,candidate); if (d<cost) { cost=d; best=candidate; }
  }
  return best && copy(best);
}
export function createCatHunt(): CatHunt {
  return { pointer:null, pointerAt:-Infinity, laser:null, hunters:new Map(), escaped:new Set(), clock:0,
    owns(cat) { return this.hunters.has(cat); },
    frame(cat) { return this.hunters.get(cat)?.frame || null; },
    lift(cat) { return this.hunters.get(cat)?.lift || 0; },
  };
}
export function setHuntPointer(state: CatHunt, point: Point | null, now: number) {
  const next=point && nearestWalkablePoint(point);
  if (next) {
    if (!state.pointer || distance(next,state.pointer)>.01) state.pointerAt=now;
    if (!state.pointer) state.escaped.clear();
    state.laser=null;
  }
  state.pointer=next;
}
export function startLaser(state: CatHunt, now: number, source: 'auto' | 'hero'='auto', random=Math.random): boolean {
  if (state.pointer || state.laser) return false;
  state.escaped.clear();
  state.laser={source, until:now+20+Math.max(0,Math.min(1,random()))*20, position:{x:630,y:430},route:[]};
  return true;
}

/** Finish bed/desk descent before changing floor destinations. In particular,
 * the sill edge must stay ahead of the floor landing on interruption. */
function departure(cat: CatState): Point[] {
  if (cat.desk && (cat.phase==='keyboard' || cat.phase==='walking' && cat.route.length===1)) {
    return [copy(layout.heroes[cat.desk as keyof typeof layout.heroes])];
  }
  if (cat.phase==='home' && !cat.visit) {
    const bed=catHome(cat); return [...bed.access,bed.exit].map(copy);
  }
  if (cat.phase==='returning' && cat.route.length===1 && Object.values(layout.heroes).some(p=>distance(p,cat.route[0])<1)) return cat.route.map(copy);
  if (isArtWalkable(cat.position)) return [];
  const landing=cat.route.findIndex(isArtWalkable);
  if (landing>=0) return cat.route.slice(0,landing+1).map(copy);
  const bed=catHome(cat); return [...bed.access,bed.exit].map(copy);
}
function bedRoute(cat: CatState, cats: CatState[], prefix: Point[], threat?: Point) {
  const reservations=cats.map(other=>other!==cat && other.phase==='chasing' && other.route.length && distance(other.route.at(-1)!,other.home)<1
    ? {...other,phase:'returning' as const} : other);
  const selected=(threat && nearestFreeBed(cat,reservations,bed=>distance(bed.place,threat)>=150))
    || nearestFreeBed(cat,reservations);
  if (!selected) return false;
  const [id,bed]=selected, from=prefix.at(-1)||cat.position;
  const route=artRoute(from,bed.exit);
  if (!route.length && distance(from,bed.exit)>1) return false;
  cat.bed=id; cat.home=copy(bed.place);
  cat.route=[...prefix,...route,...[...bed.access].reverse().map(copy),copy(bed.place)];
  return true;
}
function release(state: CatHunt,cat: CatState,cats: CatState[]) {
  const hunter=state.hunters.get(cat);
  const prefix=hunter?.phase==='departing' ? cat.route.map(copy) : isArtWalkable(cat.position) ? [] : departure(cat);
  cat.phase='returning'; cat.chaseReturning=true; cat.desk=null;
  bedRoute(cat,cats,prefix);
  state.hunters.delete(cat);
}
export function stopCatHunt(state: CatHunt,cats: CatState[]) {
  state.pointer=null; state.laser=null;
  for (const cat of [...state.hunters.keys()]) release(state,cat,cats);
  state.escaped.clear();
}
function move(cat: CatState,dt: number,speed=210) {
  let budget=Math.max(0,dt)*speed;
  while (cat.route.length && budget>0) {
    const next=cat.route[0], d=distance(cat.position,next), step=Math.min(d,budget);
    if (d) { cat.position.x+=(next.x-cat.position.x)*step/d; cat.position.y+=(next.y-cat.position.y)*step/d; }
    budget-=step;
    if (d<=step+1e-6) cat.route.shift(); else break;
  }
}
const laserStops: Point[]=[{x:610,y:340},{x:665,y:455},{x:590,y:480},{x:760,y:460},{x:605,y:385}];
function advanceLaser(state: CatHunt,dt: number,random: ()=>number) {
  const laser=state.laser!;
  if (!laser.route.length) {
    const index=Math.min(laserStops.length-1,Math.floor(Math.max(0,random())*laserStops.length));
    for (let offset=0;offset<laserStops.length;offset++) {
      const target=laserStops[(index+offset)%laserStops.length];
      if (distance(laser.position,target)<15) continue;
      laser.route=artRoute(laser.position,target); if (laser.route.length) break;
    }
  }
  const dot={position:laser.position,route:laser.route} as CatState;
  move(dot,dt,95);
}

/** The caller advances only cats for which owns(cat) is false through ordinary
 * behavior. This controller reserves its cats before setting phase=chasing. */
export function advanceCatHunt(state: CatHunt,cats: CatState[],dt: number,now: number,options: {random?:()=>number}={}) {
  const random=options.random||Math.random;
  state.clock=now;
  if (state.pointer && now-state.pointerAt>=8) state.pointer=null;
  if (state.laser && now>=state.laser.until) state.laser=null;
  if (state.laser) advanceLaser(state,dt,random);
  const target=state.pointer || state.laser?.position;
  if (!target) { stopCatHunt(state,cats); return; }
  for (const cat of cats) {
    if (!state.hunters.has(cat)) {
      if (cat.visit || cat.chaseReturning || state.escaped.has(cat) || cat.phase==='chasing') continue;
      const prefix=departure(cat);
      cat.route=prefix; cat.desk=null; cat.activity=undefined; cat.activityUntil=undefined;
      if (cat.reaction) cat.reaction.belly=false;
      cat.phase='chasing';
      state.hunters.set(cat,{phase:prefix.length?'departing':'running',until:0,lift:0,frame:'run_1'});
    }
    const hunter=state.hunters.get(cat)!;
    hunter.frame=`run_${Math.floor(now*10)%4+1}`; hunter.lift=0;
    if (hunter.phase==='departing' || hunter.phase==='escaping') {
      if (hunter.phase==='escaping' && now<hunter.until) { hunter.frame='scene_jump'; hunter.lift=Math.max(0,Math.sin(Math.min(1,(now-(hunter.until-.45))/.45)*Math.PI)*18); }
      move(cat,dt);
      if (cat.route.length) continue;
      if (hunter.phase==='escaping') {
        cat.phase='home'; cat.chaseReturning=undefined; state.hunters.delete(cat); state.escaped.add(cat); continue;
      }
      hunter.phase='running';
    }
    const timid=normalizeHeroName(cat.name)==='масяня';
    const fleeing=timid && !(state.laser?.source==='hero' && Math.floor(now/3)%2===0);
    if (fleeing) {
      hunter.phase='running'; hunter.target=undefined;
      if (distance(cat.position,target)<150) {
        const d=distance(cat.position,target)||1, dx=(cat.position.x-target.x)/d, dy=(cat.position.y-target.y)/d;
        const straight={x:cat.position.x+dx*110,y:cat.position.y+dy*110};
        if (isArtWalkable(straight)) cat.route=artRoute(cat.position,straight);
        else {
          // At a wall, use a safe side-step before the nearest unclaimed bed.
          const sides=[1,-1].map(sign=>nearestWalkablePoint({x:cat.position.x-dy*sign*55,y:cat.position.y+dx*sign*55}));
          const side=sides.find(p=>p && distance(p,cat.position)>18 && artRoute(cat.position,p).length);
          const prefix=side ? artRoute(cat.position,side) : [];
          cat.phase='returning';
          if (bedRoute(cat,cats,prefix,target)) { cat.chaseReturning=true; cat.phase='chasing'; hunter.phase='escaping'; hunter.until=now+.45; hunter.frame='scene_jump'; }
          else cat.phase='chasing';
        }
      }
      move(cat,dt); continue;
    }
    if ((hunter.phase==='crouch' || hunter.phase==='jump') && hunter.target && distance(hunter.target,target)>14) {
      hunter.phase='running'; hunter.target=undefined;
    }
    if (hunter.phase==='crouch') {
      hunter.frame='scene_crouch';
      if (now<hunter.until) continue;
      hunter.phase='jump'; hunter.until=now+.4; cat.route=artRoute(cat.position,target);
    }
    if (hunter.phase==='jump') {
      hunter.frame='scene_jump'; hunter.lift=Math.sin(Math.max(0,Math.min(1,1-(hunter.until-now)/.4))*Math.PI)*25;
      move(cat,dt,260);
      if (now>=hunter.until) { hunter.phase='running'; hunter.frame='scene_guilty'; hunter.lift=0; }
      continue;
    }
    if (distance(cat.position,target)<=48) {
      hunter.phase='crouch'; hunter.until=now+.5+random()*.5; hunter.target=copy(target); hunter.frame='scene_crouch'; cat.route=[];
    } else { cat.route=artRoute(cat.position,target); move(cat,dt); }
  }
}
