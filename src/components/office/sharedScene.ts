/** Server occurrence, never a client command. Times are UTC milliseconds. */
export interface SharedScene {
  id: string; eventId: string; seed: number; startedAt: number; endsAt: number;
  actors?: {name:string;status:string}[]; red?:boolean;
  actorName?:string;
  attendance?:SharedAttendance;
}
export interface SharedAttendance {
  hour:number; actors:{name:string;status:string;idleSince:number;departureAt:number|null;home:boolean}[];
  ownerNight:'awake'|'chair'|'mattress';
}
export interface SharedOfficeState { type:'office:state'; serverNow:number; scene:SharedScene|null; attendance?:SharedAttendance }

export function sceneRandom(seed:number) {
  let value=seed>>>0;
  return ()=>{value+=0x6D2B79F5;let t=value;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}

/** A fixed simulation step makes late joins, suspended tabs and different FPS
 * reach exactly the same phase. Rendering never advances the server clock. */
export function createSharedPlayback(start:(scene:SharedScene)=>void, step:(dt:number,age:number)=>void, stop:()=>void) {
  const interval=1/20;
  let scene:SharedScene|null=null, ticks=0;
  return {
    get scene(){return scene;},
    get age(){return ticks*interval;},
    sync(next:SharedScene|null,now:number) {
      if(!next || now>=next.endsAt){if(scene)stop();scene=null;ticks=0;return;}
      if(scene?.id!==next.id){if(scene)stop();scene=next;ticks=0;start(next);}
      const target=Math.max(0,Math.floor((Math.min(now,next.endsAt)-next.startedAt)/1000/interval));
      while(ticks<target){ticks++;step(interval,ticks*interval);}
    },
    reset(){if(scene)stop();scene=null;ticks=0;},
  };
}
