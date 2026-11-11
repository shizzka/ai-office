// Read-only production smoke and the requested 1440px screenshot, after restart.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.__PIXI_APP_INIT__=app=>window.liveOfficeApp=app);
  const response=await page.goto('http://127.0.0.1:3000/office/stream?time=day');
  await page.waitForFunction(()=>window.liveOfficeApp?.ticker.started && window.liveOfficeApp.stage.getChildByLabel('agents-layer')?.children.length===11);
  await page.screenshot({path:'output/office17c-1440.png'});
  const desktop=await page.evaluate(()=>({heroes:window.liveOfficeApp.stage.getChildByLabel('agents-layer').children.length,
    overflow:document.documentElement.scrollWidth>innerWidth,desk:!!window.liveOfficeApp.stage.getChildByLabel('sanya-desk-foreground')}));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForTimeout(200);
  const reduced=await page.evaluate(async()=>{
    const app=window.liveOfficeApp;
    const read=()=>app.stage.getChildByLabel('agents-layer').children.map(n=>{
      const p=n.children.find(p=>p.visible&&p.label.startsWith('hero-')),s=p.getChildByLabel('atlas-frame'),foot=s.toGlobal(s.pivot);
      return {name:p.label,foot:[foot.x,foot.y],skew:s.skew.x,rotation:p.rotation,scaleY:s.scale.y,ear:p.getChildByLabel('idle-ear')?.visible};
    });
    const first=read();await new Promise(r=>setTimeout(r,1300));return {first,last:read()};
  });
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(200);
  const mobile=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth}));
  const result={status:response.status(),desktop,mobile,reduced,errors};
  await writeFile('output/office17c-production.json',JSON.stringify(result,null,2)+'\n');
  assert.equal(result.status,200);assert.equal(desktop.heroes,11);assert.ok(desktop.desk);
  assert.ok(!desktop.overflow&&!mobile.overflow);assert.deepEqual(errors,[]);
  for(const a of reduced.first) {
    const b=reduced.last.find(b=>b.name===a.name);
    assert.equal(a.skew,0);assert.equal(b.skew,0);assert.equal(a.rotation,0);assert.equal(b.rotation,0);
    assert.ok(!a.ear&&!b.ear);assert.notEqual(a.scaleY,b.scaleY);
    assert.ok(Math.hypot(a.foot[0]-b.foot[0],a.foot[1]-b.foot[1])<=.05);
  }
  console.log('OFFICE-17c production smoke passed: HTTP 200, 11 heroes, desktop/mobile, reduced motion');
} finally {await browser.close();}
