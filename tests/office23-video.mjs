// Deterministic production-renderer captures, synthetic isolated roster only.
// Start tests/preview-office23.mjs with OFFICE_QA_PORT=3135 first.
// Run: node tests/office23-video.mjs [breaker standup pizza rounds short review]
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const ids=process.argv.slice(2);if(!ids.length)ids.push('breaker','standup','pizza','rounds');
await mkdir('output/playwright',{recursive:true});
async function capture(page,id) {
  page.on('console',m=>{if(m.text().startsWith('OFFICE23 video'))console.log(m.text());});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:3135/?scene=${id}&stream=1&time=day`);
  await page.waitForFunction(()=>window.officeQA?.director.ready);
  const download=page.waitForEvent('download',{timeout:900000});
  const result=await page.evaluate(async id=>{
   const q=officeQA,app=q.app;app.stop();const render=app.render.bind(app);app.ticker.remove(app.render,app);app.render=()=>{};
   app.renderer.resolution=1;app.renderer.resize(960,600);
   q.fakeTime=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>q.fakeTime});
   const canvas=document.createElement('canvas');canvas.width=960;canvas.height=600;const ctx=canvas.getContext('2d');
   const chunks=[],encoder=new TextEncoder(),samples=[];
   const header=(name,size)=>{const h=new Uint8Array(512),put=(n,t)=>h.set(encoder.encode(t),n),oct=(v,n)=>v.toString(8).padStart(n-1,'0')+'\0';put(0,name);put(100,oct(420,8));put(108,oct(0,8));put(116,oct(0,8));put(124,oct(size,12));put(136,oct(0,12));put(148,'        ');put(156,'0');put(257,'ustar\0');put(263,'00');put(148,h.reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ');return h;};
   const seenFrames=new Set();
   let tail=0,frame=0;const started=Date.now();
   for(;frame<1000;frame++){
    for(let k=0;k<4;k++){q.fakeTime+=50.1;app.ticker.update(q.fakeTime);}
    await new Promise(r=>setTimeout(r,0));render();ctx.drawImage(app.canvas,0,0,960,600);
    ctx.fillStyle='#16231edd';ctx.fillRect(8,8,260,26);ctx.fillStyle='#f3ecd8';ctx.font='13px sans-serif';ctx.fillText('OFFICE-23 · '+id+' · 2× · 10 fps',16,26);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.88)),bytes=new Uint8Array(await blob.arrayBuffer());
    chunks.push(header(String(frame).padStart(4,'0')+'.jpg',bytes.length),bytes,new Uint8Array((512-bytes.length%512)%512));
    for(const n of app.stage.getChildByLabel('agents-layer').children.filter(n=>n.label?.startsWith('agent-node-'))){const pose=n.children.find(c=>c.visible&&c.label?.startsWith('hero-')),s=pose?.getChildByLabel('atlas-frame'),name=q.agents.find(a=>n.label==='agent-node-'+a.id)?.name,h=Object.values(q.manifest.heroes).find(h=>h.name===name);const key=Object.entries(h?.frames||{}).find(([k,f])=>s&&f.x===s.texture.frame.x&&f.y===s.texture.frame.y)?.[0];if(key)seenFrames.add(name+':'+key);}
    if(frame%25===0){console.log('OFFICE23 video '+id+' '+frame);samples.push({frame,active:q.director.active,dark:app.stage.getChildByLabel('office23-blackout',true)?.visible});}
    if(!q.director.active){tail++;if(tail>=5){frame++;break;}}
   }
   chunks.push(new Uint8Array(1024));const blob=new Blob(chunks,{type:'application/x-tar'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='office23-'+id+'-frames.tar';a.click();
   return {id,frames:frame,fps:10,simulationStep:.2004,speed:2,finished:!q.director.active,renderSeconds:(Date.now()-started)/1000,bytes:blob.size,samples,framesSeen:[...seenFrames]};
  },id);
  await (await download).saveAs(`output/playwright/office23-${id}-frames.tar`);
  result.errors=errors;return result;
}
for(const id of ids){
 const code=`async page => { const capture=${capture.toString()}; return await capture(page,${JSON.stringify(id)}); }`;
 const output=execFileSync('bash',['/mnt/work/.codex/skills/playwright/scripts/playwright_cli.sh','--session','office23','run-code',code],{encoding:'utf8',maxBuffer:20*1024*1024,timeout:900000});
 await writeFile(`output/office23-video-${id}.log`,output);
 const match=output.match(/### Result\n([\s\S]*?)\n###/);if(!match)throw Error(output);
 const result=JSON.parse(match[1]);
 const tar=`output/playwright/office23-${id}-frames.tar`;
 const dir=`output/playwright/office23-${id}-frames`;await mkdir(dir,{recursive:true});
 execFileSync('tar',['-xf',tar,'-C',dir]);
 execFileSync(process.env.FFMPEG_BIN||'ffmpeg',['-y','-v','error','-framerate','10','-i',dir+'/%04d.jpg','-c:v','libvpx-vp9','-cpu-used','4','-row-mt','1','-crf','34','-b:v','0','-pix_fmt','yuv420p',`output/office23-${id}.webm`],{stdio:'inherit'});
 await writeFile(`output/office23-video-${id}.json`,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));if(!result.finished||result.errors.length)throw Error(id+' did not complete cleanly');
}
