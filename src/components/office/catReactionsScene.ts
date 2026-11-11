import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { placeAnnotation, type Rect } from './officeAnnotations';
import { catSleepZzzAlpha, type CatState } from './catBehavior';

interface CatNode { cat?: CatState; annotation: Container; container: Container }
const label = (text: string, size: number, fill: number) => new Text({ text,
  style: new TextStyle({ fontFamily: 'Arial, sans-serif', fontSize: size, fill, fontWeight: 'bold', wordWrap: true, wordWrapWidth: 255 }) });

/** Separate non-interactive layer: bubbles cannot steal taps or name hit areas. */
export function createCatReactionsScene(layer: Container) {
  const views = new Map<CatState, { root: Container; bg: Graphics; phrase: Text; purr: Text; hearts: Text; zzz: Text }>();
  return {
    tick(nodes: CatNode[], now: number, night: boolean, holiday = false) {
      const live = new Set(nodes.flatMap(n => n.cat ? [n.cat] : []));
      for (const [cat, view] of views) if (!live.has(cat)) { view.root.destroy({ children: true }); views.delete(cat); }
      const obstacles: Rect[] = nodes.map(n => ({ x: n.annotation.x - n.annotation.width/2, y: n.annotation.y,
        width: n.annotation.width, height: 20 }));
      for (const node of nodes) {
        const cat = node.cat;
        if (!cat) continue;
        let view = views.get(cat);
        if (!view) {
          const root = new Container(); root.label = `cat-reaction-${cat.name}`; root.eventMode = 'none';
          const bg = new Graphics(), phrase = label('', 12, 0xfff4e3), purr = label('мур ❤️', 13, 0xffaccc),
            hearts = label('♥  ♥', 15, 0xff79a9), zzz = label('z z z', 11, 0xaac5d4);
          root.addChild(bg, phrase, purr, hearts, zzz); layer.addChild(root);
          views.set(cat, view = { root, bg, phrase, purr, hearts, zzz });
        }
        const { root, bg, phrase, purr, hearts, zzz } = view;
        const reaction = cat.reaction && now < cat.reaction.until ? cat.reaction : undefined;
        bg.visible = phrase.visible = purr.visible = hearts.visible = !!reaction;
        const sleepAlpha = catSleepZzzAlpha(cat, now, night, holiday);
        zzz.visible = sleepAlpha > 0;
        root.visible = !!reaction || zzz.visible;
        if (reaction) {
          phrase.text = reaction.phrase; phrase.position.set(9, 28);
          purr.position.set(9, 7);
          const age = now - reaction.at;
          hearts.position.set(72 + Math.sin(age*2)*3, 10 - Math.min(age, 2)*7);
          hearts.alpha = Math.max(0, 1-age/3);
          const width = Math.max(140, phrase.width + 18), height = phrase.height + 37;
          bg.clear().roundRect(0, 0, width, height, 8).fill({ color: 0x302c32, alpha: .97 }).stroke({ color: 0xca91ad, width: 1 });
          const card = placeAnnotation({ x: cat.position.x-width/2, y: node.annotation.y-height-9, width, height }, obstacles, 960, 600);
          root.position.set(card.x, card.y); obstacles.push(card);
        } else if (zzz.visible) {
          zzz.position.set(0, -Math.sin(now*1.5)*2);
          zzz.alpha = sleepAlpha;
          root.position.set(node.annotation.x+20, node.annotation.y-18);
        }
      }
    },
  };
}
