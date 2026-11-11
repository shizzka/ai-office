// Deterministic video from the production Pixi renderer; 300 frames at 20 fps.
// Start tests/preview-office17.mjs first. No API or DB writes.
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const capture = async page => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://127.0.0.1:3127?time=day');
  await page.waitForFunction(()=>window.officeQA?.app?.ticker.started&&window.officeQA.app.stage.getChildByLabel('agents-layer').children.length===11);
  // Working status keeps the reviewed idle poses at their desks. This roster
  // exists only in the read-only preview; no API or database is changed.
  await page.evaluate(()=>window.officeQA.setRoster(list=>list.map(a=>({...a,currentStatus:'working'}))));
  await page.waitForTimeout(500);
  const download=page.waitForEvent('download',{timeout:600000});
  const result=await page.evaluate(async()=>{
    const q=window.officeQA,app=q.app,nodes=app.stage.getChildByLabel('agents-layer').children;
    app.stop();
    const names=['ярик','тая','whoami','коржик','масяня'];
    const labels=['Ярик','Тая','whoami','Коржик · лежанка','Масяня · лежанка'];
    const selected=names.map(name=>nodes.find(n=>n.children.some(p=>p.label.startsWith('hero-'+name+'-'))));
    // Render the five production poses against a plain backdrop so their
    // outlines are clear. Keep scene coordinates and fixed cameras, while
    // avoiding repeated room draw calls on software WebGL.
    const poses=selected.map(n=>n.children.find(p=>p.visible&&p.label.startsWith('hero-')));
    const layer=app.stage.getChildByLabel('agents-layer');
    app.stage.children.forEach(c=>c.visible=c===layer);
    nodes.forEach(n=>{n.visible=selected.includes(n);if(n.visible)n.children.forEach(p=>p.visible=poses.includes(p));});
    const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
    const ctx=canvas.getContext('2d');
    const ratio=app.canvas.width/app.screen.width;
    const origin=selected[0].toGlobal({x:0,y:0}),unit=selected[0].toGlobal({x:1,y:0});
    const zoom=(unit.x-origin.x)/selected[0].scale.x;
    const panels=selected.map((n,i)=>{
      const p=n.toGlobal({x:0,y:0});
      // Fixed cameras: never track a bob or compensate animated feet.
      const cat=i>=3,seated=false;
      const sceneWidth=cat?150:120,sceneHeight=cat?55:154;
      return {x:cat?(i-3)*960:i*640,y:cat?734:44,w:cat?960:640,h:cat?300:670,
        sx:(p.x-sceneWidth*zoom/2)*ratio,sy:(p.y-(seated?118:cat?43:143)*zoom)*ratio,
        sw:sceneWidth*zoom*ratio,sh:sceneHeight*zoom*ratio};
    });
    const draw=()=>{
      ctx.fillStyle='#202722';ctx.fillRect(0,0,1920,1080);
      ctx.font='24px sans-serif';ctx.fillStyle='#f2efdf';
      ctx.fillText('OFFICE-17c · дыхание от стоп · 20 fps',20,30);
      panels.forEach((p,i)=>{
        ctx.drawImage(app.canvas,p.sx,p.sy,p.sw,p.sh,p.x+4,p.y,p.w-8,p.h);
        ctx.fillStyle='#202722';ctx.fillRect(p.x+4,p.y,p.w-8,34);
        ctx.fillStyle='#fff4da';ctx.font='24px sans-serif';ctx.fillText(labels[i],p.x+18,p.y+25);
        if(i<3) {
          const lineY=p.y+143/154*p.h;
          ctx.strokeStyle='#b9ffe0';ctx.lineWidth=1;ctx.setLineDash([6,5]);
          ctx.beginPath();ctx.moveTo(p.x+p.w*.25,lineY);ctx.lineTo(p.x+p.w*.75,lineY);ctx.stroke();ctx.setLineDash([]);
        }
      });
      ctx.font='21px sans-serif';ctx.fillStyle='#f2efdf';
      ctx.fillText('Опора неподвижна · у котов неизменны кадр тела и отражение',24,1065);
    };
    const chunks=[],encoder=new TextEncoder(),samples=[];
    const tarHeader=(name,size)=>{
      const h=new Uint8Array(512);
      const put=(at,text)=>h.set(encoder.encode(text),at);
      const oct=(value,length)=>value.toString(8).padStart(length-1,'0')+'\0';
      put(0,name);put(100,oct(420,8));put(108,oct(0,8));put(116,oct(0,8));
      put(124,oct(size,12));put(136,oct(0,12));put(148,'        ');put(156,'0');
      put(257,'ustar\0');put(263,'00');
      put(148,h.reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ');
      return h;
    };
    const started=performance.now();
    for(let frame=0;frame<300;frame++) {
      if(frame%60===0)console.log('OFFICE-17c frame '+frame+'/300');
      const now=20+frame/20;
      for(let i=0;i<selected.length;i++) {
        const n=selected[i],p=n.children.find(p=>p.visible&&p.label.startsWith('hero-'));
        if(i>=3)q.setCatAtlasPose(p,'cup');
        q.animateAtlasPose(p,now,false,false,{seated:false,seatOffset:{x:0,y:55/n.scale.y},seatScale:110/72/n.scale.y});
      }
      app.render();draw();
      if(frame%4===0)samples.push({elapsed:frame/20,heroes:selected.map(n=>{
        const p=n.children.find(p=>p.visible&&p.label.startsWith('hero-')),s=p.getChildByLabel('atlas-frame'),foot=s.toGlobal(s.pivot);
        return {name:p.label,foot:[foot.x,foot.y],scaleY:s.scale.y,scaleX:s.scale.x,skew:s.skew.x,rotation:p.rotation,frame:[s.texture.frame.x,s.texture.frame.y]};
      })});
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.96));
      const bytes=new Uint8Array(await blob.arrayBuffer());
      chunks.push(tarHeader(String(frame).padStart(4,'0')+'.jpg',bytes.length),bytes,new Uint8Array((512-bytes.length%512)%512));
    }
    chunks.push(new Uint8Array(1024));
    const blob=new Blob(chunks,{type:'application/x-tar'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='office17c-frames.tar';a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    return {seconds:15,frames:300,fps:20,clock:'controlled Pixi poses: t=20..34.95, dt=.05',renderSeconds:(performance.now()-started)/1000,bytes:blob.size,panels,samples};
  });
  await (await download).saveAs('output/playwright/office17c-frames.tar');
  await page.screenshot({path:'output/playwright/office17c-office.png'});
  return result;
};
try {
  const page=await browser.newPage();
  page.on('console',m=>{if(m.text().startsWith('OFFICE-17c frame'))console.log(m.text());});
  const result=await capture(page);
  await writeFile('output/office17c-video.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({frames:result.frames,fps:result.fps,seconds:result.seconds,renderSeconds:result.renderSeconds}));
} finally {await browser.close();}
