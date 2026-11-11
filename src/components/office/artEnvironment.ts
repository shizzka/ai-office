import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { RegressionResult } from './officeLayout';
import { createDeskEnvironment, type DeskPresence, type DeskEnvironment } from './deskEnvironment';
import layout from '../../../office-art/layout-ai.json';
import { potPlacement } from './potPlacement';

export interface ArtEnvironmentOptions { monitors?: DeskEnvironment; reducedMotion?: boolean | (() => boolean); timeOfDay?: 'auto' | 'morning' | 'day' | 'evening' | 'night' }

/** Furniture crops are authored in scene space, while the painting stays native. */
export function artTextureFrame(x: number, y: number, width: number, height: number) {
  const [left, top, renderedWidth, renderedHeight] = layout.background.rendered_rect;
  const [sourceWidth, sourceHeight] = layout.background.source_size;
  return new Rectangle((x-left)*sourceWidth/renderedWidth, (y-top)*sourceHeight/renderedHeight,
    width*sourceWidth/renderedWidth, height*sourceHeight/renderedHeight);
}

export function officeNightStrength(hour: number) {
  return hour < 6 || hour >= 21 ? 1 : hour < 8 ? (8-hour)/2 : hour > 19 ? (hour-19)/2 : 0;
}

/** Live details use the AI painting's own pixels and the office scene clock. */
export async function createArtEnvironment(options: ArtEnvironmentOptions = {}) {
  Assets.setPreferences({ preferWorkers: false });
  const texture = await Assets.load<Texture>('/office-bg-ai.png');
  texture.source.scaleMode = 'linear';
  texture.source.autoGenerateMipmaps = true;
  texture.source.mipmapFilter = 'linear';

  const container = new Container();
  container.label = 'art-office-environment';
  const background = new Sprite(texture);
  background.label = 'art-office-background';
  const [left, top, width, height] = layout.background.rendered_rect;
  background.position.set(left, top);
  background.width = width;
  background.height = height;
  container.addChild(background);
  // Always cover the baked-in plants, including while a cat has knocked the
  // prop down. These clones belong below actors and the evening/night wash.
  for (const id of ['desk', 'sill'] as const) {
    const rect = potPlacement(id).patch;
    const patch = new Sprite(await Assets.load<Texture>(`/heroes-ai/pot-patch-${id}.png`));
    patch.label = `pot-patch-${id}`;
    patch.eventMode = 'none';
    patch.position.set(rect.x, rect.y);
    patch.width = rect.width; patch.height = rect.height;
    container.addChild(patch);
  }
  const prefersReducedMotion = () => typeof options.reducedMotion === 'function' ? options.reducedMotion()
    : options.reducedMotion ?? (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let timeOfDay = options.timeOfDay ?? (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('time') === 'night' ? 'night' : new URLSearchParams(window.location.search).get('time') === 'day' ? 'day' : 'auto');

  // The open electrical-panel door occupies x194–219, y93–222. Keep
  // the indicator on its upper grey surface, clear of the hinge and handle.
  const lamp = new Container();
  lamp.label = 'dcm-panel-indicator';
  lamp.addChild(new Graphics().rect(201, 122, 7, 7).fill(0x343638));
  const lampStates = {
    green: new Graphics().rect(203, 124, 3, 3).fill(0x78cc72),
    red: new Graphics().rect(203, 124, 3, 3).fill(0xe36b5e),
    unknown: new Graphics().rect(203, 124, 3, 3).fill(0x88918e),
    off: new Graphics().rect(203, 124, 3, 3).fill(0x643f3b),
  };
  for (const state of Object.values(lampStates)) {
    state.visible = false;
    lamp.addChild(state);
  }
  lampStates.unknown.visible = true;
  container.addChild(lamp);

  const crop = (x: number, y: number, width: number, height: number) => {
    const sprite = new Sprite(new Texture({
      source: texture.source,
      frame: artTextureFrame(x, y, width, height),
    }));
    sprite.position.set(x, y);
    sprite.width = width;
    sprite.height = height;
    container.addChild(sprite);
    return sprite;
  };

  // These rectangles are the existing green LED pixels in Motya's rack.
  // Tinting their exact source crops dims them without drawing a new rack.
  const rackLights: Sprite[] = [];
  for (const y of [123, 135, 146, 158, 169]) {
    for (const [x, width] of [[659, 2], [695, 5], [701, 2]]) {
      const light = crop(x, y, width, 5);
      light.label = 'motya-rack-led';
      light.tint = 0x53664f;
      rackLights.push(light);
    }
  }

  // The llama's silhouette is already painted at x510–551, y214–288.
  // Move only its original facial pixels inside a fixed interior mask;
  // the ears, outline, tabletop and feet remain the original painting.
  const llamaFace = crop(513, 230, 18, 16);
  llamaFace.label = 'painted-llama-face';
  const faceMask = new Graphics().rect(515, 232, 14, 11).fill(0xffffff);
  container.addChild(faceMask);
  llamaFace.mask = faceMask;
  llamaFace.visible = false;
  let nextLlama = 180 + Math.random() * 120;
  let llamaStart = -Infinity;

  // One soft wash, confined to the painting; the scene's geometry does not move.
  const evening = new Graphics().rect(left, top, width, height).fill(0x172039);
  evening.label = 'office-evening-tone'; evening.eventMode = 'none'; evening.alpha=0;
  container.addChild(evening);
  const sky = new Graphics().rect(375,32,242,147).fill(0x13294c);
  sky.label='office-night-window';
  const stars = new Container(); stars.label = 'office-window-stars'; stars.eventMode = 'none'; stars.alpha=0;
  // Individual panes keep stars off the mullions, sill, and outside brickwork.
  const windowMask = new Graphics();
  for (const [x,w] of [[377,35],[416,36],[457,35],[498,35],[539,36],[580,35]]) {
    windowMask.rect(x,32,w,31).rect(x,71,w,50);
  }
  windowMask.fill(0xffffff); container.addChild(sky,stars,windowMask);
  const windowContent = new Container(); windowContent.label="office-window-content";
  container.addChild(windowContent); windowContent.addChild(sky,stars); container.addChild(windowMask); windowContent.mask=windowMask;
  const starDots = Array.from({length: 14}, (_,i) => {
    const dot=new Graphics().circle(382+(i*47)%229,40+(i*29)%128, i%3===0 ? .8 : .55).fill(0xe7efff);
    stars.addChild(dot); return dot;
  });
  const tabletLight = new Graphics().circle(layout.fixtures.JH.status_light.x,layout.fixtures.JH.status_light.y, .85).fill(0xffffff);
  tabletLight.label='tablet-status-light'; tabletLight.eventMode='none'; tabletLight.alpha=.08; container.addChild(tabletLight);

  const clouds = new Container(); clouds.label='office-day-clouds'; windowContent.addChild(clouds);
  const cloudShapes = [0,1,2].map(i=>{
    const cloud=new Graphics().ellipse(0,0,22+i*4,3).ellipse(12,-2,15,4).fill({color:0xeaf5ff,alpha:.22});
    clouds.addChild(cloud); return cloud;
  });
  const deskLamps = new Container(); deskLamps.label='office-warm-lamps'; container.addChild(deskLamps);
  for(const [x,y] of [[186,299],[351,460],[279,299],[752,372],[813,207]]) {
    const light = new Graphics();
    for (let ring=3;ring>=1;ring--) light.ellipse(x,y,ring*13,ring*6).fill({color:0xffc76e,alpha:.065});
    light.circle(x,y-13,1.5).fill({color:0xffe6ad,alpha:.85});
    deskLamps.addChild(light);
  }
  const steam = new Container(); steam.label='office-cup-steam'; container.addChild(steam);
  const wisps = [[308,497],[793,358],[925,506]].map(([x,y],i)=>{
    const wisp=new Graphics().moveTo(0,0).bezierCurveTo(-3,-4,4,-7,0,-12).stroke({color:0xf2e5d2,alpha:.55,width:.8});
    wisp.position.set(x,y); steam.addChild(wisp); return {wisp,x,y,phase:i*11};
  });
  const desks = options.monitors ?? createDeskEnvironment(container,prefersReducedMotion);
  if(options.monitors) container.addChild(desks.layer);

  return {
    container,
    setTime(mode: NonNullable<ArtEnvironmentOptions['timeOfDay']>){timeOfDay=mode;},
    monitors: desks,
    updateDesks(time: number, presence: ReadonlyMap<string,DeskPresence>) { desks.update(time,presence); },
    update(time: number, regression: RegressionResult, workerActive: boolean, quiet = false, tabletStatusColor?: number) {
      const reducedMotion = prefersReducedMotion();
      const lampState = regression === 'red'
        ? (reducedMotion || Math.floor(time * 2) % 2 === 0 ? 'red' : 'off')
        : regression;
      for (const [name, state] of Object.entries(lampStates)) {
        state.visible = name === lampState;
      }

      for (let i = 0; i < rackLights.length; i++) {
        const active = !quiet && (reducedMotion ? workerActive : workerActive
          ? (Math.floor(time * 3) + i) % 3 !== 0
          : time % 8 < 0.6 && i === Math.floor(time / 8) % rackLights.length);
        rackLights[i].tint = active ? (workerActive ? 0xffffff : 0x91b080) : 0x53664f;
      }

      if (!reducedMotion && time >= nextLlama) {
        llamaStart = time;
        nextLlama = time + 180 + Math.random() * 120;
      }
      const elapsed = time - llamaStart;
      llamaFace.visible = !reducedMotion && !quiet && elapsed >= 0 && elapsed < 2;
      if (llamaFace.visible) {
        // A gentle one-pixel facial wobble every three to five minutes.
        const envelope = Math.sin(elapsed * Math.PI / 2);
        llamaFace.x = 513 + Math.round(Math.sin(elapsed * Math.PI * 2) * envelope);
      }
      const local = new Date();
      const night = timeOfDay === 'night' ? 1 : timeOfDay === 'day' ? 0 : timeOfDay === 'morning' ? .12 : timeOfDay === 'evening' ? .65 : officeNightStrength(local.getHours()+local.getMinutes()/60);
      evening.alpha = night*.43;
      sky.alpha=night*.82;
      deskLamps.alpha=night;
      clouds.visible=!reducedMotion && night<.5;
      cloudShapes.forEach((cloud,i)=>cloud.position.set(355+(time*1.5+i*97)%285,48+i*31));
      steam.visible=!reducedMotion && !quiet;
      for(const {wisp,x,y,phase} of wisps) {
        const age=(time+phase)%27;
        wisp.visible=age<6; wisp.alpha=Math.sin(age/6*Math.PI)*.6;
        wisp.position.set(x+Math.sin(age)*1.5,y-age*.8);
      }
      stars.alpha = night;
      starDots.forEach((dot,i) => { dot.alpha = reducedMotion ? .7 : .65+Math.sin(time*.3+i)*.15; });
      const tabletError = tabletStatusColor !== undefined && tabletStatusColor === 0xef4444;
      tabletLight.tint = tabletStatusColor ?? 0x9af496;
      tabletLight.alpha = reducedMotion || tabletError ? .85 : time%23 < 1.2 ? .65 : .08;
    },
  };
}
