import { normalizeHeroName } from './heroRegistry';
import { artRoute, isArtWalkable } from './aiOfficeNavigation';
import { catHome, type CatState } from './catBehavior';
import { HUMAN_GAIT, CAT_GAIT } from './heroMotion';
import { isDeskWorking } from './deskSeating';
import type { Point } from './officeLayout';
import type { OwnerActor, OwnerPose } from './ownerFeatures';
import { OFFICE_DOOR, DOOR_FADE_SECONDS } from './officeDoor';

export { OFFICE_DOOR } from './officeDoor';
export const HOME_IDLE_MS = 10*60_000;
export const RUSH_SPEED = HUMAN_GAIT.speed*1.8;
// Owner's orange circle in ref-mattress-spot.jpg, in the registered 960×600 scene.
// Both complete, unrotated source rectangles fit here, above Sanya's chair.
export const MATTRESS_RECT = {x:572,y:325,width:114,height:96};
export const MATTRESS_PLACE = {x:628,y:425};
export const MATTRESS_CATS = [{x:668,y:403},{x:584,y:427}];
export type AttendancePhase = 'present'|'farewell'|'leaving'|'home'|'arriving'|'rushing';
export type Presence = Record<string,'home'|'rushing'>;
export type NightDemo = 'evening'|'night'|'rush'|'mattress';
export interface AttendanceActor extends OwnerActor { away?:boolean; quotaAway?:boolean }
export interface AttendanceSnapshot {
  hour:number;
  actors:readonly {name:string;status:string;idleSince:number;departureAt:number|null;home:boolean}[];
  ownerNight:'awake'|'chair'|'mattress';
}
interface Attendance {
  phase:AttendancePhase; status:string; idleSince:number; due:number; age:number;
  route:Point[]; actor?:AttendanceActor; quotaAbsent:boolean;
  fade?:{direction:'in'|'out';age:number};
}
export type OwnerNightPhase = 'awake'|'chair'|'wake'|'yawn'|'carrying'|'unroll'|'floor'|'roll'|'returning';
const key=(name:string)=>normalizeHeroName(name);
const resident=(name:string)=>['евгений','леха','мотя','jh','коржик','масяня'].includes(key(name));
const allowedRoommate=(name:string)=>resident(name);
export const ownerNight = (hour:number)=>hour>=23||hour<7;
export function onShift(name:string,hour:number) {
  if(resident(name))return true;
  const n=key(name);
  return n==='whoami' ? hour>=12||hour<2 : hour>=9&&hour<(n==='иваныч'?18:19);
}
export function departureDelay(name:string) {
  let seed=0;for(const c of key(name))seed=(Math.imul(seed,31)+c.charCodeAt(0))>>>0;
  return (2+seed%781/60)*60_000; // stable 2…15 minutes; never a synchronized exodus
}
export function mattressFits(rect=MATTRESS_RECT) {
  for(let y=rect.y;y<=rect.y+rect.height;y++)for(let x=rect.x;x<=rect.x+rect.width;x++)if(!isArtWalkable({x,y}))return false;
  return true;
}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const home=(a:OwnerActor)=>({x:a.homeX,y:a.homeY});
function walk(p:Point,route:Point[],dt:number,speed:number) {
  let budget=Math.max(0,dt)*speed;
  while(route.length&&budget>0){const n=route[0],d=distance(p,n),s=Math.min(d,budget);
    if(d){p.x+=(n.x-p.x)*s/d;p.y+=(n.y-p.y)*s/d;}budget-=s;
    if(d<=s+1e-6)route.shift();else break;
  }
}
const female=(name:string)=>['ася','тая','марина'].includes(key(name));

/** Attendance presentation. API working status remains the authority for urgent returns.
 * Wall milliseconds decide idle eligibility; dt advances only animation along real floor routes.
 * Name records survive quota-driven node removal, so a replenished worker enters at the door.
 */
