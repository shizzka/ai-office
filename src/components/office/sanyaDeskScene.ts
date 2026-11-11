import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { OfficeDcmSignal } from '../../lib/officeDcm';
import { advanceSanyaAlert, type SanyaAlert } from './sanyaLife';

// Coordinates are in the registered 960×600 painting, shared with DOM hit targets.
export const SANYA_DESK = { jar: {x:727.5,y:517.5}, phone:{x:620,y:478} };

export async function createSanyaDeskScene() {
  const foreground = new Container(); foreground.label='sanya-desk-foreground'; foreground.eventMode='none';
  const texture=await Assets.load<Texture>('/office-loft/sanya-desk-front.png');
  texture.source.scaleMode='linear'; texture.source.autoGenerateMipmaps=true;
  const desk=new Sprite(texture); desk.position.set(0,32); desk.width=960; desk.height=536;
  foreground.addChild(desk);
  const jarTexture=await Assets.load<Texture>('/office-loft/bugjar.png');
  const emptyTexture=await Assets.load<Texture>('/office-loft/bugjar-empty.png');
  const bugTexture=await Assets.load<Texture>('/office-loft/bugjar-bug.png');
  jarTexture.source.scaleMode='linear';
  const jar=new Sprite(jarTexture); jar.label='sanya-bug-jar';
  jar.anchor.set(.5,1); jar.position.set(SANYA_DESK.jar.x,SANYA_DESK.jar.y); jar.width=17; jar.height=25.5;
  const glow=new Graphics().ellipse(0,-9,12,13).fill({color:0xa5f04b,alpha:.3});
  glow.label='sanya-jar-glow'; glow.position.copyFrom(jar.position); glow.visible=false;
  const bug=new Sprite(bugTexture); bug.anchor.set(.5,1); bug.width=17; bug.height=25.5;
  bug.label='sanya-jar-bug'; bug.position.copyFrom(jar.position); bug.visible=false;
  const bugMask=new Graphics().roundRect(jar.x-6,jar.y-18,12,16,2).fill(0xffffff);
  bugMask.label='sanya-jar-interior'; bug.mask=bugMask;
  const rec=new Graphics().circle(0,0,1.2).fill(0xf7433c);
  rec.label='sanya-phone-rec'; rec.position.set(SANYA_DESK.phone.x,SANYA_DESK.phone.y); rec.visible=false;
  foreground.addChild(glow,jar,bug,bugMask,rec);
  const bubble=new Container(); bubble.label='sanya-bug-alert'; bubble.eventMode='none'; bubble.visible=false;
  const text=new Text({text:'🐞 Попался!',style:{fontFamily:'Arial, sans-serif',fontSize:12,fill:0xeff9dc}});
  text.anchor.set(.5,1);
  bubble.addChild(new Graphics().roundRect(-49,-22,98,25,7).fill({color:0x34422a,alpha:.96}),text);
  const alert: SanyaAlert={seen:null,until:0};
  return { foreground, bubble,
    update(time:number,signal:OfficeDcmSignal|null,node:{container:Container;headY:number;working:boolean}|undefined,reduced:boolean,tappedUntil:number) {
      const alerted=advanceSanyaAlert(alert,signal,time);
      glow.visible=alerted;
      glow.alpha=reduced ? .8 : .7+Math.sin(time*3)*.2;
      bug.visible=!reduced && time<tappedUntil;
      jar.texture=bug.visible ? emptyTexture : jarTexture;
      if(bug.visible) { bug.x=jar.x+Math.sin(time*7); bug.y=jar.y+Math.sin(time*5)*.6; bug.rotation=Math.sin(time*5)*.025; }
      rec.visible=!!node?.working && (reduced || Math.sin(time*5)>0);
      bubble.visible=!!node && alerted;
      if(node) bubble.position.set(node.container.x,node.container.y+node.headY-32);
    },
  };
}
