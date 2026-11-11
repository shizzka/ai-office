import { Assets, Container, Graphics, Sprite, Text, TextStyle, type Application, type Texture } from 'pixi.js';
import { createCatHunt, setHuntPointer, startLaser, advanceCatHunt, stopCatHunt, nearestWalkablePoint } from './catHunt';
import { isArtWalkable } from './aiOfficeNavigation';
import { startPotStory, advancePotStory, cancelPotStory, nextPotScene, nextHeroLaser, potCatFrame, potMarinaFrame, POT_PLACES, type PotStory } from './potStory';
import { type CatState, type CatActivity } from './catBehavior';
import { type Point } from './officeLayout';

interface PlayNode {
  appearanceName: string; container: Container; cat?: CatState;
  homeX: number; homeY: number; quiet?: boolean; apiStatus: string; moveState: string;
}
export async function createOffice22Scene(app: Application, actors: Container, options: {
  stream: boolean; potDemo: boolean; deskDemo?: boolean; laserDemo: boolean; heroDemo: boolean;
  /** Disable local timers when scene launches come from the server. Manual launches still run. */
  autonomous?: boolean; random?: () => number;
  paused?: () => boolean; reduced: () => boolean; emit: (event:CatActivity)=>void;
}) {
  const random=options.random ?? Math.random;
  const autonomous=options.autonomous !== false;
  const hunt=createCatHunt();
  const textures=await Promise.all(['whole','falling','broken'].map(k=>Assets.load<Texture>(`/heroes-ai/pot-${k}.png`)));
  const props=new Container();props.label='office22-pots';props.eventMode='none';props.zIndex=1001;actors.addChild(props);
  // Source props have 8px transparent padding. Register the opaque base, so
  // the pot touches the painted surface at each site's measured plant height.
  const scaleFor=(site:typeof POT_PLACES[number])=>site.height/(textures[0].height-16);
  const plants=POT_PLACES.map(site=>{
    const p=new Sprite(textures[0]);p.anchor.set(.5,(textures[0].height-8)/textures[0].height);p.scale.set(scaleFor(site));p.position.set(site.place.x,site.place.y);
    p.label=`pot-${site.id}`;props.addChild(p);return p;
  });
  const falling=new Sprite(textures[1]);falling.label='pot-falling';falling.anchor.set(.5,.75);falling.visible=false;props.addChild(falling);
  const broken=new Sprite(textures[2]);broken.label='pot-broken';broken.anchor.set(.5,(textures[2].height-8)/textures[2].height);broken.visible=false;
  // Shards sit on the floor, behind Marina's planted feet.
  actors.addChild(broken);
  const dot=new Graphics().circle(0,0,6).fill({color:0xff2323,alpha:.15}).circle(0,0,2.7).fill(0xff2929).circle(-.5,-.5,1).fill(0xffbab0);
  dot.label='cat-laser-dot';dot.eventMode='none';dot.visible=false;actors.addChild(dot);
  const laugh=new Text({text:'😄',style:new TextStyle({fontSize:22,fontFamily:'Arial, sans-serif'})});
  laugh.label='laser-player-laugh';laugh.anchor.set(.5,1);laugh.eventMode='none';laugh.visible=false;props.addChild(laugh);
  let story:PotStory|null=null, nextPot=options.potDemo?1:nextPotScene(0,options.stream,random);
  let nextLaser=options.laserDemo?1:300+random()*300, nextPlay=options.heroDemo?1:nextHeroLaser(0,options.stream,random);
  let potDone=false, laserDone=false, heroDone=false, clock=0, player:PlayNode|undefined;
  let nodes:PlayNode[]=[];
  let cursorEnabled=true, manual=false;
  let touch:{id:number;at:number;point:Point;timer:ReturnType<typeof setTimeout>}|null=null;
  const canvas=app.canvas;
  const toScene=(event:PointerEvent):Point=>{
    const r=canvas.getBoundingClientRect();return {x:(event.clientX-r.left)/r.width*960,y:(event.clientY-r.top)/r.height*600};
  };
  const emptyFloor=(p:Point)=>{
    if(!isArtWalkable(p))return false;
    const boundary=app.renderer.events.rootBoundary;
    // Input can arrive before Pixi's first render/event has registered a root.
    boundary.rootTarget=app.stage;
    let hit=boundary.hitTest(p.x,p.y);
    while(hit){if(hit.label?.startsWith('agent-node-'))return false;hit=hit.parent;}
    return true;
  };
  const pointerMove=(event:PointerEvent)=>{
    if(!cursorEnabled || options.paused?.())return;
    const p=toScene(event);
    if(event.pointerType==='touch') {
      if(!touch || touch.id!==event.pointerId)return;
      if(performance.now()-touch.at<350 && Math.hypot(p.x-touch.point.x,p.y-touch.point.y)>10){clearTouch();return;}
      touch.point=p;
      if(performance.now()-touch.at>=350) setHuntPointer(hunt,emptyFloor(p) && !story?p:null,clock);
      return;
    }
    if(!story && emptyFloor(p))setHuntPointer(hunt,p,clock);
    else setHuntPointer(hunt,null,clock);
  };
  function clearTouch(){if(touch)clearTimeout(touch.timer);touch=null;setHuntPointer(hunt,null,clock);}
  const down=(event:PointerEvent)=>{
    if(!cursorEnabled || options.paused?.())return;
    const p=toScene(event);
    if(!emptyFloor(p)){setHuntPointer(hunt,null,clock);return;}
    if(event.pointerType!=='touch')return;
    clearTouch();
    touch={id:event.pointerId,at:performance.now(),point:p,timer:setTimeout(()=>{
      if(touch && !story && emptyFloor(touch.point))setHuntPointer(hunt,touch.point,clock);
    },350)};
  };
  const leave=()=>{clearTouch();};
  canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerdown',down);
  canvas.addEventListener('pointerleave',leave);canvas.addEventListener('pointercancel',leave);
  const up=(event:PointerEvent)=>{if(event.pointerType==='touch')clearTouch();};
  window.addEventListener('pointerup',up);

  return {
    hunt,
    get busy(){return !!story || !!hunt.pointer || !!hunt.laser;},
    setCursor(enabled:boolean){cursorEnabled=enabled;if(!enabled){clearTouch();stopCatHunt(hunt,nodes.flatMap(n=>n.cat?[n.cat]:[]));}},
    stop(){
      clearTouch();const cats=nodes.flatMap(n=>n.cat?[n.cat]:[]);
      stopCatHunt(hunt,cats);if(story)cancelPotStory(story,cats);story=null;player=undefined;manual=false;
      nextPot=nextPotScene(clock,options.stream,random);nextLaser=clock+300+random()*300;nextPlay=nextHeroLaser(clock,options.stream,random);
      plants.forEach(p=>{p.visible=true;});falling.visible=broken.visible=dot.visible=laugh.visible=false;
    },
    launch(mode:'pot'|'pot-desk'|'laser'|'hero',all:PlayNode[],now:number){
      nodes=all;clock=now;const cats=nodes.flatMap(n=>n.cat?[n.cat]:[]);
      manual=true;
      if(mode==='pot'||mode==='pot-desk') {
        const marina=nodes.find(n=>n.appearanceName==='Марина');
        if(!marina)throw new Error('Марина сейчас отсутствует');
        // A director preview can move Marina off her desk so the desk pot is available immediately.
        if(mode==='pot-desk'){marina.container.position.set(875,468);}
        story=startPotStory(cats,{position:marina.container,home:{x:marina.homeX,y:marina.homeY},present:true,atDesk:mode!=='pot-desk'},now,options.random ? random : ()=>0,mode==='pot-desk'?'desk':'sill');
        if(!story)throw new Error('Для горшка нужен свободный кот');
      } else {
        if(mode==='hero')player=nodes.find(n=>!n.cat&&!n.quiet&&n.apiStatus==='idle'&&n.appearanceName==='Лёха') || nodes.find(n=>!n.cat&&!n.quiet&&n.apiStatus==='idle') || nodes.find(n=>!n.cat&&!n.quiet);
        if(mode==='hero'&&!player)throw new Error('Нет свободного героя для игры');
        if(!startLaser(hunt,now,mode==='hero'?'hero':undefined,random))throw new Error('Лазер сейчас недоступен');
        if(player){hunt.laser!.position=nearestWalkablePoint({x:player.container.x+40,y:player.container.y})||hunt.laser!.position;options.emit({name:player.appearanceName,message:`🔴 ${player.appearanceName} играет с котами`});}
      }
    },
    get story(){return story;},
    ownsCat:(cat:CatState)=>hunt.owns(cat) || !!story && story.cat===cat && !story.catReleased,
    ownsPerson:(node:PlayNode)=>!!story && node.appearanceName==='Марина' || player===node && !!hunt.laser,
    opacity:(node:PlayNode)=>story&&node.appearanceName==='Марина'?story.marinaOpacity:undefined,
    pausesMoments:()=>!!story || !!hunt.pointer || !!hunt.laser,
    frame:(node:PlayNode,now:number)=>node.cat ? story?.cat===node.cat && !story.catReleased ? potCatFrame(story,now) : hunt.frame(node.cat)
      : story && node.appearanceName==='Марина' ? potMarinaFrame(story,now) : null,
    lift:(node:PlayNode,now:number)=>node.cat ? hunt.lift(node.cat)/node.container.scale.y
      : story?.phase==='angry' && node.appearanceName==='Марина' && !options.reduced() ? Math.max(0,Math.sin((now-story.since)*15))*2/node.container.scale.y : 0,
    playing:(node:PlayNode)=>player===node && !!hunt.laser,
    tick(all:PlayNode[],dt:number,now:number,holiday:boolean) {
      clock=now;nodes=all;
      if(options.paused?.()&&!manual)return;
      const cats=nodes.flatMap(n=>n.cat?[n.cat]:[]);
      const marina=nodes.find(n=>n.appearanceName==='Марина');
      if(story && (!cats.includes(story.cat) || marina?.container!==story.marina.position)) {
        cancelPotStory(story,cats);story=null;nextPot=nextPotScene(now,options.stream,random);
      }
      if(options.reduced() || holiday){stopCatHunt(hunt,cats);player=undefined;}
      if(player && (!nodes.includes(player) || player.apiStatus!=='idle'&&!manual)){stopCatHunt(hunt,cats);player=undefined;}
      if(autonomous && !manual && !story && !hunt.pointer && !hunt.laser && !holiday && !options.reduced() && now>=nextPot && marina && (!options.potDemo || !potDone)) {
        story=startPotStory(cats,{position:marina.container,home:{x:marina.homeX,y:marina.homeY},present:marina.apiStatus!=='offline'&&!marina.quiet,
          atDesk:marina.apiStatus!=='offline'&&!marina.quiet&&Math.hypot(marina.container.x-marina.homeX,marina.container.y-marina.homeY)<65},now,random,options.deskDemo?'desk':undefined);
        if(story){potDone=true;nextPot=nextPotScene(now,options.stream,random);}
      }
      if(story){
        for(const event of advancePotStory(story,cats,dt,now,random))options.emit(event);
        if(story.complete){story=null;nextPot=nextPotScene(now,options.stream,random);}
      }
      if(autonomous && !manual && !story && !hunt.pointer && !hunt.laser && !holiday && !options.reduced() && cats.some(c=>c.phase==='home'&&!c.visit&&!c.desk)) {
        if(now>=nextPlay && (!options.heroDemo || !heroDone)) {
          const free=nodes.filter(n=>!n.cat&&!n.quiet&&n.apiStatus==='idle'&&n.moveState==='SITTING');
          player=options.heroDemo?free.find(n=>n.appearanceName==='Лёха')||free[0]:free[Math.floor(random()*free.length)];
          if(player && startLaser(hunt,now,'hero',random)){
            hunt.laser!.position=nearestWalkablePoint({x:player.container.x+40,y:player.container.y})||hunt.laser!.position;
            heroDone=true;nextPlay=nextHeroLaser(now,options.stream,random);options.emit({name:player.appearanceName,message:`🔴 ${player.appearanceName} играет с котами`});
          }
        }
        if(!hunt.laser && now>=nextLaser && (!options.laserDemo || !laserDone) && !options.heroDemo) {
          if(startLaser(hunt,now,undefined,random)){laserDone=true;nextLaser=now+300+random()*300;}
        }
      }
      advanceCatHunt(hunt,cats.filter(c=>!story || c!==story.cat || story.catReleased),dt,now,{random});
      if(!hunt.laser)player=undefined;
      for(let i=0;i<plants.length;i++)plants[i].visible=!story || story.site.id!==POT_PLACES[i].id || story.whole;
      falling.visible=story?.phase==='falling';
      if(story && falling.visible){
        const t=Math.min(1,(now-story.since)/.5),p=story.site;
        falling.scale.set(scaleFor(p));
        // The swipe pushes the desk plant left, clear of the laptop keys even
        // at the first frame of the wider falling texture.
        const startX=p.place.x-(p.id==='desk'?2:0);
        falling.position.set(startX+(p.floor.x-startX)*t,p.place.y+(p.floor.y-p.place.y)*t*t-8);
        falling.rotation=(p.id==='desk'?-1:1)*t*2.5;
      }
      broken.visible=!!story?.broken;
      if(story){broken.scale.set(scaleFor(story.site));broken.position.set(story.site.floor.x,story.site.floor.y+2);broken.zIndex=story.site.floor.y-1;}
      dot.visible=!!hunt.laser;
      if(hunt.laser){dot.position.copyFrom(hunt.laser.position);dot.zIndex=dot.y-.5;}
      laugh.visible=!!player && !!hunt.laser;
      if(player)laugh.position.set(player.container.x+15,player.container.y-100);
    },
    destroy(){
      clearTouch();canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerdown',down);
      canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('pointercancel',leave);window.removeEventListener('pointerup',up);
    },
  };
}
