// Read-only, isolated Pixi preview of the production factories. No office/API writes.
// Run: node tests/preview-heroes.mjs (http://127.0.0.1:3113)
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { outputFiles } = await build({
  stdin: {
    resolveDir: root, loader: 'ts', contents: `
      import { Application, Container, Graphics } from 'pixi.js';
      import { HEROES, resolveAppearance, animateHeroSprite, createHeroSprite } from './src/components/office/drawAgent';
      import * as legacy from './src/components/office/drawLegacyAgent';
      import { LEGACY_AGENT_IDS } from './src/components/office/heroRegistry';
      const names = Object.keys(HEROES);
      const poses = [['sit',0],['walk',0],['walk',1],['stretch',0],['cooler',0]] as const;
      window.heroQA = { ready: false, names, poses, bounds: [], archive: 0, blink: [], details: [] };
      const qa = window.heroQA;
      for (const [index, name] of names.entries()) {
        const c = HEROES[name];
        const row = document.createElement('section');
        row.innerHTML = '<div class="identity"><small>0' + (index+1) + '</small><h2>' + name[0].toUpperCase()+name.slice(1) + '</h2><p>'+c.role+'</p></div>';
        document.querySelector('main').append(row);
        const app = new Application();
        await app.init({ width: 1320, height: 178, resolution: 1, antialias: false, backgroundAlpha: 0, preference: 'webgl' });
        row.append(app.canvas);
        const identity = { id: 'arbitrary-preview-id-' + index, name };
        if (resolveAppearance(identity).kind !== 'hero') throw new Error('Name lookup failed: ' + name);
        const sprites = [];
        poses.forEach(([pose,frame],col) => {
          const sprite = createHeroSprite(identity, pose, frame);
          const bounds = sprite.getLocalBounds();
          qa.bounds.push({name,pose,frame,x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height});
          sprite.position.set(85 + col * 205, 159);
          sprite.scale.set(2);
          app.stage.addChild(sprite);
          sprites.push(sprite);
        });
        // True 1x and 2x examples, beside enlarged pose cells.
        [1,2].forEach((scale,i) => {
          const sprite = createHeroSprite(identity,'sit');
          sprite.position.set(1090 + i*125,159);
          sprite.scale.set(scale);
          app.stage.addChild(sprite);
        });
        if (c.head === 'server') {
          const sprite = sprites[0];
          animateHeroSprite(sprite,0,{working:true});
          qa.blink.push(sprite.getChildByLabel('worker-leds').alpha);
          animateHeroSprite(sprite,0.4,{working:true});
          qa.blink.push(sprite.getChildByLabel('worker-leds').alpha);
          animateHeroSprite(sprite,0,{working:true});
        }
        const sitting = sprites[0];
        animateHeroSprite(sitting, 179, {working:true});
        const rareLabel = name==='ася' ? 'review-sign' : name==='иваныч' ? 'voltage-probe' : null;
        const early = rareLabel ? sitting.getChildByLabel(rareLabel)?.visible : false;
        animateHeroSprite(sitting, 301, {working:true,responseSent:true,bugFound:true,regressionFailed:true});
        const during = rareLabel ? sitting.getChildByLabel(rareLabel)?.visible : null;
        const tail = sitting.getChildByLabel('dog-tail');
        const tailMoved = tail ? tail.rotation !== 0 : null;
        const red = sitting.getChildByLabel('regression-red');
        const redOn = red ? red.visible : null;
        animateHeroSprite(sitting, 310, {working:false});
        animateHeroSprite(sitting, 479, {working:true});
        const repeatTooSoon = rareLabel ? sitting.getChildByLabel(rareLabel)?.visible : false;
        qa.details.push({name,early,during,repeatTooSoon,tailMoved,redOn});
        app.render();
        app.stop();
        const raster=document.createElement('img'); raster.src=app.canvas.toDataURL();
        raster.width=1320; raster.height=178; app.canvas.replaceWith(raster); app.destroy(true);
      }
      const eggRow = document.createElement('section');
      eggRow.className = 'easter-row';
      eggRow.innerHTML = '<div class="identity"><small>БОНУС</small><h2>Пасхалки</h2><p>Детали + редкие жесты<br>каждые 3–5 минут</p></div>';
      document.querySelector('main').append(eggRow);
      for (const name of names) {
        const cell=document.createElement('div'); cell.className='egg-cell';
        const app=new Application();
        await app.init({width:132,height:150,resolution:1,antialias:false,backgroundAlpha:0});
        const sprite=createHeroSprite({id:'egg-'+name,name},'sit');
        sprite.position.set(56,135); sprite.scale.set(1.4); app.stage.addChild(sprite);
        animateHeroSprite(sprite,1.5,{preview:true,working:true,regressionFailed:name==='мотя',bugFound:true,responseSent:true});
        app.render(); app.stop(); const raster=document.createElement('img'); raster.src=app.canvas.toDataURL(); raster.width=132; raster.height=150; cell.append(raster); app.destroy(true);
        const captions={ярик:'Лама за монитором',лёха:'Уточка · works on my machine',ася:'Кактус · LGTM?',иваныч:'Термос · индикатор',тая:'Кот · пятно краски',саня:'Жук в банке',мотя:'Регрессия · LED',whoami:'sudo · замок · взгляд',люда:'Кактус в наушниках',шарик:'CV · хвост'};
        const caption=document.createElement('p'); caption.textContent=captions[name]; cell.append(caption); eggRow.append(cell);
      }
      // Verify every archived ID still routes through the exact archived factory.
      for (const id of LEGACY_AGENT_IDS) {
        for (const [pose,frame] of poses) {
          const sprite = createHeroSprite({id,name:'Archived '+id},pose,frame);
          if (sprite.label.startsWith('hero-')) throw new Error('Archive lookup failed: ' + id);
          sprite.destroy({children:true});
          qa.archive++;
        }
      }
      qa.ready = true;
    `,
  }, bundle: true, write: false, format: 'esm', target: 'es2022',
});
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>OFFICE-5 · Герои</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:36px 32px;background:#17222d;color:#ede9d9;font:14px system-ui}header{height:104px;border-bottom:1px solid #526174}h1{font-size:30px;margin:0 0 8px;letter-spacing:1px}header p{margin:0;color:#afc3c7}small{color:#83c2c5;font:13px monospace}.columns{display:grid;grid-template-columns:210px repeat(5,205px) 100px 150px;height:52px;align-items:center;color:#b0c6ca;font-size:12px;letter-spacing:1px;text-transform:uppercase}.columns span:not(:first-child){text-align:center}section{display:flex;height:178px;border-top:1px solid #485562;background:repeating-linear-gradient(90deg,#283540 0px,#283540 102px,#2b3843 102px,#2b3843 205px)}section:nth-child(even){background:repeating-linear-gradient(90deg,#303b46 0px,#303b46 102px,#34404a 102px,#34404a 205px)}.identity{width:210px;flex-shrink:0;padding:24px 18px;background:#1e2a35}h2{font-size:24px;margin:9px 0 7px}section p{margin:0;color:#a6bbc1;font-size:12px;line-height:1.6;max-width:180px}canvas,img{image-rendering:pixelated;width:1320px;height:178px}footer{padding-top:20px;color:#8faab3;font-size:12px}
.easter-row{height:220px}.egg-cell{width:132px;text-align:center}.egg-cell canvas,.egg-cell img{width:132px;height:150px}.egg-cell p{padding:3px;font-size:11px;line-height:1.5;color:#c3d6d2}</style><header><small>OFFICE-5 / КОМАНДА / 01.11.2026</small><h1>Десять характеров. Один офис.</h1><p>Pixi · общая сетка 40 × 60 · позы ×2 · справа контроль масштаба 1× / 2×</p></header><div class="columns"><span>Имя / роль</span><span>За работой</span><span>Шаг 01</span><span>Шаг 02</span><span>Потягивание</span><span>У кулера</span><span>1×</span><span>2×</span></div><main></main><footer>Актуальные функции drawAgent.ts · привязка по имени · прежняя команда сохранена в drawLegacyAgent.ts</footer><script type="module" src="/preview.js"></script></html>`;
const server = createServer(async (req, res) => {
  if (req.url === '/preview.js') {
    res.setHeader('Content-Type','text/javascript'); res.end(outputFiles[0].contents);
  } else if (req.url === '/office-bg.png') {
    res.setHeader('Content-Type','image/png'); res.end(await readFile(path.join(root,'public/office-bg.png')));
  } else if (req.url === '/favicon.ico') { res.writeHead(204).end();
  } else { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html); }
});
server.listen(3113,'127.0.0.1',()=>console.log('Hero preview: http://127.0.0.1:3113'));