export function createOfficeAttendance(emit:(name:string,message:string)=>void=()=>{},publish:(presence:Presence)=>void=()=>{},options:{authoritative?:boolean}={}) {
  const people=new Map<string,Attendance>(),poses=new Map<OwnerActor,OwnerPose>(),bubbles=new Map<OwnerActor,string>();
  const catRoutes=new Map<CatState,Point[]>();
  let phase:OwnerNightPhase='awake',age=0,ownerRoute:Point[]=[],hold=0,floorAge=0;
  let clock=0,previousRed=false,previousWorking=new Set<string>(),lastPresence='';
  let snapshot:AttendanceSnapshot|undefined;
  let serverActors=new Map<string,AttendanceSnapshot['actors'][number]>();
  const demoInitial=new Map<string,string>();
  let demo:NightDemo|null=null,demoAge=0,demoStarted=false,rushActor:string|undefined;
  let ownerActor:AttendanceActor|undefined;
  const status=(a:OwnerActor)=>demo&&a.apiStatus===demoInitial.get(key(a.appearanceName)) ? (demo==='rush'&&key(a.appearanceName)===rushActor&&demoAge>=2&&demoAge<16?'working':'idle') : options.authoritative ? serverActors.get(key(a.appearanceName))?.status ?? a.apiStatus : a.apiStatus;
  const setPhase=(next:OwnerNightPhase)=>{phase=next;age=0;};
  function wake() {
    hold=20;
    if(phase==='floor'||phase==='unroll'||phase==='carrying'){setPhase('roll');ownerRoute=[];}
    else if(phase==='chair')setPhase('wake');
  }
  function catPath(c:CatState,target:Point) {
    const bed=catHome(c);
    const prefix=isArtWalkable(c.position)?[]:c.desk?c.route.filter(isArtWalkable).slice(0,1):[...bed.access,bed.exit];
    return [...prefix,...artRoute(prefix.at(-1)??c.position,target)];
  }
  function returnCats(all:AttendanceActor[],dt:number) {
    for(const a of all)if(a.cat&&catRoutes.has(a.cat)){
      const c=a.cat,bed=catHome(c);let route=catRoutes.get(c)!;
      if(distance(route.at(-1)??c.position,bed.place)>1){route=[...catPath(c,bed.exit),...[...bed.access].reverse(),{...bed.place}];catRoutes.set(c,route);}
      c.desk=null;c.visit=undefined;c.activity=undefined;c.phase='returning';walk(c.position,route,dt,CAT_GAIT.speed);Object.assign(a.container,c.position);
      if(!route.length){c.phase='home';c.route=[];catRoutes.delete(c);}
    }
  }
  function resetOwner(all:AttendanceActor[]) {
    if(ownerActor&&phase!=='awake'&&phase!=='chair')Object.assign(ownerActor.container,home(ownerActor));
    setPhase('awake');ownerRoute=[];hold=0;floorAge=0;
    for(const a of all)if(a.cat&&catRoutes.has(a.cat)){const c=a.cat,bed=catHome(c);c.position={...bed.place};Object.assign(a.container,c.position);c.phase='home';c.route=[];c.desk=null;}
    catRoutes.clear();poses.clear();bubbles.clear();
  }
  function launch(mode:NightDemo,all:AttendanceActor[],targetName?:string) {
    reset(all);demo=mode;demoInitial.clear();all.forEach(a=>demoInitial.set(key(a.appearanceName),a.apiStatus));demoAge=0;demoStarted=false;
    rushActor=all.find(a=>key(a.appearanceName)===key(targetName??'Ася'))?.appearanceName;
    if(!rushActor)rushActor=all.find(a=>!a.cat&&!resident(a.appearanceName))?.appearanceName;
    if(rushActor)rushActor=key(rushActor);
  }
  function reset(all:AttendanceActor[], preservePresence=false) {
    const wasDemo=!!demo;
    demo=null;demoStarted=false;resetOwner(all);
    // Unrelated shared scenes and reconnect repair must not bring home workers
    // back to their desks or discard a departure already walking to the door.
    if(preservePresence&&!wasDemo)return;
    for(const a of all){a.away=false;if(!a.cat)Object.assign(a.container,home(a));}
    people.clear();previousWorking.clear();lastPresence='';publish({});
  }
  /** Apply server eligibility without restarting departure/return animations on every poll. */
  function applySnapshot(value:AttendanceSnapshot,all:AttendanceActor[]) {
    snapshot=value;serverActors=new Map(value.actors.map(actor=>[key(actor.name),actor]));
    if(!options.authoritative||demo)return;
    for(const a of all){
      const name=key(a.appearanceName),source=serverActors.get(name);if(a.cat||!source)continue;
      let s=people.get(name);
      const initial=!s;
      if(!s){s={phase:'present',status:source.status,idleSince:source.idleSince,due:source.departureAt??Infinity,age:0,route:[],actor:a,quotaAbsent:false};people.set(name,s);}
      s.status=source.status;s.idleSince=source.idleSince;s.due=source.departureAt??Infinity;
      if(initial&&source.home){
        s.phase='home';s.route=[];s.age=0;s.fade=undefined;a.away=true;Object.assign(a.container,OFFICE_DOOR);
      }
    }
  }
  function tick(all:AttendanceActor[],dt:number,now:number,hour:number,red:boolean,paused=false) {
    demoAge+=dt;if(demo)now=demoAge*1000;clock=now;age+=dt;hold=Math.max(0,hold-dt);poses.clear();bubbles.clear();
    if(demo)hour=demo==='evening'?20:0;
    else if(options.authoritative&&snapshot)hour=snapshot.hour;
    const living=all.filter(a=>!a.cat);
    const presentKeys=new Set(living.map(a=>key(a.appearanceName)));
    for(const [name,s]of people)if(!presentKeys.has(name)){s.quotaAbsent=true;s.phase='home';s.actor=undefined;}
    const working=new Set(living.filter(a=>isDeskWorking(status(a))).map(a=>key(a.appearanceName)));
    const urgent=[...working].some(n=>!previousWorking.has(n));
    previousWorking=working;
    const alarm=urgent||red&&!previousRed;previousRed=red;
    for(const a of living){
      const name=key(a.appearanceName);let s=people.get(name);
      if(!s){s={phase:'present',status:status(a),idleSince:now,due:Infinity,age:0,route:[],actor:a,quotaAbsent:false};people.set(name,s);}
      const replaced=s.actor!==a;
      if(replaced){s.actor=a;if(s.quotaAbsent){s.phase='home';s.fade=undefined;a.away=true;Object.assign(a.container,OFFICE_DOOR);}s.quotaAbsent=false;}
      const active=isDeskWorking(status(a));
      const quota=!!a.quotaAway;
      const authoritative=options.authoritative&&!demo;
      const source=authoritative?serverActors.get(name):undefined;
      if(authoritative){
        s.status=status(a);s.idleSince=source?.idleSince??now;s.due=source?.departureAt??Infinity;
      } else {
        if(s.status!==status(a)){s.status=status(a);s.idleSince=now;s.due=Infinity;}
        if(active){s.idleSince=now;s.due=Infinity;}
      }
      s.age+=dt;
      if(demo&&!demoStarted&&!resident(name)){
        if(demo==='evening'){s.idleSince=now-HOME_IDLE_MS;s.due=now+1+departureDelay(name)/60;}
        else if(demo==='night'&&name==='марина'){s.phase='present';Object.assign(a.container,home(a));}
        else{s.phase='home';a.away=true;Object.assign(a.container,OFFICE_DOOR);}
      }
      if(resident(name)&&!quota&&!(name==='леха'&&['home','arriving','rushing','leaving','farewell'].includes(s.phase))){a.away=false;s.phase='present';if(name==='леха'&&ownerNight(hour)&&!active)poses.set(a,{seated:true,thinking:false});continue;}
      if(paused)continue;
      const scheduled=!quota&&(authoritative?!!source&&!source.home&&source.departureAt===null:name==='леха'||onShift(name,hour)&&(!demo||demo==='evening'));
      if(scheduled&&!authoritative)s.due=Infinity;
      if((s.phase==='home'||s.phase==='leaving'||s.phase==='farewell')&&!quota&&(active||scheduled)){
        const fromHome=s.phase==='home';
        if(fromHome)Object.assign(a.container,OFFICE_DOOR);
        a.away=false;s.phase=active?'rushing':'arriving';s.age=0;s.route=artRoute(a.container,home(a));
        s.fade=fromHome?{direction:'in',age:0}:undefined;
        if(active)emit(a.appearanceName,`🏃 ${a.appearanceName} срочно ${female(name)?'примчалась':'примчался'} на работу`);
      }
      if(quota&&['arriving','rushing'].includes(s.phase)){s.phase='present';s.fade=undefined;}
      if(s.phase==='present'&&(quota||!resident(name)&&(authoritative?!!source&&(source.home||source.departureAt!==null):!onShift(name,hour)))&&(quota||!active)){
        if(quota||source?.home)s.due=now;
        if(!authoritative&&!Number.isFinite(s.due))s.due=Math.max(now,s.idleSince+HOME_IDLE_MS)+departureDelay(name);
        if(now>=s.due){s.phase='farewell';s.age=0;s.route=[];a.seating.progress=0;}
      }
      if(s.phase==='farewell'){
        poses.set(a,{frame:'cup',seated:false});bubbles.set(a,'👋 До завтра');
        if(s.age>=1.4){s.route=artRoute(a.container,OFFICE_DOOR);s.phase='leaving';s.age=0;}
      }
      if(['leaving','arriving','rushing'].includes(s.phase)){
        const target=s.phase==='leaving'?OFFICE_DOOR:home(a);
        let travelDt=dt;
        if(s.fade?.direction==='in'){
          travelDt=Math.max(0,dt-(DOOR_FADE_SECONDS-s.fade.age));
          s.fade.age=Math.min(DOOR_FADE_SECONDS,s.fade.age+dt);
          if(s.fade.age>=DOOR_FADE_SECONDS-1e-9)s.fade=undefined;
        }
        if(!s.route.length&&distance(a.container,target)>1)s.route=artRoute(a.container,target);
        walk(a.container,s.route,travelDt,s.phase==='rushing'?RUSH_SPEED:HUMAN_GAIT.speed);
        poses.set(a,{frame:'walk',seated:false});a.seating.progress=0;
        if(s.phase==='rushing')bubbles.set(a,'💨 💧');
        if(s.phase==='leaving'&&s.age<3)bubbles.set(a,'👋 До завтра');
        if(!s.route.length&&distance(a.container,target)<1){
          if(s.phase==='leaving'){
            // No open-door art frame: fade only after the feet reach the jamb.
            if(!s.fade)s.fade={direction:'out',age:0};
            else s.fade.age=Math.min(DOOR_FADE_SECONDS,s.fade.age+dt);
            poses.set(a,{frame:'cup',seated:false});
            if(s.fade.age>=DOOR_FADE_SECONDS-1e-9){s.phase='home';s.fade=undefined;a.away=true;emit(a.appearanceName,`🚪 ${a.appearanceName} ${female(name)?'ушла':'ушёл'} домой`);}
          }
          else{s.phase='present';a.moveState='SITTING';s.due=Infinity;}
        }
      }
      a.away=s.phase==='home';
    }
    demoStarted=!!demo;
    const presence:Presence={};for(const [name,s]of people)if(s.actor&&!s.quotaAbsent){if(s.phase==='home')presence[name]='home';if(s.phase==='rushing')presence[name]='rushing';}
    const encoded=JSON.stringify(presence);if(encoded!==lastPresence){lastPresence=encoded;publish(presence);}
    const e=living.find(a=>key(a.appearanceName)==='евгений');ownerActor=e;
    if(!e)return;
    if(paused){resetOwner(all);return;}
    if(alarm||isDeskWorking(status(e)))wake();
    const authoritative=options.authoritative&&!demo;
    const night=(authoritative?!!snapshot&&snapshot.ownerNight!=='awake':ownerNight(hour))&&!isDeskWorking(status(e));
    const privateRoom=!living.some(a=>a!==e&&!a.away&&!allowedRoommate(a.appearanceName));
    const floorAllowed=night&&(authoritative?snapshot?.ownerNight==='mattress':privateRoom&&demo!=='night')&&hold===0&&!red;
    if(['floor','unroll','carrying'].includes(phase)&&!floorAllowed){setPhase('roll');ownerRoute=[];}
    if(!night&&phase==='chair')setPhase('yawn');
    if(phase==='awake'&&night&&hold===0)setPhase(floorAllowed?'carrying':'chair');
    if(phase==='chair'&&floorAllowed)setPhase('carrying');
    if(phase==='carrying'){
      if(!ownerRoute.length&&distance(e.container,MATTRESS_PLACE)>1)ownerRoute=artRoute(e.container,MATTRESS_PLACE);
      walk(e.container,ownerRoute,dt,95);poses.set(e,{frame:'walk',seated:false});
      if(!ownerRoute.length&&distance(e.container,MATTRESS_PLACE)<1)setPhase('unroll');
    }
    if(phase==='unroll'&&age+1e-6>=.8){setPhase('floor');floorAge=0;emit(e.appearanceName,'🛏 Евгений лёг на матрас');}
    if(phase==='floor'){
      floorAge+=dt;poses.set(e,{seated:false});bubbles.set(e,'💤');
      if(floorAge>8)all.filter(a=>a.cat).forEach((a,i)=>{
        const c=a.cat!;if(!catRoutes.has(c)){catRoutes.set(c,catPath(c,MATTRESS_CATS[i%2]));c.desk=null;c.visit=undefined;c.activity=undefined;c.route=[];}
        const route=catRoutes.get(c)!;walk(c.position,route,dt,CAT_GAIT.speed);Object.assign(a.container,c.position);c.phase=route.length?'walking':'home';
      });
    } else returnCats(all,dt);
    if(phase==='roll'){
      bubbles.set(e,'❗');poses.set(e,{seated:false});
      if(age+1e-6>=.8){ownerRoute=artRoute(e.container,home(e));setPhase('returning');}
    }
    if(phase==='returning'){
      walk(e.container,ownerRoute,dt,180);poses.set(e,{frame:'walk',seated:false});
      if(!ownerRoute.length&&distance(e.container,home(e))<1){setPhase('yawn');hold=Math.max(hold,2);e.moveState='SITTING';}
    }
    if(phase==='wake'){poses.set(e,{frame:'owner_wake',seated:true});bubbles.set(e,'❗');if(age>=.65)setPhase('yawn');}
    if(phase==='yawn'){poses.set(e,{frame:'owner_yawn',seated:true});if(age>=1.4)setPhase('awake');}
    if(phase==='chair'){poses.set(e,{frame:Math.floor(age/6)%2?'owner_sleep_back':'owner_sleep_forward',seated:true});bubbles.set(e,'💤');}
    if(phase==='awake'&&night){poses.set(e,{seated:true,thinking:true});}
  }
  return {tick,launch,reset,wake,applySnapshot,poses,bubbles,status,people,catRoutes,
    opacity(a:OwnerActor){const s=people.get(key(a.appearanceName));return s?.phase==='home'?0:s?.fade?s.fade.direction==='in'?s.fade.age/DOOR_FADE_SECONDS:1-s.fade.age/DOOR_FADE_SECONDS:1;},
    arrive(name:string,all:AttendanceActor[]){
      const a=all.find(a=>key(a.appearanceName)===key(name)),s=people.get(key(name));
      if(!a||!s)return;
      s.phase='home';s.route=[];s.age=0;s.fade=undefined;a.away=true;Object.assign(a.container,OFFICE_DOOR);
    },
    markAbsent(name:string){const n=key(name);if(!people.has(n))people.set(n,{phase:'home',status:'idle',idleSince:clock,due:Infinity,age:0,route:[],quotaAbsent:true});},
    get demo(){return demo;},get phase(){return phase;},get phaseAge(){return age;},
    get mattress(){return phase==='floor';},get floorFrame(){return Math.floor(floorAge/7)%2?'side':'back';},
    get sleep(){return phase==='chair'||phase==='floor';},
    owns(a:OwnerActor){return poses.has(a)||!!(a as AttendanceActor).away;},
    ownsCat(c:CatState){return catRoutes.has(c);},
    get carrying(){return phase==='carrying'||phase==='returning';},
    get rolled(){return phase==='unroll'||phase==='roll';},
    get now(){return clock;},
  };
}
