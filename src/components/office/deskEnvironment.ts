import { Container, Graphics, MeshSimple, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';
import { normalizeHeroName } from './heroRegistry';
import { MONITOR_WIDTH, MONITOR_HEIGHT, MONITOR_FPS, monitorKind, monitorFrameKey, monitorCommands, type MonitorPresence } from './monitorContent';
import { drawMonitorPixels } from './monitorPixels';

export type DeskPresence=MonitorPresence;
/** Native glass measurements, excluding the painted bezels. TL, TR, BR, BL.
 * Sanya's rear-facing laptop has no visible glass; his phone is owned by sanyaDeskScene.
 * Ivanych has only an instrument LCD, rendered abstractly here and readable in zoom. */
const glass = [
  {name:'Ася',index:0,native:[246,1032,447,1032,447,1140,246,1140]},
  {name:'Лёха',index:0,native:[674,1032,879,1032,879,1140,674,1140]},
  {name:'whoami',index:0,native:[1112,1061,1227,1030,1227,1119,1112,1154]},
  {name:'whoami',index:1,native:[1260,1027,1410,1027,1410,1116,1260,1116]},
  {name:'whoami',index:2,native:[1450,1030,1557,1063,1557,1155,1450,1120]},
  {name:'Тая',index:0,native:[801,646,968,646,975,749,790,749]},
  {name:'Ярик',index:0,native:[1228,551,1426,551,1426,661,1228,661]},
  {name:'Марина',index:0,native:[2098,815,2215,815,2215,891,2098,891]},
  {name:'Евгений',index:0,native:[2125,359,2233,329,2233,424,2125,448]},
  {name:'Евгений',index:1,native:[2260,329,2406,329,2406,420,2260,420]},
  {name:'Евгений',index:2,native:[2435,330,2556,362,2556,448,2435,420]},
  {name:'Иваныч',index:0,native:[258,618,299,618,299,632,258,632]},
];
export const DESK_SCREENS=glass.map(s=>{
  const points=s.native.map((n,i)=>i%2===0?n*960/2752:32+n*536/1536);
  const xs=points.filter((_,i)=>i%2===0),ys=points.filter((_,i)=>i%2===1);
  const x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
  // An inscribed, axis-aligned rectangle, used for the explicit geometry contract.
  const rect={x:Math.max(points[0],points[6]),y:Math.max(points[1],points[3]),
    width:Math.min(points[2],points[4])-Math.max(points[0],points[6]),
    height:Math.min(points[5],points[7])-Math.max(points[1],points[3])};
  return {...s,id:`${normalizeHeroName(s.name)}-${s.index}`,points,bounds:{x,y,width,height},rect};
});
export type DeskScreen=typeof DESK_SCREENS[number];
export interface DeskScreenOptions {
  renderer?:Renderer;
  night?:()=>boolean;
  hidden?:()=>boolean;
  visible?:(screen:DeskScreen)=>boolean;
}

/** Procedural Graphics are baked once into tiny nearest-neighbour textures.
 * Normal ticks only swap textures at <=8fps; zoom reuses the exact same texture.
 * One mask clips all quads to the measured glass, including tilted tablets. */
export function createDeskEnvironment(parent:Container,reduced:()=>boolean,options:DeskScreenOptions={}) {
  const layer=new Container();layer.label='desk-monitors';layer.eventMode='none';parent.addChild(layer);
  const content=new Container();content.label='desk-screen-content';
  const mask=new Graphics();mask.label='desk-screen-mask';
  for(const s of DESK_SCREENS)mask.poly(s.points).fill(0xffffff);
  layer.addChild(content,mask);content.mask=mask;
  const textures=new Map<string,Texture>();
  const screens=DESK_SCREENS.map(s=>{
    const quad=new MeshSimple({texture:Texture.WHITE,vertices:new Float32Array(s.points),uvs:new Float32Array([0,0,1,0,1,1,0,1]),indices:new Uint32Array([0,1,2,0,2,3])});
    quad.autoUpdate=false;quad.label='monitor-'+s.id;content.addChild(quad);
    return {definition:s,quad,key:'',kind:'off',updates:0};
  });
  const zoom=new Container();zoom.label='monitor-zoom';zoom.visible=false;zoom.eventMode='none';
  const shade=new Graphics().rect(0,0,960,600).fill({color:0x101815,alpha:.88});
  const frame=new Graphics().roundRect(181,116,598,373,6).fill(0x53665a).roundRect(185,120,590,365,4).fill(0x182622);
  const enlarged=new Sprite(Texture.WHITE);enlarged.position.set(200,137);enlarged.width=560;enlarged.height=336;
  zoom.addChild(shade,frame,enlarged);
  let selected:string|null=null,lastUpdate=-Infinity,destroyed=false;
  const stats={ticks:0,swaps:0,bakes:0};
  function textureFor(key:string) {
    let texture=textures.get(key);if(texture)return texture;
    const [kind,n,night]=key.split(':');
    const graphic=drawMonitorPixels(new Graphics(),monitorCommands(kind as Parameters<typeof monitorCommands>[0],Number(n),night==='1'));
    if(options.renderer) {
      texture=options.renderer.generateTexture({target:graphic,frame:new Rectangle(0,0,MONITOR_WIDTH,MONITOR_HEIGHT),resolution:1,antialias:false});
      texture.source.scaleMode='nearest';texture.label=key;graphic.destroy();
    } else {graphic.destroy();texture=Texture.WHITE;}
    textures.set(key,texture);stats.bakes++;return texture;
  }
  return {
    layer,content,zoom,stats,screens,
    open(id:string|null) {selected=id;zoom.visible=!!id;const s=screens.find(s=>s.definition.id===id);if(s)enlarged.texture=s.quad.texture;},
    update(time:number,presence:ReadonlyMap<string,DeskPresence>) {
      if(destroyed||options.hidden?.()||!layer.visible||time-lastUpdate<1/MONITOR_FPS-1e-6)return;
      lastUpdate=time;stats.ticks++;
      const quiet=reduced(),night=options.night?.()??false;
      for(const s of screens) {
        const visible=options.visible?.(s.definition)??true;
        s.quad.visible=visible;
        if(!visible&&s.definition.id!==selected)continue;
        const kind=monitorKind(s.definition.name,s.definition.index,presence.get(normalizeHeroName(s.definition.name)),quiet?0:time,night);
        const key=monitorFrameKey(kind,time,quiet,night);s.kind=kind;
        if(key!==s.key){s.quad.texture=textureFor(key);s.key=key;s.updates++;stats.swaps++;}
        if(s.definition.id===selected)enlarged.texture=s.quad.texture;
      }
    },
    destroy() {if(destroyed)return;destroyed=true;for(const t of textures.values())if(t!==Texture.WHITE)t.destroy(true);textures.clear();zoom.destroy({children:true});},
  };
}
export type DeskEnvironment=ReturnType<typeof createDeskEnvironment>;
