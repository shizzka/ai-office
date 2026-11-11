import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';

// Regions in the accepted 6x atlas, confined to one ear. The body and its
// reflection never change; a duplicate of the SAME texture moves inside this
// region for a rare, slow twitch. No tail_1/tail_2 artwork is used.
const ears: Record<string, Record<string, readonly [number, number, number, number]>> = {
  'коржик': { work: [264, 428, 21, 25], stretch: [247, 496, 20, 23], cup: [328, 508, 23, 20] },
  'масяня': { work: [251, 428, 23, 24], stretch: [256, 507, 18, 22], cup: [326, 508, 23, 21] },
};

export function createCatIdleEar(root: Container, sprite: Sprite, name: string, ratio: number) {
  const ear = new Sprite(sprite.texture);
  ear.label = 'idle-ear'; ear.visible = false;
  const bodyMask = new Graphics(), earMask = new Graphics();
  bodyMask.label = 'idle-ear-body-mask'; earMask.label = 'idle-ear-mask';
  bodyMask.visible = false; earMask.visible = false;
  root.addChild(ear, bodyMask, earMask);
  let previousFrame = '';
  const crops = new Map<string, Texture>();
  ear.on('destroyed', () => { for (const texture of crops.values()) texture.destroy(); });
  return {
    update(frame: string, amount: number) {
      const region = ears[name]?.[frame];
      ear.visible = !!region && amount !== 0;
      bodyMask.visible = ear.visible; earMask.visible = ear.visible;
      if (!ear.visible || !region) { sprite.mask = null; return; }
      const [x, y, w, h] = region.map(v => v * ratio / 6);
      if (frame !== previousFrame) {
        // A normal mask with a hole also works on render targets without an
        // inverse stencil. The overlay is physically cropped to the ear.
        bodyMask.clear().rect(0, 0, sprite.texture.width, sprite.texture.height).fill(0xffffff)
          .rect(x, y, w, h).cut();
        earMask.clear().rect(x, y, w, h).fill(0xffffff);
        if (!crops.has(frame)) crops.set(frame, new Texture({ source: sprite.texture.source,
          frame: new Rectangle(sprite.texture.frame.x + x, sprite.texture.frame.y + y, w, h) }));
        previousFrame = frame;
      }
      for (const mask of [bodyMask, earMask]) {
        mask.pivot.copyFrom(sprite.pivot); mask.scale.copyFrom(sprite.scale);
        mask.position.copyFrom(sprite.position);
      }
      sprite.mask = bodyMask;
      ear.mask = earMask;
      ear.texture = crops.get(frame)!;
      ear.scale.copyFrom(sprite.scale);
      // Rotate about the ear base, while its mask follows breathing at the feet.
      ear.pivot.set(w / 2, h);
      ear.position.set(sprite.x + (x + w / 2 - sprite.pivot.x) * sprite.scale.x,
        sprite.y + (y + h - sprite.pivot.y) * sprite.scale.y);
      ear.rotation = amount;
    },
  };
}
