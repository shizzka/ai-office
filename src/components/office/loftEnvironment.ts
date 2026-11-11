import { Assets, Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js';
import { OFFICE_LAYOUT, type RegressionResult } from './officeLayout';

/** Loads Taя's original PNGs unchanged. All live objects share the office ticker. */
export async function createLoftEnvironment() {
  const env = new Container();
  env.label = 'office-environment';
  const objects = OFFICE_LAYOUT.live_objects;
  const urls = ['/office-bg-loft.png', ...Object.values(objects.panel.variants), ...objects.rack_lights.frames,
    ...objects.window.rain, ...objects.window.gulls, objects.llama.image];
  // The office CSP disallows blob workers. Decode these tiny PNGs directly
  // with createImageBitmap; the security policy can stay unchanged.
  Assets.setPreferences({ preferWorkers: false });
  const textures = new Map<string, Texture>();
  await Promise.all(urls.map(async url => {
    const texture = await Assets.load<Texture>(url);
    texture.source.scaleMode = 'nearest';
    textures.set(url, texture);
  }));
  const add = (url: string, rect: { x: number; y: number; width: number; height: number }, label: string) => {
    const sprite = new Sprite(textures.get(url)!);
    sprite.label = label;
    sprite.position.set(rect.x, rect.y);
    sprite.width = rect.width; sprite.height = rect.height;
    env.addChild(sprite);
    return sprite;
  };
  add('/office-bg-loft.png', { x: 0, y: 0, ...OFFICE_LAYOUT.canvas }, 'loft-background');
  const panel = add(objects.panel.variants.green, objects.panel, 'dcm-panel');
  // An absent result must not be presented as a successful regression.
  const unknownLamp = new Graphics().rect(objects.panel.x + 56, objects.panel.y + 10, 8, 8).fill(0x61777b);
  env.addChild(unknownLamp);
  const lights = add(objects.rack_lights.frames[0], objects.rack_lights, 'motya-rack-lights');
  const weather = add(objects.window.gulls[0], objects.window, 'window-weather');
  const llama = add(objects.llama.image, objects.llama, 'yarik-llama');
  const nextWeatherDelay = () => 60 + Math.random() * 90;
  let nextWeather = nextWeatherDelay(), weatherEnd = 0, weatherKind: 'rain' | 'gulls' = 'gulls';
  let nextLlama = 180 + Math.random() * 120, llamaEnd = 0;
  weather.visible = false;
  // Reuse exact tabletop pixels as an occluding foreground; art stays unchanged.
  const foreground = new Container();
  foreground.label = 'desk-foreground';
  const background = textures.get('/office-bg-loft.png')!;
  for (const desk of OFFICE_LAYOUT.foreground_desks) {
    const top = new Sprite(new Texture({ source: background.source,
      frame: new Rectangle(desk.x, desk.y, desk.width, desk.height) }));
    top.position.set(desk.x, desk.y);
    foreground.addChild(top);
  }
  return {
    container: env,
    foreground,
    update(time: number, regression: RegressionResult, workerActive: boolean) {
      const blink = Math.floor(time * 2) % 2;
      panel.texture = textures.get(regression === 'red'
        ? objects.panel.variants[blink ? 'red_off' : 'red'] : objects.panel.variants.green)!;
      unknownLamp.visible = regression === 'unknown';
      lights.texture = textures.get(objects.rack_lights.frames[workerActive ? Math.floor(time * 3) % 2 : 0])!;
      lights.alpha = workerActive ? 1 : 0.5;
      if (time >= nextWeather) {
        weatherKind = Math.random() < 0.45 ? 'rain' : 'gulls';
        weatherEnd = time + (weatherKind === 'rain' ? 8 : 3);
        nextWeather = weatherEnd + nextWeatherDelay();
      }
      weather.visible = time < weatherEnd;
      if (weather.visible) weather.texture = textures.get(objects.window[weatherKind][Math.floor(time * (weatherKind === 'rain' ? 4 : 2)) % 2])!;
      if (time >= nextLlama) { llamaEnd = time + 2; nextLlama = time + 180 + Math.random() * 120; }
      llama.y = objects.llama.y + (time < llamaEnd ? Math.round(Math.sin(time * 5)) : 0);
    },
  };
}
