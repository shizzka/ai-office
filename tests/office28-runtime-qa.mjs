// Real production Next + copied SQLite + real worker/ws-server. No live writes.
// Start tests/office28-production-server.cjs with OFFICE28_BUILD pointing at /tmp.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/office28-runtime-qa.mjs before|fixed|stream|recovery
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/home/q/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs');
const mode = process.argv[2] || 'fixed', shortStream=['stream','recovery'].includes(mode), origin = process.env.OFFICE28_ORIGIN || `http://127.0.0.1:${mode === 'before' ? 3153 : 3151}`;
const directory = 'output/playwright/office28/', events = [], errors = [], requests = [];
const art = JSON.parse(await readFile('public/heroes-ai/atlas.json', 'utf8'));
const legacy = JSON.parse(await readFile('public/heroes/atlas.json', 'utf8'));
const browser = await chromium.launch({executablePath:process.env.OFFICE28_CHROMIUM || '/home/q/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
console.log('browser launched');
const page = await browser.newPage({viewport:{width:1280,height:800}});
const cdp=await page.context().newCDPSession(page);
page.on('console', message=>{if(message.type()==='error')console.log('browser-console-error: '+message.text());});
page.on('crash',()=>console.log('PAGE CRASHED'));
page.on('pageerror', error => errors.push(error.message));
page.on('websocket', socket => { requests.push({event:'ws-open',url:socket.url()}); socket.on('close',()=>requests.push({event:'ws-close',url:socket.url()})); });
await page.addInitScript(({art,legacy})=>{
  window.productionQA=null;
  window.__PIXI_APP_INIT__ = app => {
    const norm = s => s?.toLowerCase().replaceAll('ё','е');
    const q = window.productionQA = {app,frames:0,violations:[],exits:[],firstVisible:null,maxSpecial:0,last:new Map(),counts:[],initial:[],rendered:0};
    q.sample = () => (app.stage?.getChildByLabel('agents-layer')?.children || []).filter(n=>n.label.startsWith('agent-node-')).map(n=>{
      const pose=n.children.find(p=>p.visible&&p.label.startsWith('hero-')), sprite=pose?.getChildByLabel('atlas-frame'), f=sprite?.texture.frame;
      const renderer=pose?.label.endsWith('-art')?'art':'atlas', name=pose?.label.slice(5).replace(/-(sit|work|walk|stretch|cooler)-(art|atlas)$/,'');
      const hero=Object.entries(renderer==='art'?art.heroes:legacy.heroes).find(([id,h])=>norm(h.name??id)===name)?.[1];
      const frame=hero&&f?Object.entries(hero.frames).find(([,v])=>v.x===f.x&&v.y===f.y&&v.w===f.width&&v.h===f.height)?.[0]:null;
      return {name,frame,visible:n.visible&&n.alpha>.01&&!!pose&&pose.alpha>.01,x:n.x,y:n.y,uid:n.uid};
    });
    q.check = () => {
      const sample=q.sample(), visible=sample.filter(n=>n.visible), special=visible.filter(n=>/^(stretch|easter)/.test(n.frame||'')&&!['коржик','масяня'].includes(n.name));
      if(!q.firstVisible&&visible.length)q.firstVisible={frame:q.frames,sample};
      if(q.initial.length<10&&visible.length)q.initial.push(sample);
      q.maxSpecial=Math.max(q.maxSpecial,special.length);
      const fail=(type,detail)=>{if(q.violations.length<12)q.violations.push({frame:q.frames,type,detail});};
      if(special.length>=3)fail('mass-gesture',special);
      if(visible.some(n=>!n.frame))fail('unknown-default-texture',visible.filter(n=>!n.frame));
      if(q.firstVisible&&q.last.size>=5&&visible.length===0)fail('all-hidden',sample);
      for(const n of sample){const old=q.last.get(n.name);if(old?.visible&&!n.visible){q.exits.push({frame:q.frames,...n});if(Math.hypot(n.x-804,n.y-476)>2&&!['евгений','коржик','масяня'].includes(n.name))fail('hidden-outside-door',n);}}
      if(sample.length<q.last.size-2)fail('roster-removed',sample);
      if(q.counts.at(-1)?.count!==visible.length)q.counts.push({frame:q.frames,count:visible.length});
      q.last=new Map(sample.map(n=>[n.name,n]));q.frames++;
    };
    // Simulation uses HIGH priority; inspect the frame before Pixi's LOW render.
    queueMicrotask(()=>app.ticker.add(q.check, undefined, 0));
  };
},{art,legacy});
const base=Date.parse('2026-11-02T09:00:00Z');
const control=async input=>{const response=await page.request.post(origin+'/qa/control',{data:input});assert.equal(response.status(),200);return response.json();};
const settle=async()=>page.waitForTimeout(350);
const ready=async()=>page.waitForFunction(()=>{let l=window.productionQA?.app?.ticker?._head?.next;while(l){if(l.priority===25)return true;l=l.next;}return false;},null,{timeout:60000});
const setupClock=async()=>page.evaluate(()=>{
  const q=productionQA;q.app.stop();q.app.ticker.maxFPS=0;q.app.ticker.remove(q.app.render,q.app);
  window.qaTime=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>qaTime});Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
  q.tick=seconds=>{for(let k=0;k<Math.round(seconds*20);k++){qaTime+=50;q.app.ticker.update(qaTime);}};
});
const tick=async seconds=>{for(let t=0;t<seconds;t+=1){await page.evaluate(s=>{productionQA.tick(s);productionQA.app.renderer.gl?.finish();},Math.min(1,seconds-t));if(t%30===29)console.log('simulated '+(t+1)+'/'+seconds+' s');}};
const sample=async label=>{
  const result=await page.evaluate(()=>{const q=productionQA;return {frames:q.frames,firstVisible:q.firstVisible,sample:q.sample(),violations:q.violations,maxSpecial:q.maxSpecial,counts:q.counts,exits:q.exits};});
  events.push({label,...result});console.log(JSON.stringify({label,frames:result.frames,visible:result.sample.filter(n=>n.visible).length,maxSpecial:result.maxSpecial,violations:result.violations.length}));
  await writeFile(directory+mode+'-runtime.json',JSON.stringify({mode,passed:false,events,errors,requests},null,2));return result;
};
const capture=async filename=>{const {data}=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});await writeFile(filename,Buffer.from(data,'base64'));};
const screenshot=async label=>{await page.evaluate(()=>{productionQA.app.render();productionQA.app.renderer.gl?.finish();});await capture(directory+mode+'-'+label+'.png');};
try {
  console.log('starting control');await control({status:'working',quota:'off',now:base,refresh:true});console.log('control ready');
  await page.goto(origin+(shortStream?'/office/stream?stream=1':'/office'));console.log('office loaded');await page.waitForURL(url=>url.pathname==='/office/stream',{timeout:60000});console.log('stream loaded');
  await page.waitForFunction(()=>window.productionQA?.app?.stage.getChildByLabel('agents-layer')?.children.length>5,null,{timeout:60000});
  await ready();await settle();await setupClock();await tick(1);await sample('first-mount');
  if(mode!=='recovery'){
  await tick(shortStream?10:330);await sample('completed-rare-gestures');
  // Let the real API status change unseat offline workers BEFORE starting a scene.
  await control({status:'offline',refresh:true});await settle();await tick(1);
  await control({now:base+332000,scene:'cat-wash'});await settle();await tick(1);
  const reset=await sample('shared-reset');await screenshot('shared-reset');
  if(mode==='before'){
    // Art desks mask the easter override while seated during a shared scene.
    // After the scene expires, offline heroes stand up and expose the revived deadlines.
    await control({now:base+365000});await settle();await tick(2);
    const ended=await sample('scene-end-standing');await screenshot('scene-end-standing');
    assert.ok(ended.violations.some(v=>v.type==='mass-gesture'),'old bundle must reproduce >=3 simultaneous gestures');
    await control({quota:'on'});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await settle();await tick(.5);
    await sample('quota-removal');await screenshot('quota-removal');
    assert.ok(events.at(-1).sample.length<=reset.sample.length-3,'quota removes multiple nodes in old bundle');
  } else {
    await control({now:base+365000,status:'working',refresh:true});await settle();await tick(35);
    await control({disconnect:true});await page.waitForTimeout(5600);await tick(1);await sample('real-ws-reconnect');
    const ids=await page.evaluate(()=>productionQA.sample().map(n=>n.uid).sort((a,b)=>a-b));
    for(let cycle=0;cycle<2;cycle++){
      await control({quota:'on'});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await settle();await tick(1);await sample('quota-start-'+cycle);
      await tick(35);await sample('quota-home-'+cycle);await screenshot('quota-home-'+cycle);
      await control({quota:'off'});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await settle();await tick(35);await sample('quota-return-'+cycle);
      assert.deepEqual(await page.evaluate(()=>productionQA.sample().map(n=>n.uid).sort((a,b)=>a-b)),ids,'quota must preserve nodes');
    }
    await control({status:'idle',now:Date.parse('2026-11-02T15:59:00Z'),refresh:true});await settle();await tick(2);
    // First observe off-shift at 19:01, so the server schedules its 2..15 minute departure delays.
    await control({now:Date.parse('2026-11-02T16:01:00Z')});await settle();await tick(1);
    await control({now:Date.parse('2026-11-02T20:59:00Z')});await settle();await tick(35);const evening=await sample('late-evening');if(shortStream)assert.ok(evening.sample.filter(n=>n.visible).length<11,'evening actually sends people home');
    await control({now:Date.parse('2026-11-02T21:01:00Z')});await settle();await tick(2);await sample('midnight');
    await control({status:'working',refresh:true});await settle();await tick(35);await sample('urgent-return');
    // Hold a daytime working roster for the remainder of 25 simulated minutes.
    await control({now:base+500000});await settle();
    for(let k=0;k<(shortStream?0:10);k++){await tick(100);await sample('soak-'+k);}
    const result=await sample(shortStream?'stream-finished':'25min-finished');await screenshot(shortStream?'stream-finished':'25min-finished');
    if(!shortStream)assert.ok(result.frames>=30000,'at least 25 minutes at 20 Hz');assert.deepEqual(result.violations,[]);
    assert.ok(requests.filter(r=>r.event==='ws-open').length>=2,'real socket reconnected');
  }
  }
  if(mode!=='before'){
    // Delay cold textures, then inspect all first visible ticks of the new app.
    await page.route('**/*.png',async route=>{await new Promise(r=>setTimeout(r,200));await route.continue();});
    await page.reload();await page.waitForFunction(()=>window.productionQA?.app?.stage.getChildByLabel('agents-layer')?.children.length>5,null,{timeout:60000});await page.waitForFunction(()=>window.productionQA?.firstVisible?.sample.filter(n=>n.visible).length>5);await settle();
    const cold=await sample('cold-remount');assert.deepEqual(cold.violations,[]);await screenshot('cold-remount');
    await page.unroute('**/*.png');
    const healthyErrors=[...errors];
    // Emulate a stale deployment document referencing missing chunks.
    await page.route('**/_next/static/chunks/**',route=>route.abort('failed'));
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForTimeout(800);
    const stale={canvas:await page.locator('canvas').count(),errors:errors.slice(healthyErrors.length)};events.push({label:'stale-chunks',...stale});
    await capture(directory+mode+'-stale-chunks.png');
    await page.unroute('**/_next/static/chunks/**');await page.reload();await page.waitForFunction(()=>window.productionQA?.app?.stage.getChildByLabel('agents-layer')?.children.length>5,null,{timeout:60000});await settle();
    await page.waitForFunction(()=>window.productionQA?.firstVisible?.sample.filter(n=>n.visible).length>5);await sample('restored-chunks');await screenshot('restored-chunks');assert.deepEqual(healthyErrors,[]);
    if(shortStream){
      for(const [label,value] of [['Отрисовка героев','atlas'],['Тема офиса','loft'],['Тема офиса','cyber'],['Тема офиса','art'],['Отрисовка героев','art']]){
        const old=await page.evaluate(()=>productionQA.app.stage.uid);
        await page.getByRole('combobox',{name:label}).selectOption(value);
        await page.waitForFunction(old=>window.productionQA?.app?.stage?.uid!==old&&window.productionQA?.firstVisible?.sample.filter(n=>n.visible).length>5,old,{timeout:60000});
        const remount=await sample('switch-'+label+'-'+value);assert.deepEqual(remount.violations,[]);
      }
      await screenshot('renderer-theme-switches');
      assert.ok(requests.some(r=>r.event==='ws-open'&&r.url.endsWith('?stream=1')));
    }
  }
  await writeFile(directory+mode+'-runtime.json',JSON.stringify({mode,passed:true,events,errors,requests},null,2));
  console.log(JSON.stringify({passed:true,mode}));
} catch(error){await writeFile(directory+mode+'-runtime.json',JSON.stringify({mode,passed:false,error:String(error),events,errors,requests},null,2));throw error;}
finally {await browser.close();}
