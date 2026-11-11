import layout from '../../../office-art/layout-ai.json';
import { normalizeHeroName } from './heroRegistry';

/** Wheel contact calibrated from the typing wrists to the v8 desktop band.
 * Navigation feet remain separate, on the walkable floor. */
export const DESK_SEATS: Record<string, {x:number; y:number}> = {
  'ярик': {x:462,y:355}, 'леха': {x:271,y:522}, 'ася': {x:122,y:528},
  'иваныч': {x:145,y:354}, 'тая': {x:306,y:351}, 'whoami': {x:465,y:520},
  'евгений': {x:815,y:279}, 'марина': {x:752,y:435},
};
export const deskSeat = (name: string) => DESK_SEATS[normalizeHeroName(name)];
export const deskSeatScale = (name:string) => normalizeHeroName(name)==='иваныч' ? 1.15 : 1.12;
export const isDeskWorking = (status: string) => ['working','thinking','busy'].includes(status);
export interface DeskSeating {
  phase: 'standing' | 'lowering' | 'seated' | 'rising';
  progress: number; nextThink: number; thinkUntil: number;
  idlePoseUntil: number; idleThink: boolean;
  wasWorking: boolean;
}
const between = (min:number,max:number,random:()=>number) => min+random()*(max-min);
export function createDeskSeating(random=Math.random): DeskSeating {
  return {phase:'standing',progress:0,nextThink:between(30,90,random),thinkUntil:0,
    idlePoseUntil:0,idleThink:false,wasWorking:false};
}
/** Explicit posture, independent of the historical SITTING movement state (= home).
 * Cat clearance gates lowering; returning workers reserve the keyboard earlier. */
export function advanceDeskSeating(life:DeskSeating, name:string, status:string, atHome:boolean,
  now:number, dt:number, catClear=true, random=Math.random) {
  const working=isDeskWorking(status);
  if (life.wasWorking && !working) {
    life.thinkUntil=0; life.idlePoseUntil=0;
  }
  life.wasWorking=working;
  const wants=atHome && (working || status==='idle');
  if (wants && catClear) life.progress=Math.min(1,life.progress+dt/.45);
  else life.progress=Math.max(0,life.progress-dt/.35);
  life.phase=life.progress===1?'seated':life.progress===0?'standing':wants&&catClear?'lowering':'rising';
  if (working) {
    if (now>=life.nextThink && life.phase==='seated') {
      life.thinkUntil=now+between(2,4,random); life.nextThink=now+between(30,90,random);
    }
  } else if (now>=life.idlePoseUntil) {
    life.idleThink=!life.idleThink; life.idlePoseUntil=now+between(6,14,random);
  }
  return {seated:life.progress>0, progress:life.progress,
    thinking:working ? now<life.thinkUntil : life.idleThink,
    reclining:!working && !life.idleThink};
}
/** Scene adapter; the shared workstation predicate adds the physical desk zone. */
export function deskPresence(name:string, status:string, seating:DeskSeating, returning:boolean) {
  return {seated:seating.progress>0, returningToWork:returning, absent:status==='offline'};
}
export const seatedKeyboard = (name:string) => Object.entries(layout.keyboards)
  .find(([key])=>normalizeHeroName(key)===normalizeHeroName(name))?.[1];
