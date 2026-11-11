import { Container, Graphics, Text } from 'pixi.js';
import type { HeroPose } from './drawAgent';

const INK = 0x202733, PAPER = 0xe5e4d0, GREEN = 0x77cc8f, RED = 0xd45356;
function r(g: Graphics, x: number, y: number, w: number, h: number, color: number) {
  g.rect(x, y, w, h).fill(color);
}
function word(root: Container, text: string, x: number, y: number, size = 4, color = INK) {
  const label = new Text({ text, style: { fontFamily: 'monospace', fontSize: size, fill: color }, resolution: 2 });
  label.position.set(x, y);
  root.addChild(label);
}
function mug(root: Container, x: number, y: number) {
  const g = new Graphics(); root.addChild(g);
  r(g,x,y,17,11,INK); r(g,x+1,y+1,15,9,PAPER);
  r(g,x+17,y+2,3,6,INK); r(g,x+18,y+3,1,4,PAPER);
  word(root,'sudo',x+2,y+3,5);
}
function cactus(g: Graphics, x: number, y: number, headset = false) {
  r(g,x+2,y,5,12,INK); r(g,x+3,y+1,3,10,GREEN);
  r(g,x-1,y+4,3,5,GREEN); r(g,x+7,y+2,3,6,GREEN);
  r(g,x,y+11,10,7,0xa66e4e); r(g,x-1,y+11,12,2,0xd39767);
  if (headset) {
    r(g,x,y+1,10,2,INK); r(g,x-1,y+3,3,5,0x7acbd2); r(g,x+8,y+3,3,5,0x7acbd2);
  }
}

export interface HeroAnimationContext {
  working?: boolean;
  regressionFailed?: boolean;
  bugFound?: boolean;
  responseSent?: boolean;
  /** Preview only: displays the rare detail without altering its live schedule. */
  preview?: boolean;
  rareGesture?: boolean;
}
interface State { next: number; until: number; key: string; pose: HeroPose }
const states = new WeakMap<Container, State>();

