import artAtlas from '../../../public/heroes-ai/atlas.json';
import { Assets, Container, Graphics, Sprite, Text, TextStyle, type Application, type Texture } from 'pixi.js';
import { createOwnerFeatures, type OwnerActor } from './ownerFeatures';
import { deskSeat, seatedKeyboard } from './deskSeating';
import { placeAnnotation, type Rect } from './officeAnnotations';

export async function createOwnerFeaturesScene(app:Application,actors:Container,emit:(message:string)=>void) {
  const engine=createOwnerFeatures(emit);
  const shade=new Graphics();shade.label='office23-blackout';shade.eventMode='none';app.stage.addChild(shade);
  const effects=new Container();effects.label='office23-effects';effects.eventMode='none';app.stage.addChild(effects);
  const fx=new Graphics();fx.label='office23-short-effects';effects.addChild(fx);
  const textures=await Promise.all(['closed','open','slice','last'].map(s=>Assets.load<Texture>(`/heroes-ai/pizza-${s}.png`)));
  const box=new Sprite(textures[0]);box.label='office23-pizza';box.anchor.set(.5,artAtlas.pizza_props.closed.anchor[1]/artAtlas.pizza_props.closed.h);box.position.set(923,497);box.width=55;box.scale.y=box.scale.x;box.visible=false;box.zIndex=1002;actors.addChild(box);
  const slices=new Map<OwnerActor,Sprite>();
  const bubbles=new Map<OwnerActor,{root:Container;bg:Graphics;text:Text}>();
  return {
    engine,
    render(all:(OwnerActor&{annotation:Container})[],now:number){
      shade.clear();shade.visible=engine.dark>0;
      if(shade.visible)shade.rect(0,0,960,600).fill({color:0x020508,alpha:engine.dark}).rect(373,32,248,151).cut();
      // Window's own environment tint still follows laptop/Director time.
      box.visible=!!engine.pizza;
      if(engine.pizza){const meta=artAtlas.pizza_props[engine.pizza];box.anchor.set(meta.anchor[0]/meta.w,meta.anchor[1]/meta.h);box.texture=textures[engine.pizza==='closed'?0:engine.pizza==='open'?1:3];box.width=55;box.scale.y=box.scale.x;}
      for(const [a,s]of slices)if(!engine.slices.has(a)||!all.includes(a as typeof all[number]))s.visible=false;
      for(const [a,state]of engine.slices){
        let slice=slices.get(a);if(!slice){slice=new Sprite(textures[2]);slice.label=`office23b-slice-${a.appearanceName}`;slice.eventMode='none';slice.anchor.set(.5,.5);slice.width=12;slice.scale.y=slice.scale.x;actors.addChild(slice);slices.set(a,slice);}
        const pose=engine.poses.get(a),keys=pose?.seated?seatedKeyboard(a.appearanceName):null;
        const seat=pose?.seated?deskSeat(a.appearanceName):null;
        // Desk slices sit beside the physical keys, carried slices follow the hand.
        slice.position.set(keys?keys.x+18:seat?seat.x+18:a.container.x+19,keys?keys.y+5:seat?seat.y-54:a.container.y-51);
        slice.zIndex=keys?1001:a.container.y+1;
        // owner_eat already contains the original supplied slice in his hand.
        slice.visible=pose?.frame!=='owner_eat';
        slice.rotation=state.eating?Math.sin(now*6)*.045:0;
      }
      fx.clear();const i=all.find(a=>a.appearanceName==='Иваныч');
      if(i&&engine.spark>0){const x=i.container.x,y=i.container.y-65;fx.circle(x,y,22*engine.spark).fill({color:0xfffbc5,alpha:.9});
        for(let n=0;n<14;n++){const a=n*2.4;fx.moveTo(x+Math.cos(a)*5,y+Math.sin(a)*5).lineTo(x+Math.cos(a)*29,y+Math.sin(a)*24).stroke({color:n%2?0xffef7c:0xffffff,width:2});}}
      if(i&&engine.smoke>0)for(let n=0;n<5;n++){const t=(now*.6+n*.23)%1;fx.circle(i.container.x+Math.sin(n*2+t*4)*9,i.container.y-92-t*29,4+t*7).fill({color:0xa4a4a4,alpha:(1-t)*engine.smoke*.55});}
      const obstacles:Rect[]=all.map(a=>{const b=a.annotation.getBounds();return {x:b.x,y:b.y,width:b.width,height:b.height};});
      for(const [actor,b]of bubbles)if(!all.includes(actor as typeof all[number])||!engine.bubbles.has(actor))b.root.visible=false;
      for(const [actor,value]of engine.bubbles){
        let b=bubbles.get(actor);if(!b){const root=new Container(),bg=new Graphics(),text=new Text({text:value,style:new TextStyle({fontFamily:'Arial, sans-serif',fontSize:12,fill:0xfff6dc})});root.label=`office23-bubble-${actor.appearanceName}`;root.eventMode='none';root.addChild(bg,text);effects.addChild(root);b={root,bg,text};bubbles.set(actor,b);}
        b.root.visible=true;b.root.alpha=engine.poses.get(actor)?.opacity??1;b.text.text=value;b.text.position.set(7,4);b.bg.clear().roundRect(0,0,b.text.width+14,24,7).fill({color:0x25342e,alpha:.97}).stroke({color:0xdac69c,width:1});
        const annotation=(actor as typeof all[number]).annotation;
        const p=placeAnnotation({x:actor.container.x-b.root.width/2,y:annotation.y-30,width:b.root.width,height:24},obstacles,960,600);b.root.position.set(p.x,p.y);obstacles.push(p);
      }
    },
    destroy(){engine.stop();shade.destroy();effects.destroy({children:true});box.destroy();for(const s of slices.values())s.destroy();},
  };
}
