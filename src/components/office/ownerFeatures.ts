import { artRoute, isArtWalkable, artFootprintsOverlap } from './aiOfficeNavigation';
import { nearestWalkablePoint } from './catHunt';
import { catHome, type CatState } from './catBehavior';
import type { Point } from './officeLayout';
import type { OfficeDcmSignal } from '../../lib/officeDcm';
import { OFFICE_DOOR, DOOR_FADE_SECONDS } from './officeDoor';

export const OWNER_SCENES = ['breaker','standup','pizza','rounds','short','review'] as const;
export type OwnerScene = typeof OWNER_SCENES[number];
// Measured painted objects in CHOICE.json → office-v8-sanya-merged.png,
// registered to background.rendered_rect [0,32,960,536]. Includes open cabinet door.
export const OWNER_FIXTURES = {
  breaker: {x:98,y:58,width:123,height:165},
  standup: {x:226,y:70,width:132,height:93},
} as const;
/** Use the same 4px cells as artRoute, never a desktop or a visual sprite anchor. */
export function ownerFixtureApproach(rect:{x:number;y:number;width:number;height:number}):Point {
  const center={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
  const cells:Point[]=[];
  for(let y=0;y<=600;y+=4)for(let x=0;x<=960;x+=4){const p={x,y};if(y>rect.y+rect.height&&isArtWalkable(p))cells.push(p);}
  cells.sort((a,b)=>distance(a,center)-distance(b,center)||Math.abs(a.x-center.x)-Math.abs(b.x-center.x));
  return cells[0];
}
export const OWNER_PLACES = {
  breaker:ownerFixtureApproach(OWNER_FIXTURES.breaker), standup:ownerFixtureApproach(OWNER_FIXTURES.standup), door:OFFICE_DOOR, pizza:{x:875,y:466},
  review:{x:765,y:280}, reviewChair:{x:765,y:279},
};
export interface OwnerActor {
  appearanceName:string; container:Point; homeX:number; homeY:number; apiStatus:string; cat?:CatState;
  quiet?:boolean; moveState:string; seating:{progress:number};
}
export interface OwnerPose { opacity?:number; gaze?:Point; chewing?:boolean; frame?:string; seated?:boolean; thinking?:boolean; facing?:-1|1; seat?:Point; shake?:number; lift?:number; working?:boolean }
type Stage = { enter?:()=>void; move?:Map<OwnerActor,Point[]>; duration?:number; tick?:(age:number)=>void; ready?:()=>boolean };
function distance(a:Point,b:Point){return Math.hypot(a.x-b.x,a.y-b.y);}
const copy=(p:Point):Point=>({x:p.x,y:p.y});
export function ownerFloor(preferred:Point, occupied:readonly Point[]=[]):Point {
  const point=nearestWalkablePoint(preferred)!;
  if(!occupied.some(p=>artFootprintsOverlap(p,point)))return point;
  // Search the entire connected floor, preserving elliptical foot clearance.
  const candidates:Point[]=[];
  for(let y=280;y<=552;y+=4)for(let x=66;x<=895;x+=4){const p={x,y};if(isArtWalkable(p)&&!occupied.some(o=>artFootprintsOverlap(o,p)))candidates.push(p);}
  return candidates.sort((a,b)=>distance(a,preferred)-distance(b,preferred))[0] || point;
}

/** Shared scheduler: enqueue through the director, never create a second scene queue. */
export function createOwnerSchedule(stream:boolean, random=Math.random) {
  const range=(a:number,b:number)=>60*(a+random()*(b-a));
  const intervals=()=>({breaker:stream?range(15,25):range(60,120),standup:range(30,60),pizza:range(60,120),rounds:range(40,90),short:stream?range(20,40):range(60,180)});
  const due=intervals();let date='',seen:string|null|undefined,lastPizza=-Infinity;
  return {
    due,
    restorePizza(value:number){if(Number.isFinite(value))lastPizza=value;},
    tick(now:number,clock:Date,signal:OfficeDcmSignal|null,enqueue:(scene:OwnerScene)=>void,atBench=true) {
      const next=intervals();
      for(const key of ['breaker','rounds','short',...(stream?['standup','pizza']:[])] as (keyof typeof due)[]){
        if(now>=due[key] && (key!=='short'||atBench)){enqueue(key);due[key]=now+next[key];}
      }
      const today=`${clock.getFullYear()}-${clock.getMonth()}-${clock.getDate()}`;
      if(!stream&&clock.getHours()===10&&clock.getMinutes()===0&&date!==today){date=today;enqueue('standup');}
      const r=signal?.regression;
      const id=r?.recordId??r?.timestamp??null;
      if(seen===undefined){if(signal)seen=id;return;}
      if(id&&id!==seen){seen=id;if(r?.status==='pass'&&r.fresh&&r.green&&r.new&&clock.getTime()-lastPizza>=3*3600_000){lastPizza=clock.getTime();enqueue('pizza');}}
    },
    get lastPizza(){return lastPizza;},
  };
}

/** Scene simulation uses only templates, positions and public regression status. */
export function createOwnerFeatures(emit:(message:string)=>void=()=>{}) {
  let actors:OwnerActor[]=[],scene:OwnerScene|null=null,stages:Stage[]=[],index=0,age=0,entered=false;
  const poses=new Map<OwnerActor,OwnerPose>(),bubbles=new Map<OwnerActor,string>();
  let snapshots=new Map<OwnerActor,Point>();
  let dark=0,pizza:'closed'|'open'|'last'|null=null,spark=0,smoke=0,reviewClock=0;
  let reviewing=false,reviewMoving:false|'out'|'back'=false,reviewRoute:Point[]=[],reviewAge=0,reviewSettle=0;
  let demoReview=false,clock=0,pizzaCount=0;
  let pizzaPhase:'closed'|'serving'|'eating'|'last'|null=null;
  const slices=new Map<OwnerActor,{expiresAt:number;eating:boolean}>(),served=new Set<OwnerActor>();
  const owner=()=>humans().find(a=>a.appearanceName==='Евгений');
  const ivanych=()=>humans().find(a=>a.appearanceName==='Иваныч');
  const humans=()=>actors.filter(a=>!a.cat&&!a.quiet&&a.apiStatus!=='offline');
  const atHome=(a:OwnerActor)=>distance(a.container,{x:a.homeX,y:a.homeY})<3;
  const isSeated=(a:OwnerActor)=>a.seating.progress>0||atHome(a)&&a.moveState==='SITTING';
  const say=(a:OwnerActor|undefined,value:string)=>{if(a)bubbles.set(a,value);};
  const pose=(a:OwnerActor|undefined,value:OwnerPose)=>{if(a)poses.set(a,value);};
  const blockers=(actor:OwnerActor)=>humans().filter(a=>a!==actor&&!(poses.get(a)?.seated??isSeated(a))).map(a=>a.container);
  const plan=(entries:[OwnerActor|undefined,Point][],duration=0,exact=false):Stage=>({duration,
    ready:exact?()=>entries.every(([a,p])=>!a||distance(a.container,p)<1):undefined,
    tick:exact?()=>{for(const [a,p]of entries)if(a&&!stages[index].move?.get(a)?.length&&distance(a.container,p)>=1)stages[index].move?.set(a,artRoute(a.container,p,blockers(a)));}:undefined,
    enter(){
    const planned=new Map<OwnerActor,Point[]>();
    for(const [actor,target] of entries){if(!actor)continue;
      const route=artRoute(actor.container,target,blockers(actor));
      if(!exact&&!route.length&&distance(actor.container,target)>1){
        const alternative=ownerFloor(target,blockers(actor));route.push(...artRoute(actor.container,alternative,blockers(actor)));
      }
      planned.set(actor,route);pose(actor,{frame:'walk',seated:false});
    }
    stages[index].move=planned;
  }});
  const hold=(duration:number,enter?:()=>void,tick?:(age:number)=>void):Stage=>({duration,enter,tick});
  function move(actor:OwnerActor,route:Point[],dt:number,speed=95) {
    let budget=dt*speed;
    while(route.length&&budget>0){const p=route[0],d=distance(actor.container,p),s=Math.min(d,budget);
      if(d){const candidate={x:actor.container.x+(p.x-actor.container.x)*s/d,y:actor.container.y+(p.y-actor.container.y)*s/d};
        if(!actor.cat&&blockers(actor).some(b=>artFootprintsOverlap(b,candidate))){const target=route.at(-1)!;const next=artRoute(actor.container,target,blockers(actor));if(next.length)route.splice(0,route.length,...next);return;}
        const facing=p.x<actor.container.x?-1:1;actor.container.x=candidate.x;actor.container.y=candidate.y;pose(actor,{...poses.get(actor),facing});}
      if(actor.cat)actor.cat.position=copy(actor.container);
      budget-=s;if(d<=s+1e-6)route.shift();else break;
    }
  }
  function stop(){
    for(const [a,p]of snapshots){a.container.x=p.x;a.container.y=p.y;if(a.cat){a.cat.position=copy(p);}}
    snapshots.clear();scene=null;stages=[];poses.clear();bubbles.clear();dark=0;pizza=null;spark=smoke=0;demoReview=false;pizzaPhase=null;slices.clear();served.clear();
  }
  function launch(mode:OwnerScene,all:OwnerActor[],red=false) {
    if(scene)throw new Error('Сценка уже идёт');actors=all;
    const e=owner(),i=ivanych();if(!e)throw new Error('Евгения сейчас нет в офисе');
    if((mode==='short'||mode==='review')&&!i)throw new Error('Иваныча сейчас нет в офисе');
    snapshots=new Map(actors.map(a=>[a,copy(a.container)]));
    if(mode==='rounds')snapshots.set(e,{x:e.homeX,y:e.homeY});
    scene=mode;index=age=0;entered=false;slices.clear();served.clear();
    poses.clear();bubbles.clear();
    for(const a of humans())pose(a,{seated:isSeated(a)||a.appearanceName==='Саня',thinking:true,...(reviewing&&a===i?{seat:OWNER_PLACES.reviewChair}:{})});
    const blackout=()=>{dark=.8;for(const a of humans())say(a,'😱');};
    const cats=actors.filter(a=>a.cat);
    const retreatCats=():Stage=>({enter(){const paths=new Map<OwnerActor,Point[]>();for(const a of cats){
      const c=a.cat!,bed=catHome(c);const prefix:Point[]=[];
      if(!isArtWalkable(c.position)&&distance(c.position,bed.place)>1){prefix.splice(0,prefix.length,...(c.desk?[{x:actors.find(n=>n.appearanceName===c.desk)?.homeX??a.homeX,y:actors.find(n=>n.appearanceName===c.desk)?.homeY??a.homeY}]:c.route.filter(isArtWalkable).slice(0,1)));}
      const from=prefix.at(-1)||c.position;
      paths.set(a,distance(c.position,bed.place)<1?[]:[...prefix,...artRoute(from,bed.exit),...[...bed.access].reverse(),copy(bed.place)]);
    }stages[index].move=paths;},duration:0});
    const restore=()=>{
      // Walk home before restoring the exact paused state. Cat climbs are the
      // only intentional waypoints outside the human floor mesh.
      if(mode==='review'&&i){
        stages.push({...plan([[i,snapshots.get(i)!]]),tick(t){pose(i,{frame:`chair_walk_${Math.floor(t*4)%2+1}`,seated:false});}},
          hold(1.6,()=>{say(i,'Эх…');},t=>{pose(i,{frame:t<.8?'chair_place':'chair_rest',seated:false});}));
      }
      const s:Stage=plan(humans().filter(a=>mode!=='review'||a!==i).map(a=>[a,snapshots.get(a)!]));
      stages.push(s,hold(.1,()=>{stop();}));
    };
    if(mode==='breaker'||mode==='short'||mode==='standup'||mode==='pizza'){
      const target=mode==='pizza'?OFFICE_DOOR:mode==='standup'?OWNER_PLACES.standup:OWNER_PLACES.breaker;
      const reserved:Point[]=[target];
      for(const a of humans().filter(a=>a!==e&&!isSeated(a)&&artFootprintsOverlap(a.container,target))){
        const safe=ownerFloor({x:620,y:410},[...reserved,...blockers(a)]);reserved.push(safe);stages.push(plan([[a,safe]]));
      }
    }
    if(mode==='breaker'||mode==='short'){
      if(mode==='short'){
        if(reviewing||reviewMoving){reviewing=false;reviewMoving=false;reviewRoute=[];snapshots.set(i!,{x:i!.homeX,y:i!.homeY});}
        stages.push(plan([[i!,{x:i!.homeX,y:i!.homeY}]]),hold(1.8,()=>{pose(i,{seated:true,thinking:false,working:true});}),
          hold(.2,()=>{spark=1;say(i,'⚡ Ай!');pose(i,{seated:true,shake:2});}),hold(.5,blackout,()=>{pose(i,{seated:true,shake:2});smoke=1;}),hold(.01,()=>pose(i,{seated:true,thinking:true})),retreatCats());
      }
      stages.push(plan([[e,OWNER_PLACES.breaker]]),hold(.8,()=>{pose(e,{frame:'owner_breaker',facing:1,seated:false,gaze:{x:159.5,y:140.5}});}));
      if(mode==='breaker'){const retreat=retreatCats();const enter=retreat.enter;stages.push({...retreat,duration:2.5,enter(){blackout();enter?.();}});}
      stages.push(hold(.3,()=>{bubbles.clear();},t=>{dark=.8*Math.max(0,1-t/.3);}),hold(2.7,()=>{
        dark=0;pose(e,{frame:'owner_shrug',seated:false});say(e,mode==='short'?'Иваныч, опять?!':'Проверка УЗО пройдена ✅');
        if(mode==='short')say(i,'Я проверял фазу… 🤓');emit(mode==='short'?'⚡ Иваныч поймал КЗ. ГИП поднял автоматы':'⚡ Евгений проверил УЗО. Офис выжил');
      }));
    } else if(mode==='standup'){
      const spot=OWNER_PLACES.standup;
      stages.push(hold(1.4,()=>{pose(e,{frame:'owner_clap',seated:false});say(e,'👏 Планёрка!');}),plan([[e,spot]]));
      const reserved=[spot];
      const guests=humans().filter(a=>a!==e&&a.appearanceName!=='Саня'&&!isSeated(a));
      for(const a of guests){const target=ownerFloor({x:620,y:330+reserved.length*30},reserved);reserved.push(target);stages.push(plan([[a,target]]));}
      stages.push(hold(12,()=>{bubbles.clear();pose(e,{frame:'owner_point_back',seated:false,facing:1,gaze:{x:292,y:116.5}});},t=>{
        humans().filter(a=>a!==e).forEach((a,n)=>{pose(a,{...poses.get(a),thinking:true,...(!isSeated(a)&&a.appearanceName!=='Саня'?{frame:'cup',facing:-1 as const}:{})});if(Math.floor(t*1.3)%humans().length===n)say(a,['👍','🤔','📝'][n%3]);else bubbles.delete(a);});
      }));
    } else if(mode==='pizza'){
      const guests=humans().filter(a=>a!==e);
      const pickup={x:812,y:468},reserved:Point[]=[OWNER_PLACES.pizza,pickup];
      const seated=new Set(guests.filter(isSeated));
      // Reserve desk destinations first, so walkers cannot eat in their exits.
      for(const a of seated)reserved.push({x:a.homeX,y:a.homeY});
      const destinations=new Map<OwnerActor,Point>();
      const spread=(preferred:Point)=>{
        const candidates:Point[]=[];
        for(let y=280;y<=552;y+=4)for(let x=68;x<=892;x+=4){const p={x,y};
          if(isArtWalkable(p)&&reserved.every(o=>distance(o,p)>=85))candidates.push(p);}
        const p=candidates.sort((a,b)=>distance(a,preferred)-distance(b,preferred))[0];
        if(!p)throw new Error('Нет свободного места для пиццы');reserved.push(p);return p;
      };
      for(const a of guests)destinations.set(a,seated.has(a)?{x:a.homeX,y:a.homeY}:spread(snapshots.get(a)!));
      const ownerEating=spread({x:650,y:464});
      const give=(a:OwnerActor)=>{served.add(a);slices.set(a,{expiresAt:Infinity,eating:false});say(a,'🍕 спасибо!');};
      const eat=(a:OwnerActor)=>{
        const slice=slices.get(a);if(slice){slice.eating=true;slice.expiresAt=clock+20;}
        pose(a,{seated:seated.has(a),thinking:true,chewing:true,...(a===e?{frame:'owner_eat',seated:false}:{})});
      };
      stages.push(plan([[e,OFFICE_DOOR]],0,true),
        hold(DOOR_FADE_SECONDS,undefined,t=>pose(e,{frame:'cup',seated:false,opacity:Math.max(0,1-t/DOOR_FADE_SECONDS)})),
        hold(.5,()=>pose(e,{seated:false,opacity:0})),
        hold(DOOR_FADE_SECONDS,undefined,t=>pose(e,{frame:'owner_pizza',facing:1,seated:false,opacity:Math.min(1,t/DOOR_FADE_SECONDS)})),
        {...plan([[e,OWNER_PLACES.pizza]]),tick(){pose(e,{frame:'owner_pizza',seated:false,facing:1});}},
        hold(1,()=>{pizza='closed';pizzaPhase='closed';pose(e,{frame:'cup',seated:false});}),
        hold(1,()=>{pizza='open';pizzaPhase='serving';pizzaCount++;emit('🍕 Зелёная регрессия — пицца за счёт ГИПа');}));
      // One customer at a time: receive a visible slice, then clear the counter.
      for(const a of guests)stages.push(plan([[a,pickup]]),hold(.65,()=>give(a)),
        plan([[a,destinations.get(a)!]]),hold(.1,()=>{bubbles.delete(a);eat(a);}));
      stages.push(hold(.7,()=>give(e)),plan([[e,ownerEating]]),hold(20,()=>{bubbles.clear();eat(e);pizzaPhase='eating';},t=>{
        // Only one cat circles the box. The other keeps its paused position.
        const cat=cats[0];if(!cat)return;
        if(!stages[index].move){const c=cat.cat!,bed=catHome(c);
          const from=isArtWalkable(cat.container)?cat.container:bed.exit;
          stages[index].move=new Map([[cat,[...(isArtWalkable(cat.container)?[]:[...bed.access,bed.exit]),...artRoute(from,{x:878,y:484})]]]);}
        pose(cat,{frame:t>4&&t<5.2?'scene_jump':'walk',lift:t>4&&t<5.2?Math.sin((t-4)/1.2*Math.PI)*20:0});
        if(t>4&&t<5.2)say(e,'Брысь!');else bubbles.delete(e);
        if(t>6&&t<16&&!stages[index].move?.get(cat)?.length)
          stages[index].move=new Map([[cat,artRoute(cat.container,{x:Math.floor(t)%2?868:878,y:Math.floor(t)%2?475:486})]]);
      }),hold(1.5,()=>{pizza='last';pizzaPhase='last';bubbles.clear();slices.clear();}));
      // Preserve OFFICE-23's final-slice joke, then restore the paused office.
      if(i)stages.push(plan([[i,pickup]]),hold(2.5,()=>{say(i,'Не пропадать же');pizza=null;}));
      stages.push(retreatCats());
    } else if(mode==='rounds'){
      for(const a of humans().filter(a=>a!==e&&(isSeated(a)||a.appearanceName==='Саня'))){
        const target=ownerFloor({x:a.homeX+45,y:a.homeY+8});
        stages.push(plan([[e,target]]),hold(2.5,()=>{
          bubbles.clear();const skeptical=red&&['Саня','Лёха'].includes(a.appearanceName);
          pose(e,{frame:skeptical?'owner_skeptic':'owner_peek',seated:false});say(e,skeptical?'🤨':['working','thinking','busy'].includes(a.apiStatus)?'👍':'☕?');
        }));
      }
    } else if(mode==='review'){
      demoReview=true;
      stages.push(plan([[e,{x:e.homeX,y:e.homeY}]]),{...plan([[i!,OWNER_PLACES.review]]),tick(t){pose(i,{frame:`chair_walk_${Math.floor(t*4)%2+1}`,seated:false});}},hold(1,()=>{pose(i,{frame:'chair_place',seated:false});say(i,'Эх…');}),hold(20,()=>{},t=>{
        pose(e,{seated:true});pose(i,{seated:true,seat:OWNER_PLACES.reviewChair});reviewClock=t;
        bubbles.clear();say(t<7?i:t<14?e:i,t<7?'📏 Вот тут сечение…':t<14?'👍 Поправим':'Так-то лучше');
      }));
    }
    restore();
  }
  function tick(all:OwnerActor[],dt:number,red=false){
    actors=all;clock+=dt;
    for(const [a,s]of slices)if(clock>=s.expiresAt){slices.delete(a);const p=poses.get(a);if(p)pose(a,{...p,chewing:false,...(p.frame==='owner_eat'?{frame:'cup'}:{})});}
    spark=Math.max(0,spark-dt*5);smoke=Math.max(0,smoke-dt/3);
    if(scene){
      const stage=stages[index];if(!stage){stop();return;}
      if(!entered){stage.enter?.();entered=true;age=0;if(!scene)return;}
      age+=dt;stage.tick?.(age);
      for(const [a,path]of stage.move??[]){if(a.cat&&path.length&&!poses.get(a)?.lift)pose(a,{...poses.get(a),frame:'walk'});move(a,path,dt,a.cat?145:110);}
      for(const [a,path]of stage.move??[])if(!path.length&&!a.cat&&atHome(a)&&snapshots.has(a))pose(a,{seated:true,thinking:true});
      const moving=stage.move&&[...stage.move.values()].some(p=>p.length);
      if(!moving&&age>=(stage.duration??0)&&(stage.ready?.()??true)){index++;entered=false;}
      return;
    }
    const i=ivanych(),e=owner();if(!i||!e)return;
    const wants=i.apiStatus==='working'&&!i.quiet&&!e.quiet&&atHome(e)&&e.seating.progress>.9;
    if(wants&&!reviewing&&!reviewMoving){reviewRoute=artRoute(i.container,OWNER_PLACES.review,blockers(i));if(reviewRoute.length){reviewMoving='out';reviewAge=0;reviewSettle=0;}}
    if(!wants&&(reviewing||reviewMoving==='out')){reviewing=false;reviewMoving='back';reviewRoute=artRoute(i.container,{x:i.homeX,y:i.homeY});reviewSettle=0;bubbles.clear();say(i,'Эх…');}
    if(reviewMoving){
      pose(i,{frame:`chair_walk_${Math.floor(reviewAge*4)%2+1}`,seated:false});reviewAge+=dt;
      move(i,reviewRoute,dt,80);
      if(!reviewRoute.length){reviewSettle+=dt;pose(i,{frame:reviewSettle<.8?'chair_place':'chair_rest',seated:false});
        if(reviewSettle>1.6){reviewing=reviewMoving==='out';reviewMoving=false;reviewClock=0;poses.delete(i);bubbles.clear();}}
    }else if(reviewing){reviewClock+=dt;pose(i,{seated:true,seat:OWNER_PLACES.reviewChair});
      const t=reviewClock%21;bubbles.clear();say(t<7?i:t<14?e:i,t<7?'📏 Вот тут сечение…':t<14?'👍 Поправим':'Так-то лучше');
    }else{poses.delete(i);}
  }
  return {launch,tick,stop,poses,bubbles,slices,served,
    get pizzaPhase(){return pizzaPhase;},get pizzaCount(){return pizzaCount;},
    reset(){stop();const i=ivanych();if(i&&(reviewing||reviewMoving)){i.container.x=i.homeX;i.container.y=i.homeY;}reviewing=false;reviewMoving=false;reviewRoute=[];reviewClock=0;},
    get transportingChair(){return !!reviewMoving;},
    get active(){return scene;},get busy(){return !!scene;},get dark(){return dark;},get pizza(){return pizza;},get spark(){return spark;},get smoke(){return smoke;},
    get review(){return reviewing&&!scene||demoReview&&scene==='review'&&index===3;},get reviewGreen(){return reviewClock>=7;},
    get atBench(){const i=ivanych();return !!i&&!reviewing&&!reviewMoving&&atHome(i);},
    owns(a:OwnerActor){return !!scene||a===ivanych()&&(reviewing||!!reviewMoving);},
  };
}
