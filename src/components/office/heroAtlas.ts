import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import atlas from '../../../public/heroes/atlas.json';
import artAtlas from '../../../public/heroes-ai/atlas.json';
import { normalizeHeroName } from './heroRegistry';
import { walkFrameIndex, HUMAN_GAIT, CAT_GAIT, heroBreathing, stationaryMotion, createIdleEvent, sampleIdleEvent, CAT_EAR_TWITCH } from './heroMotion';
import { createCatIdleEar } from './catIdleEar';

export type HeroRenderer = 'art' | 'atlas' | 'graphics';
export const DEFAULT_HERO_RENDERER: HeroRenderer = 'art';
export const HERO_RENDERER_STORAGE_KEY = 'office-hero-renderer';
type Animation = keyof typeof atlas.animations | 'sit';
type AtlasAnimation = keyof typeof atlas.animations;
type ArtFrame = 'work' | 'walk' | 'stretch' | 'cup';
interface ArtFrameDefinition { head?: number[]; silhouette_height?: number; x: number; y: number; w: number; h: number; foot: number[]; label_anchor: number[] }
interface ArtHeroDefinition { name: string; image: string; frames: Record<string, ArtFrameDefinition>; walk_cycle?: string[]; typing?: string[]; tail?: string[] }
const artManifest = artAtlas as unknown as { pixel_ratio?: number; heroes: Record<string, ArtHeroDefinition> };
const artPixelRatio = () => artManifest.pixel_ratio || 1;
export type CatAtlasFrame = ArtFrame | 'wash' | 'cat_stretch' | 'belly' | 'window';
const definitions = new Map(Object.entries(atlas.heroes).map(([name, hero]) => [normalizeHeroName(name), hero]));
// The AI manifest uses English IDs; scene identity remains the normalized display name.
const artDefinitions = new Map(Object.values(artManifest.heroes).map(hero => [normalizeHeroName(hero.name), hero]));
const textures = new Map<string, Record<string, Texture>>();
const artTextures = new Map<string, Record<string, Texture>>();
const loading = new Map<HeroRenderer, Promise<void>>();

/** Shared source textures survive scene/theme switches; only poses are destroyed. */
export function loadHeroAtlas(renderer: HeroRenderer = 'atlas'): Promise<void> {
  if (renderer === 'graphics') return Promise.resolve();
  const pending = loading.get(renderer);
  if (pending) return pending;
  Assets.setPreferences({ preferWorkers: false });
  const entries = renderer === 'art' ? artDefinitions : definitions;
  const target = renderer === 'art' ? artTextures : textures;
  const directory = renderer === 'art' ? '/heroes-ai/' : '/heroes/';
  const promise = Promise.all([...entries].map(async ([key, hero]) => {
    const sheet = await Assets.load<Texture>(directory + hero.image);
    sheet.source.scaleMode = renderer === 'art' ? 'linear' : 'nearest';
    sheet.source.autoGenerateMipmaps = renderer === 'art';
    sheet.source.mipmapFilter = renderer === 'art' ? 'linear' : 'nearest';
    target.set(key, Object.fromEntries(Object.entries(hero.frames).map(([name, frame]) => [name,
      new Texture({ source: sheet.source, frame: new Rectangle(frame.x, frame.y, frame.w, frame.h) }),
    ])));
  })).then(() => {}).catch(error => { loading.delete(renderer); throw error; });
  loading.set(renderer, promise);
  return promise;
}

interface Pose {
  breathing: ReturnType<typeof heroBreathing>;
  idleEvent: ReturnType<typeof createIdleEvent>;
  cat: boolean;
  facing: -1 | 1;
  sprite: Sprite;
  frames: Record<string, Texture>;
  animation: AtlasAnimation;
  renderer: HeroRenderer;
  artFrame?: CatAtlasFrame;
  heads?: Record<string, number>;
  definition?: ArtHeroDefinition;
  ratio: number;
  bug?: Graphics;
  tail?: Graphics;
  ear?: ReturnType<typeof createCatIdleEar>;
  chewing?: {head:Sprite; mask:Graphics; source?:Texture; crop?:Texture};
}
const poses = new WeakMap<Container, Pose>();
const artFrames: Record<AtlasAnimation, ArtFrame> = {
  work: 'work', walk: 'walk', stretch: 'stretch', cooler: 'cup', easter: 'stretch',
};

