// Headless screenshot acceptance on the live PixelOffice renderer.
// NODE_PATH=<directory containing playwright> node tests/office17c-visible.mjs
// Start the read-only fixture first: node tests/preview-office17.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const runName = process.env.OFFICE_QA_NAME || 'office17c';
const directory = `output/playwright/${runName}`;
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.officeQA={};
    window.__PIXI_APP_INIT__=app=>window.officeQA.app=app;
  });
  await page.clock.install();
  await page.goto(process.env.OFFICE_QA_URL || 'http://127.0.0.1:3127?time=night');
  await page.waitForFunction(()=>window.officeQA?.app?.ticker.started && window.officeQA.app.stage.getChildByLabel('agents-layer')?.children.length===11);
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  const boxes=await page.evaluate(()=>{
    const q=window.officeQA,app=q.app;
    const canvas=app.canvas.getBoundingClientRect();
    const sx=canvas.width/app.screen.width,sy=canvas.height/app.screen.height;
    const nodes=app.stage.getChildByLabel('agents-layer').children;
    const read=()=>nodes.map(n=>{
      const p=n.children.find(c=>c.visible && c.label.startsWith('hero-'));
      const s=p.getChildByLabel('atlas-frame'),foot=s.toGlobal(s.pivot);
      return {name:p.label.split('-')[1],foot:[foot.x*sx,foot.y*sy],rotation:p.rotation,x:p.x,skew:s.skew.x};
    });
    q.visibleSamples=[read()];q.sampleFeet=()=>q.visibleSamples.push(read());
    app.ticker.add(q.sampleFeet);
    return nodes.map(n=>{
      const p=n.children.find(c=>c.visible && c.label.startsWith('hero-'));
      const b=p.getChildByLabel('atlas-frame').getBounds();
      const left=Math.max(0,Math.floor(canvas.x+b.minX*sx)-4),top=Math.max(0,Math.floor(canvas.y+b.minY*sy)-4);
      return {name:p.label.split('-')[1],left,top,width:Math.min(1440-left,Math.ceil(b.width*sx)+8),height:Math.min(900-top,Math.ceil(b.height*sy)+8)};
    });
  });
  const frames=[];const started=Date.now();
  // Multiple before/after pairs within six seconds avoid aliasing periodic
  // breathing when the endpoints happen to have the same breath height.
  for(let i=0;i<=8;i++) {
    if(i)await page.clock.runFor(750);
    const png=await page.screenshot({path:`${directory}/${String(i).padStart(2,'0')}.png`});
    frames.push(await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true}));
  }
  const samples=await page.evaluate(()=>{
    const q=window.officeQA;q.app.ticker.remove(q.sampleFeet);return q.visibleSamples;
  });
  const rows=boxes.map(box=>{
    const changed=frames.slice(1).map(frame=>{
      let count=0;
      for(let y=box.top;y<box.top+box.height;y++)for(let x=box.left;x<box.left+box.width;x++) {
        const at=(y*frame.info.width+x)*4;
        // Ignore <=8 RGB levels of raster noise; count each pixel once.
        if(Math.max(...[0,1,2].map(c=>Math.abs(frame.data[at+c]-frames[0].data[at+c])))>8)count++;
      }
      return count/(box.width*box.height)*100;
    });
    const first=samples[0].find(s=>s.name===box.name);
    const motion=samples.flat().filter(s=>s.name===box.name);
    return {...box,changedPercent:changed,maxChangedPercent:Math.max(...changed),endpointChangedPercent:changed.at(-1),
      maxFootDrift:Math.max(...motion.map(s=>Math.hypot(s.foot[0]-first.foot[0],s.foot[1]-first.foot[1]))),
      maxRootXDrift:Math.max(...motion.map(s=>Math.abs(s.x-first.x))),
      maxRootRotation:Math.max(...motion.map(s=>Math.abs(s.rotation))),maxSkew:Math.max(...motion.map(s=>Math.abs(s.skew)))};
  });
  const result={clock:'live PixelOffice ticker; Playwright clock runs 6s of requestAnimationFrame, paused only for screenshots every .75s',animationSeconds:6,elapsedMs:Date.now()-started,samples:samples.length,viewport:[1440,900],rgbThreshold:8,rows,errors};
  await writeFile(`output/${runName}-visible.json`,JSON.stringify(result,null,2)+'\n');
  console.table(rows.map(({name,maxChangedPercent,endpointChangedPercent,maxFootDrift,maxSkew})=>({name,maxChangedPercent,endpointChangedPercent,maxFootDrift,maxSkew})));
  assert.deepEqual(errors,[],'browser errors');
  assert.equal(rows.length,11,'all heroes rendered');
  for(const row of rows) {
    assert.ok(row.maxFootDrift<=.05,`${row.name}: foot drift ${row.maxFootDrift}px`);
    assert.equal(row.maxRootXDrift,0,`${row.name}: root X stays fixed`);
    assert.equal(row.maxRootRotation,0,`${row.name}: root rotation stays zero`);
    if(row.name==='саня') {assert.equal(row.maxSkew,0,'seated Sanya never shifts');continue;}
    const minimum=['коржик','масяня'].includes(row.name) ? .3 : .6;
    assert.ok(row.maxChangedPercent>=minimum,`${row.name}: ${row.maxChangedPercent}% < ${minimum}%`);
  }
  console.log('OFFICE-17c live screenshot acceptance passed');
} finally {await browser.close();}
