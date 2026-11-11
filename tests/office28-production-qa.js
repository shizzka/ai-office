async page => {
 const origin='http://127.0.0.1:3151',base=Date.parse('2026-11-02T09:00:00Z'),errors=[],events=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__PIXI_APP_INIT__=app=>{window.productionQA={app};};});
 const control=async data=>{const r=await page.request.post(origin+'/qa/control',{data});if(!r.ok())throw Error(await r.text());return r.json();};
 await control({status:'working',quota:'off',now:base,refresh:true});
 await page.goto(origin+'/office');await page.waitForURL('**/office/stream');
 await page.waitForFunction(()=>window.productionQA?.app?.stage.getChildByLabel('agents-layer')?.children.length>5,null,{timeout:90000});
 await page.waitForTimeout(1200);
 const manifests=await Promise.all(['/heroes-ai/atlas.json','/heroes/atlas.json'].map(async url=>(await page.request.get(origin+url)).json()));
 await page.evaluate(([art,legacy])=>{
  const q=productionQA;q.art=art;q.legacy=legacy;q.app.stop();q.app.ticker.maxFPS=0;q.app.ticker.remove(q.app.render,q.app);
  window.qaTime=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>qaTime});Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
  q.frames=0;q.violations=[];q.history=[];
  q.sample=()=>q.app.stage.getChildByLabel('agents-layer').children.filter(n=>n.label.startsWith('agent-node-')).map(n=>{
   const pose=n.children.find(p=>p.visible&&p.label.startsWith('hero-')),s=pose?.getChildByLabel('atlas-frame'),f=s?.texture.frame;
   const renderer=pose?.label.endsWith('-art')?'art':'atlas';const name=pose?.label.slice(5).replace(/-(sit|work|walk|stretch|cooler)-(art|atlas)$/,'');
   const hero=Object.values(renderer==='art'?q.art.heroes:q.legacy.heroes).find(h=>h.name?.toLowerCase().replaceAll('ё','е')===name);
   const frame=hero&&f?Object.entries(hero.frames).find(([,v])=>v.x===f.x&&v.y===f.y)?.[0]:null;
   return {name,frame,visible:n.visible&&n.alpha>.01&&!!pose&&pose.alpha>.01,x:n.x,y:n.y,uid:n.uid};
  });
  q.tick=seconds=>{for(let k=0;k<Math.ceil(seconds*20);k++){qaTime+=50;q.app.ticker.update(qaTime);const s=q.sample(),special=s.filter(n=>n.visible&&/^(stretch|easter)/.test(n.frame||''));if(special.length>=3&&q.violations.length<10)q.violations.push({frame:q.frames,special});q.frames++;}};
 },manifests);
 const tick=async s=>{for(let t=0;t<s;t+=10)await page.evaluate(s=>productionQA.tick(s),Math.min(10,s-t));};
 const sample=async label=>{const v=await page.evaluate(()=>({frames:productionQA.frames,sample:productionQA.sample(),violations:productionQA.violations}));events.push({label,...v});return v;};
 await tick(330);await sample('working');
 await control({status:'offline',now:base+330000,scene:'cat-wash',refresh:true});await page.waitForTimeout(1500);await tick(1);await sample('offline-shared-reset');
 await page.evaluate(()=>productionQA.app.render());await page.screenshot({path:'output/playwright/office28/production-reset.png'});
 await control({now:base+360000,status:'working',refresh:true});await page.waitForTimeout(100);await tick(3);
 await control({disconnect:true});await page.waitForTimeout(5500);await tick(1);await sample('real-reconnect');
 await control({quota:'on'});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(300);await tick(1);await sample('quota-on');await tick(35);await sample('quota-door');
 await control({quota:'off'});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(300);await tick(35);await sample('quota-return');
 await control({now:Date.parse('2026-11-02T15:59:00Z'),status:'idle',refresh:true});await page.waitForTimeout(100);await tick(2);
 await control({now:Date.parse('2026-11-02T20:59:00Z')});await page.waitForTimeout(100);await tick(35);await sample('late-evening');
 await control({now:Date.parse('2026-11-02T21:01:00Z')});await page.waitForTimeout(100);await tick(2);await sample('midnight');
 await control({status:'working',refresh:true});await page.waitForTimeout(200);await tick(35);await sample('urgent-return');
 await page.evaluate(()=>productionQA.app.render());await page.screenshot({path:'output/playwright/office28/production-final.png'});
 // Failed chunk fetch on a stale document, then restore serving and reload.
 await page.route('**/_next/static/chunks/**',route=>route.abort('failed'));
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForTimeout(800);
 const stale={canvas:await page.locator('canvas').count(),text:(await page.locator('body').innerText()).slice(0,300)};
 await page.unroute('**/_next/static/chunks/**');await page.reload();
 await page.waitForFunction(()=>window.productionQA?.app?.stage.getChildByLabel('agents-layer')?.children.length>5,null,{timeout:90000});
 await page.waitForTimeout(800);await page.screenshot({path:'output/playwright/office28/production-reload.png'});
 const violations=events.flatMap(e=>e.violations);if(violations.length)throw Error(JSON.stringify({violations,events}));
 return {passed:true,errors,events,stale,recoveredCanvas:await page.locator('canvas').count()};
}