/** Desk props live with the sitting sprite; moving characters keep personal props. */
export function addHeroDetails(root: Container, key: string, pose: HeroPose) {
  states.set(root, { next: 180 + Math.random() * 120, until: 0, key, pose });
  if (key === 'whoami') {
    if (pose === 'sit') mug(root,33,47);
    if (pose === 'cooler') {
      // Cover the generic cup with the owner's sudo mug.
      mug(root,-11,24);
    }
    const lock = new Graphics(); lock.visible = pose !== "stretch"; root.addChild(lock);
    const x = pose === 'sit' ? -1 : 43, y = pose === 'sit' ? 34 : pose === 'stretch' ? 31 : 37;
    r(lock,x,y,4,5,PAPER); r(lock,x+1,y,2,2,INK); r(lock,x,y+2,4,3,RED);
  }
  if (pose !== 'sit') return;
  const desk = new Graphics(); root.addChild(desk);
  // Small side shelf gives each easter egg a stable place beside the work tools.
  if (key !== 'мотя') {
    r(desk,-26,56,22,3,0x73868d); r(desk,-24,59,2,3,INK);
  }
  switch (key) {
    case 'ярик': {
      const llama = new Graphics(); llama.label='llama'; llama.position.set(-19,42);
      r(llama,0,7,12,7,PAPER); r(llama,8,0,5,13,PAPER);
      r(llama,8,-3,2,5,PAPER); r(llama,12,-3,2,5,PAPER);
      r(llama,11,3,5,4,PAPER); r(llama,12,3,1,1,INK);
      r(llama,1,13,3,3,0xb9b59e); r(llama,8,13,3,3,0xb9b59e);
      r(llama,1,8,8,3,0xbc7a84); root.addChildAt(llama, Math.max(0, root.children.findIndex(child => child.label === "hero-tools")));
      break;
    }
    case 'леха':
      r(desk,-22,50,12,5,0xf1ca5d); r(desk,-15,46,6,7,0xf1ca5d);
      r(desk,-10,49,4,2,0xe48a47); r(desk,-12,47,1,1,INK);
      // Tiny sticker; its complete wording is legible in the easter-egg sheet row.
      r(desk,-9,38,14,5,PAPER); word(root,'works on\nmy machine',-9,38,2);
      break;
    case 'ася': {
      cactus(desk,-22,38);
      const sign = new Container(); sign.label='review-sign'; sign.position.set(0,13);
      const g=new Graphics(); r(g,0,0,30,12,INK); r(g,1,1,28,10,PAPER); r(g,14,12,2,13,0x987456);
      sign.addChild(g); word(sign,'LGTM?',2,3,8); sign.visible=false; root.addChild(sign);
      break;
    }
    case 'иваныч': {
      r(desk,-20,37,10,19,INK); r(desk,-19,39,8,16,0x839b9b);
      r(desk,-18,35,6,4,0xc4d5cd); r(desk,-17,42,2,11,PAPER);
      const probe=new Graphics(); probe.label='voltage-probe';
      // Wall socket + indicator screwdriver, shown only in the rare check.
      r(probe,-14,19,9,11,PAPER); r(probe,-12,22,2,3,INK); r(probe,-8,22,1,3,INK);
      r(probe,-3,26,16,3,0xc5ceca); r(probe,8,24,9,6,0xf0bd5d);
      probe.visible=false; root.addChild(probe);
      const light=new Graphics(); light.label='probe-light'; r(light,10,25,3,3,RED); light.visible=false; root.addChild(light);
      break;
    }
    case 'тая': {
      // Black cat with the bright eyes used on the DCM empty screens.
      r(desk,-22,40,16,11,INK); r(desk,-21,37,4,5,INK); r(desk,-11,37,4,5,INK);
      r(desk,-19,43,3,2,0xe5bd66); r(desk,-12,43,3,2,0xe5bd66);
      r(desk,-7,47,5,3,INK); r(desk,-3,42,2,7,INK);
      // Monitor shelf under the cat.
      r(desk,-23,51,20,5,INK); r(desk,-22,52,18,3,0x6a8d99);
      break;
    }
    case 'саня': {
      r(desk,-23,38,15,18,0x688f99); r(desk,-22,40,13,14,0xb8d4cd);
      r(desk,-24,37,17,3,0x8b8b74); r(desk,-21,41,1,12,PAPER);
      const bug=new Graphics(); bug.label='jar-bug'; bug.position.set(-17,48);
      r(bug,-2,-2,5,6,INK); r(bug,-4,-1,9,1,INK); r(bug,-4,2,9,1,INK);
      r(bug,-1,-1,3,4,0x8b535b); root.addChild(bug);
      break;
    }
    case 'люда': cactus(desk,-22,37,true); break;
    case 'шарик':
      r(desk,-24,48,4,8,PAPER); r(desk,-6,48,4,8,PAPER); r(desk,-21,50,16,4,PAPER);
      word(root,'CV',-18,50,5); break;
  }
}

/** One existing Pixi clock. Rare gestures are 3–5 minutes apart with random phase. */
export function animateHeroDetails(root: Container, now: number, context: HeroAnimationContext) {
  const state=states.get(root);
  if (!state) return;
  const eligible=state.key !== 'ася' || !!context.working;
  if (context.rareGesture === undefined && now >= state.next && eligible) {
    state.until=now+3;
    state.next=now+180+Math.random()*120;
  }
  const rare=context.preview || (context.rareGesture ?? now < state.until);
  const llama=root.getChildByLabel('llama');
  if (llama) { llama.y=42-(rare ? Math.round(Math.sin((now % 3)/3*Math.PI)*9) : 0); llama.x=rare ? -9 : -19; }
  const sign=root.getChildByLabel('review-sign'); if (sign) sign.visible=!!rare && !!context.working;
  const probe=root.getChildByLabel('voltage-probe'); if (probe) probe.visible=!!rare;
  const light=root.getChildByLabel('probe-light'); if (light) light.visible=!!rare && Math.floor(now*5)%2===0;
  const head=root.getChildByLabel('hero-head');
  if (head && state.key==='whoami') head.x=rare ? -3 : 0;
  const bug=root.getChildByLabel('jar-bug'); if (bug) bug.y=48-(context.bugFound ? Math.abs(Math.sin(now*8))*4 : 0);
  const tail=root.getChildByLabel('dog-tail'); if (tail) tail.rotation=context.responseSent ? Math.sin(now*15)*0.5 : 0;
  const leds=root.getChildByLabel('worker-leds');
  if (leds) leds.alpha=context.working ? (Math.floor(now*3)%2 ? 0.3 : 1) : 0.45;
  const red=root.getChildByLabel('regression-red'); if (red) red.visible=!!context.regressionFailed;
}