export function createAtlasPose(name: string, animation: Animation, renderer: HeroRenderer = 'atlas'): Container | null {
  if (renderer === 'graphics') return null;
  const key = normalizeHeroName(name);
  const frames = (renderer === 'art' ? artTextures : textures).get(key);
  const hero = renderer === 'art' ? artDefinitions.get(key) : definitions.get(key);
  if (!hero || !frames) return null;
  const action = animation === 'sit' ? 'work' : animation;
  const root = new Container();
  // Creation can happen between render ticks. Reveal only after the first
  // animation pass has selected a contextual seated/waiting frame.
  root.alpha = 0;
  root.label = `hero-${key}-${animation}-${renderer}`;
  const sprite = new Sprite(frames[renderer === 'art' ? artFrames[action] : atlas.animations[action][0]]);
  sprite.label = 'atlas-frame';
  if (renderer === 'art') {
    const foot = artDefinitions.get(key)!.frames.work.foot;
    sprite.pivot.set(foot[0], foot[1]);
  } else {
    const foot = definitions.get(key)!.frames.work_type.foot_anchor;
    sprite.pivot.set(foot[0], foot[1]);
  }
  root.addChild(sprite);
  const ratio = renderer === 'art' ? artPixelRatio() : 1;
  sprite.scale.set(1 / ratio);
  const cat = key === 'коржик' || key === 'масяня';
  const pose: Pose = { breathing: heroBreathing(key), idleEvent: createIdleEvent(key, cat ? CAT_EAR_TWITCH : undefined),
    cat, facing: 1, sprite, frames, animation: action, renderer, ratio,
    definition: renderer === 'art' ? artDefinitions.get(key) : undefined,
    heads: renderer === 'art' ? Object.fromEntries(Object.entries(artDefinitions.get(key)!.frames)
      .map(([name, frame]) => [name, (frame.label_anchor[1] - frame.foot[1]) / ratio + 4])) : undefined,
  };
  if (renderer === 'art' && key === 'шарик') {
    pose.tail = new Graphics().moveTo(0, 0).quadraticCurveTo(9, -2, 10, -12)
      .stroke({ color: 0xc68d52, width: 4 });
    pose.tail.label = 'response-tail'; pose.tail.position.set(19, -14);
    pose.tail.visible = false; root.addChildAt(pose.tail, 0);
  }
  if (renderer === 'art' && cat) pose.ear = createCatIdleEar(root, sprite, key, ratio);
  poses.set(root, pose);
  return root;
}

export interface AtlasAnimationContext {
  chewing?: boolean; sceneFrame?: string; sceneLift?: number; sceneFacing?: -1 | 1;
  responding?: boolean; bug?: boolean; working?: boolean; reducedMotion?: boolean;
  distance?: number; facing?: -1 | 1; moving?: boolean; lookAround?: boolean;
  seated?: boolean; thinking?: boolean; victory?: boolean;
  seatOffset?: { x:number; y:number };
  seatScale?: number;
  seatedBack?: boolean; reclining?: boolean; sitProgress?: number;
}

