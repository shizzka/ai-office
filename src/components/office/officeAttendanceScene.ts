import { Assets, Container, Graphics, Sprite, Text, TextStyle, type Application, type Texture } from 'pixi.js';
import atlas from '../../../public/heroes-ai/atlas.json';
import { createOfficeAttendance, MATTRESS_RECT, type AttendanceActor, type Presence } from './officeAttendance';
import { placeAnnotation, type Rect } from './officeAnnotations';

export async function createOfficeAttendanceScene(app:Application,actors:Container,
  emit:(name:string,message:string)=>void,publish:(presence:Presence)=>void, authoritative=false) {
  const engine=createOfficeAttendance(emit,publish,{authoritative});
  const props=atlas.owner_night_props;
  const textures=await Promise.all(['back','side','rolled','carry'].map(k=>Assets.load<Texture>('/heroes-ai/'+props[k as keyof typeof props].image)));
  const bed=new Sprite(textures[0]);bed.label='office24-mattress';bed.eventMode='none';bed.visible=false;actors.addChild(bed);
  const carry=new Sprite(textures[3]);carry.label='office24-mattress-carry';carry.eventMode='none';carry.visible=false;carry.anchor.set(.5,1);actors.addChild(carry);
  const effects=new Container();effects.label='office24-effects';effects.eventMode='none';app.stage.addChild(effects);
  const bubbles=new Map<AttendanceActor,{root:Container;bg:Graphics;text:Text}>();
  return {engine,
    render(all:(AttendanceActor&{container:Container;annotation:Container})[]){
      const e=all.find(a=>a.appearanceName==='Евгений');
      bed.visible=!!e&&(engine.mattress||engine.rolled);
      if(bed.visible){
        const rolled=engine.rolled;bed.texture=textures[rolled?2:engine.floorFrame==='back'?0:1];
        const fit=Math.min(MATTRESS_RECT.width/bed.texture.width,MATTRESS_RECT.height/bed.texture.height);
        bed.scale.set(fit);bed.position.set(MATTRESS_RECT.x+(MATTRESS_RECT.width-bed.width)/2,MATTRESS_RECT.y+(MATTRESS_RECT.height-bed.height)/2);
        bed.zIndex=MATTRESS_RECT.y+MATTRESS_RECT.height-2;
      }
      carry.visible=!!e&&engine.carrying;
      if(e&&carry.visible){carry.position.set(e.container.x,e.container.y);carry.height=110;carry.scale.x=carry.scale.y;carry.zIndex=e.container.y;}
      // The provided mattress/carry art already contains the complete owner.
      if(e&&(bed.visible||carry.visible))e.container.visible=false;
      for(const [a,b]of bubbles)if(!all.includes(a as typeof all[number])||!engine.bubbles.has(a))b.root.visible=false;
      const obstacles:Rect[]=all.filter(a=>!a.away).map(a=>({x:a.annotation.x-a.annotation.width/2,y:a.annotation.y,width:a.annotation.width,height:18}));
      for(const [actor,value]of engine.bubbles){
        const a=all.find(n=>n===actor);if(!a)continue;
        let b=bubbles.get(a);if(!b){const root=new Container(),bg=new Graphics(),text=new Text({text:value,style:new TextStyle({fontFamily:'Arial, sans-serif',fontSize:15,fill:0xfff5dc})});root.label=`office24-bubble-${a.appearanceName}`;root.addChild(bg,text);effects.addChild(root);b={root,bg,text};bubbles.set(a,b);}
        b.root.visible=!a.away;b.root.alpha=engine.opacity(a);b.text.text=value;b.text.position.set(6,3);b.bg.clear().roundRect(0,0,b.text.width+12,25,7).fill({color:0x20322d,alpha:.94});
        const floor=a===e&&(engine.mattress||engine.rolled);
        const preferred={x:floor?MATTRESS_RECT.x+40:a.container.x-b.root.width/2,y:floor?MATTRESS_RECT.y-28:a.annotation.y-29,width:b.root.width,height:25};
        const p=placeAnnotation(preferred,obstacles,960,600);b.root.position.set(p.x,p.y);obstacles.push(p);
      }
      if(e&&(engine.mattress||engine.rolled)){e.annotation.position.set(MATTRESS_RECT.x+40,MATTRESS_RECT.y-3);}
    },
    destroy(){engine.reset([]);bed.destroy();carry.destroy();effects.destroy({children:true});},
  };
}
