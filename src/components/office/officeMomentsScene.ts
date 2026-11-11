import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { startCatVisit, advanceCatVisits, marinaVisitTarget, type CatState } from './catBehavior';
import { createDeliveryQueue, ingestDeliveries, takeDelivery, nextCatVisit, type MomentsSignal, type DeliveryQueue } from './officeMoments';
import { placeAnnotation, type Rect } from './officeAnnotations';
import layout from '../../../office-art/layout-ai.json';

interface MomentNode { appearanceName: string; container: Container; annotation: Container; cat?: CatState; homeX: number; homeY: number }
const storageKey = 'office-deliveries-v2';
const text = (value: string, size: number, color = 0xff709e) => new Text({ text: value, style: new TextStyle({ fontFamily: 'Arial, sans-serif', fontSize: size, fill: color, fontWeight: 'bold' }) });

/** Scene-only presentation; demo has its own queue and never consumes real events.
 * autonomous:false queues incoming deliveries without consuming them or scheduling visits. */
export function createOfficeMomentsScene(layer: Container, demo: boolean, options: { autonomous?: boolean; random?: () => number; reducedMotion?: boolean | (() => boolean); paused?: () => boolean; preview?: () => boolean } = {}) {
  const random=options.random ?? Math.random;
  const autonomous=options.autonomous !== false;
  const prefersReducedMotion = () => typeof options.reducedMotion === 'function' ? options.reducedMotion()
    : options.reducedMotion ?? (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let queue: DeliveryQueue = createDeliveryQueue();
  if (!demo) try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && Number.isSafeInteger(saved.seenTotal) && saved.seenTotal >= 0 && Number.isSafeInteger(saved.pending) && saved.pending >= 0 && Number.isFinite(saved.lastStarted)) queue = saved;
  } catch { /* unavailable storage */ }
  let savedQueue = '';
  let nextVisit = demo ? 0 : nextCatVisit(0,random), demoCat = false, demoPaper = false;
  let until = -Infinity, started = -Infinity, eggSeen = 0, eggAt = -100;
  let marina: MomentNode | undefined;
  let manual: {mode: 'visit'|'vacancies'|'surprise'; since:number} | null=null;
  let clock=0;
  const heart = text('♥', 15); heart.label = 'cat-visit-heart'; heart.visible = false; heart.eventMode = 'none'; layer.addChild(heart);
  const bubble = new Container(); bubble.visible = false; bubble.eventMode = 'none'; bubble.label = 'delivery-bubble';
  const bubbleBg = new Graphics(), bubbleText = text('', 14, 0xfff4e3);
  bubble.addChild(bubbleBg, bubbleText); layer.addChild(bubble);
  const screen = new Container(); screen.label = 'tablet-delivery-screen'; screen.eventMode='none';
  const screenMask = new Graphics().poly(layout.fixtures.JH.screen_polygon.flat()).fill(0xffffff);
  screenMask.label='tablet-screen-mask'; screenMask.eventMode='none'; layer.addChild(screen, screenMask); screen.mask=screenMask;
  const paper = new Container(); paper.label = 'delivery-vacancy-card'; paper.visible = false; paper.eventMode = 'none';
  const {width: cardWidth,height: cardHeight} = layout.fixtures.JH.delivery_card;
  const glow = new Graphics().roundRect(-3,-3,cardWidth+6,cardHeight+6,4).fill({color:0xffd979,alpha:.55});
  glow.label='tablet-delivery-glow';
  const sheet = new Graphics().roundRect(0,0,cardWidth,cardHeight,2).fill(0xf4fbfa).stroke({color:0x67b7a1,width:.7});
  sheet.roundRect(4,5,12,15,1).fill(0x7fb7a1).circle(10,10,2.5).fill(0xffdfbf);
  sheet.moveTo(21,7).lineTo(cardWidth-6,7).stroke({color:0x49736d,width:2});
  sheet.moveTo(21,13).lineTo(cardWidth-16,13).moveTo(21,18).lineTo(cardWidth-10,18).stroke({color:0x9db6b1,width:1});
  paper.addChild(glow,sheet); screen.addChild(paper);
  const hearts = Array.from({ length: 18 }, (_, i) => { const h = text('♥', 12 + i%4*3); h.visible = false; h.eventMode = 'none'; layer.addChild(h); return h; });

  function tick(nodes: MomentNode[], signal: MomentsSignal | null, dt: number, now: number, egg: number) {
    clock=now;
    const reducedMotion = prefersReducedMotion();
    marina = nodes.find(n => n.appearanceName === 'Марина');
    const cats = nodes.flatMap(n => n.cat ? [n.cat] : []);
    if (!marina) {manual=null;until=-Infinity;heart.visible=bubble.visible=paper.visible=false;hearts.forEach(h=>{h.visible=false;});return;}
    if (options.paused?.()) {
      // Keep incoming deliveries queued, and freeze presentation timers while
      // Marina or the cats belong to a higher-priority scene.
      if (!demo && signal) ingestDeliveries(queue, signal.total);
      nextVisit += dt; until += dt; started += dt; eggAt += dt;
      cats.forEach(c=>{if(c.visitUntil!==undefined)c.visitUntil+=dt;});
      heart.visible=bubble.visible=paper.visible=false;
      hearts.forEach(h=>{h.visible=false;});
      return;
    }
    const target = marinaVisitTarget(marina.container);
    if (autonomous && !manual && target && now >= nextVisit && (!demo || !demoCat)) {
      if (startCatVisit(cats, target, options.random ? random : demo ? () => 0 : random, now)) { demoCat = true; nextVisit = nextCatVisit(now,random); }
    }
    advanceCatVisits(cats, dt, now);
    const visitor = cats.find(c => c.visit === 'sitting');
    heart.visible = !!visitor;
    if (visitor) heart.position.set(visitor.position.x - 5, visitor.position.y - 65 + (reducedMotion ? 0 : Math.sin(now*3)*2));
    if (!demo && signal) ingestDeliveries(queue, signal.total);
    const count = autonomous && !manual && !options.preview?.() && now >= until ? demo ? !demoPaper && now >= 6 ? 3 : 0 : takeDelivery(queue, Date.now(), false) : 0;
    if (count) {
      demoPaper = true; started = now; until = now + 8;
      bubbleText.text = `📄 ${count} новых вакансий`;
      bubbleText.position.set(10, 7);
      bubbleBg.clear().roundRect(0,0,bubbleText.width+20,32,8).fill({ color: 0x20251e, alpha: .97 }).stroke({ color: 0xc5a969, width: 1 });
    }
    paper.visible = bubble.visible = now < until;
    if (paper.visible) {
      const {x,y,height} = layout.fixtures.JH.delivery_card;
      const age = now-started, entrance = reducedMotion ? 0 : Math.max(0,1-age/.55);
      // The card descends from beyond the screen top; its glow shares the mask.
      paper.position.set(x, y-entrance*(height+10));
      glow.alpha = reducedMotion ? .55 : .55 + Math.sin(age*4)*.16;
    }
    if (eggSeen !== egg) { eggSeen = egg; eggAt = now; }
    const age = now-eggAt;
    hearts.forEach((h,i) => {
      h.visible = !reducedMotion && age < 2;
      if (!h.visible) return;
      const angle = i*2.4;
      h.position.set(marina!.container.x + Math.cos(angle)*age*(26+i*3), marina!.container.y-65 + Math.sin(angle)*age*45 - age*55);
      h.alpha = 1-age/2; h.rotation = Math.sin(angle)*age*.3;
    });
    if (manual && now-manual.since>=8 && !cats.some(c=>c.visit)) manual=null;
    if (!demo && !manual) {
      const encoded = JSON.stringify(queue);
      if (encoded !== savedQueue) { savedQueue = encoded; try { localStorage.setItem(storageKey, encoded); } catch {} }
    }
  }
  return {
    tick,
    get busy(){return !!manual || clock<until;},
    launch(mode:'visit'|'vacancies'|'surprise',nodes:MomentNode[],now:number){
      const owner=nodes.find(n=>n.appearanceName==='Марина');
      if(!owner)throw new Error('Марина сейчас отсутствует');
      manual={mode,since:now};
      if(mode!=='vacancies') {
        const target=marinaVisitTarget(owner.container);
        if(!target || !startCatVisit(nodes.flatMap(n=>n.cat?[n.cat]:[]),target,options.random ? random : ()=>0,now)){manual=null;throw new Error('Кот сейчас не может прийти к Марине');}
      }
      if(mode!=='visit') {
        started=now;until=now+8;bubbleText.text='📄 3 новых вакансии';bubbleText.position.set(10,7);
        bubbleBg.clear().roundRect(0,0,bubbleText.width+20,32,8).fill({color:0x20251e,alpha:.97}).stroke({color:0xc5a969,width:1});
      }
    },
    stop(){manual=null;until=-Infinity;eggAt=-100;nextVisit=nextCatVisit(clock,random);heart.visible=bubble.visible=paper.visible=false;hearts.forEach(h=>{h.visible=false;});},
    place(nodes: {annotation: Container}[]) {
      if (!bubble.visible || !marina) return;
      const obstacles: Rect[] = nodes.map(n => { const b=n.annotation.getBounds(); return {x:b.x,y:b.y,width:b.width,height:b.height}; });
      const card = placeAnnotation({x:marina.container.x-bubble.width/2,y:marina.annotation.y-40,width:bubble.width,height:32},obstacles,960,600);
      bubble.position.set(card.x,card.y);
    },
    owns: (_node: MomentNode) => false,
    walking: () => false,
  };
}