export function animateAtlasPose(root: Container, now: number, easter: boolean, offline: boolean, context: AtlasAnimationContext = {}) {
  const pose = poses.get(root);
  if (!pose) return;
  const animation = easter || context.victory ? 'easter'
    : pose.animation === 'walk' && context.moving === false ? 'work' : pose.animation;
  if (pose.renderer === 'art') {
    root.scale.set(context.seated ? context.seatScale ?? 1 : 1);
    const requested = pose.artFrame || artFrames[animation];
    let base = requested === 'walk' && context.moving === false ? 'work' : requested;
    // The work cells carry a keyboard. A person waiting for cat clearance or
    // pausing on the floor uses a prop-free pose; desk idle uses seated cells.
    if (!pose.cat && pose.definition?.frames.seated_back_type_1 && !context.seated &&
      (base === 'work' || base === 'cup' && normalizeHeroName(pose.definition.name)==='ася')) {
      base = normalizeHeroName(pose.definition.name)==='whoami' && context.working ? 'work'
        : 'cup';
    }
    const walking = base === 'walk' || !!context.sceneFrame?.startsWith('run_') || ['scene_carry','owner_pizza','chair_walk_1','chair_walk_2'].includes(context.sceneFrame ?? '') && !!context.moving;
    const cat = pose.cat;
    const gait = cat ? CAT_GAIT : HUMAN_GAIT;
    let frame: string = base;
    const definition = pose.definition;
    const active = !offline && !context.reducedMotion;
    if (context.seated && context.seatedBack && definition?.frames.seated_back_type_1) {
      frame = context.reclining ? 'seated_back_recline' : context.thinking ? 'seated_back_think'
        : active && context.working ? `seated_back_type_${Math.floor(now*3)%2+1}` : 'seated_back_type_1';
    } else if (context.seated && definition?.frames.seated_type_1) {
      frame = context.victory ? 'seated_victory' : context.thinking ? 'seated_think'
        : active && context.working ? `seated_type_${Math.floor(now*3)%2+1}` : 'seated_type_1';
    } else if (active && walking && definition?.walk_cycle?.length) {
      frame = definition.walk_cycle[walkFrameIndex(context.distance ?? 0, definition.walk_cycle.length, gait.frameDistance)];
    } else if (!cat && definition?.typing?.length && (context.moving === false || active && context.working || normalizeHeroName(definition.name)==='ася' && context.moving !== true)
      && (base === 'work' || base === 'cup' && normalizeHeroName(definition.name) === 'ася')) {
      // The original Asya work/cup cells themselves contain a walking stance.
      // Existing typing art supplies a planted, frontal rest pose for humans;
      // animate its hands only while actually working.
      frame = active && context.working ? definition.typing[Math.floor(now * 3) % definition.typing.length] : definition.typing[0];
    }
    if (context.sceneFrame && pose.frames[context.sceneFrame]) frame = context.sceneFrame;
    pose.sprite.texture = pose.frames[frame] || pose.frames[base];
    const metadata = definition?.frames[frame] || definition?.frames[base];
    if (metadata) pose.sprite.pivot.set(metadata.foot[0], metadata.foot[1]);
    // A single reflection, latched by travelled direction, never by the step clock.
    if (walking) pose.facing = context.facing ?? pose.facing;
    pose.sprite.scale.set((context.sceneFacing ?? (walking || cat ? pose.facing : active && context.lookAround && !context.seated ? -1 : 1)) / pose.ratio, 1 / pose.ratio);
    pose.sprite.skew.x = active && !walking && !cat && !context.seated ? sampleIdleEvent(now, pose.idleEvent) : 0;
    const bob = active && walking && context.moving ? -Math.abs(Math.sin((context.distance ?? 0) / (gait.frameDistance*2) * Math.PI))*gait.bob : 0;
    const breathing = stationaryMotion(now, pose.breathing, context.reducedMotion);
    root.position.set(context.seated ? context.seatOffset?.x ?? 0 : 0,
      (context.seated ? context.seatOffset?.y ?? 0 : 0) + bob - (context.sceneLift ?? 0));
    if (context.seatedBack && context.seated) {
      // A brief vertical settle keeps wheels planted once seated. No whole-body sway.
      const progress = context.reducedMotion ? 1 : context.sitProgress ?? 1;
      root.y -= Math.sin((1-progress)*Math.PI/2)*4;
      root.alpha = .65 + .35*progress;
    }
    root.rotation = 0;
    // The sprite pivot is its foot anchor. Walking has only distance-driven bob.
    pose.sprite.scale.y = (walking ? 1 : breathing.scaleY) / pose.ratio;
    // Split only the head band during eating: shoes and chair remain planted.
    if(context.chewing && !cat && metadata){
      if(!pose.chewing){const head=new Sprite(),mask=new Graphics();head.label='office23b-chewing-head';head.eventMode='none';mask.eventMode='none';root.addChild(mask,head);pose.chewing={head,mask};}
      const c=pose.chewing,source=pose.sprite.texture;
      const cut=Math.round((metadata.head?.[1]??100)+(metadata.silhouette_height??420)*.4);
      if(c.source!==source){c.crop?.destroy();c.crop=new Texture({source:source.source,frame:new Rectangle(source.frame.x,source.frame.y,source.frame.width,cut+12)});c.head.texture=c.crop;c.source=source;}
      c.head.visible=c.mask.visible=true;c.head.pivot.copyFrom(pose.sprite.pivot);c.head.scale.copyFrom(pose.sprite.scale);
      c.head.position.set(pose.sprite.x,pose.sprite.y-(context.reducedMotion?0:Math.abs(Math.sin(now*6))*1.3));
      c.mask.clear().rect(-150,(cut-metadata.foot[1])/pose.ratio,300,250).fill(0xffffff);pose.sprite.mask=c.mask;
    }else if(pose.chewing){pose.chewing.head.visible=pose.chewing.mask.visible=false;pose.sprite.mask=null;}
    pose.ear?.update(frame, active && !walking ? sampleIdleEvent(now, pose.idleEvent) : 0);
    if (pose.bug) pose.bug.y = -41 - (!offline && !context.reducedMotion && (context.bug || easter) ? Math.abs(Math.sin(now * 8)) * 7 : 0);
    if (pose.tail) {
      pose.tail.visible = !offline && !context.reducedMotion && !!context.responding;
      pose.tail.rotation = pose.tail.visible ? Math.sin(now * 15) * 0.5 : 0;
    }
  } else {
    const frames = atlas.animations[animation];
    const fps = animation === 'walk' ? 8 : animation === 'stretch' ? 4 : animation === 'easter' ? 3 : 2;
    const name = frames[offline || context.reducedMotion || pose.cat && animation !== 'walk' ? 0 : Math.floor(now * fps) % frames.length];
    pose.sprite.texture = pose.frames[name];
    root.position.set(0, -20);
    const breathing = stationaryMotion(now, pose.breathing, context.reducedMotion);
    root.rotation = 0;
    pose.sprite.skew.x = animation !== 'walk' && !pose.cat && !context.seated && !offline && !context.reducedMotion ? sampleIdleEvent(now, pose.idleEvent) : 0;
    pose.sprite.scale.y = animation !== 'walk' ? breathing.scaleY : 1;
  }
  if (!context.seatedBack || !context.seated) root.alpha = 1;
  if (offline) root.alpha = 0.55;
}

/** All cat cells share a foot pivot, including the four activity poses. */
export function setCatAtlasPose(root: Container, frame: CatAtlasFrame) {
  const pose = poses.get(root);
  if (pose?.renderer === 'art') { pose.artFrame = frame; pose.sprite.texture = pose.frames[frame]; }
}

/** Opaque head top of the current pose, relative to its feet (ignores cell padding). */
export function atlasHeadY(root: Container): number | null {
  const pose = poses.get(root);
  if (!pose) return null;
  if (pose.heads) {
    const frame = Object.keys(pose.frames).find(key => pose.frames[key] === pose.sprite.texture)!;
    return root.y + pose.sprite.y + pose.heads[frame] * root.scale.y;
  }
  return root.y - 93;
}
