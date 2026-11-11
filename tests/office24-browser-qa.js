async page=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1000});
 const load=async query=>{
  await page.goto('http://127.0.0.1:3138/?'+query);await page.waitForFunction(()=>window.officeQA?.director.ready);
  await page.evaluate(()=>{const q=officeQA;q.app.stop();q.render=q.app.render.bind(q.app);q.app.ticker.remove(q.app.render,q.app);q.app.render=()=>{};q.fakeTime=performance.now();q.wall=Date.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>q.fakeTime});Date.now=()=>q.wall;});
 };
 const step=async(seconds)=>page.evaluate(seconds=>{const q=officeQA;for(let k=0;k<Math.ceil(seconds/.05);k++){q.fakeTime+=50.1;q.wall+=50.1;q.app.ticker.update(q.fakeTime);}q.render();},seconds);
 const state=()=>page.evaluate(()=>{
  const q=officeQA,app=q.app,find=l=>app.stage.getChildByLabel(l,true);
  const people=app.stage.getChildByLabel('agents-layer').children.filter(n=>n.label?.startsWith('agent-node-')).map(n=>{
   const name=q.agents.find(a=>n.label==='agent-node-'+a.id)?.name,pose=n.children.find(c=>c.visible&&c.label?.startsWith('hero-')),s=pose?.getChildByLabel('atlas-frame'),h=Object.values(q.manifest.heroes).find(h=>h.name===name);
   return {name,x:n.x,y:n.y,visible:n.visible,zIndex:n.zIndex,frame:Object.entries(h?.frames||{}).find(([k,f])=>s&&f.x===s.texture.frame.x&&f.y===s.texture.frame.y)?.[0]};
  });
  const bed=find('office24-mattress');return {people,presence:q.presence,bed:bed?.visible?{x:bed.x,y:bed.y,width:bed.width,height:bed.height}:null,carry:find('office24-mattress-carry')?.visible,bubbles:find('office24-effects').children.filter(n=>n.visible).map(n=>n.children.find(c=>typeof c.text==='string')?.text),events:q.catEvents,active:q.director.active,error:q.director.error};
 });
 const ensure=(ok,message,s)=>{if(!ok)throw Error(message+' '+JSON.stringify(s));};
 const results={};
 await load('time=evening');await step(45);let s=await state();
 ensure(s.people.filter(p=>!['Евгений','Лёха','whoami','Коржик','Масяня'].includes(p.name)).every(p=>!p.visible),'evening absent',s);
 ensure(s.presence['ася']==='home'&&s.presence['марина']==='home','home panel',s);
 ensure(s.people.filter(p=>['Евгений','Лёха','Коржик','Масяня'].includes(p.name)).every(p=>p.visible),'residents remain',s);
 results.evening=s;await page.screenshot({path:'output/playwright/office24-evening-1440.png'});
 await page.evaluate(()=>officeQA.setRoster(list=>list.map(a=>a.name==='Ася'?{...a,currentStatus:'working'}:a)));await page.waitForTimeout(30);await step(.15);s=await state();
 ensure(s.presence['ася']==='rushing'&&s.bubbles.some(x=>x.includes('💨')),'live work did not rush',s);await step(14);s=await state();
 ensure(s.people.find(p=>p.name==='Ася').visible&&s.people.find(p=>p.name==='Ася').frame.startsWith('seated_back'),'rushed worker not seated',s);results.liveRush=s;
 await load('time=night');await step(3);s=await state();ensure(s.people.find(p=>p.name==='Евгений').frame==='owner_sleep_forward','chair sleep',s);
 await page.screenshot({path:'output/office24-night-1440.png'});results.night=s;
 await page.evaluate(()=>officeQA.setRoster(list=>list.map(a=>a.name==='Ася'?{...a,currentStatus:'working'}:a)));await page.waitForTimeout(30);await step(.15);s=await state();ensure(s.people.find(p=>p.name==='Евгений').frame==='owner_wake','wake on urgent work',s);results.wake=s;
 await load('scene=mattress');await step(25);s=await state();ensure(s.bed&&!s.people.find(p=>p.name==='Евгений').visible,'floor sleep',s);
 ensure(s.people.filter(p=>['Коржик','Масяня'].includes(p.name)).every(p=>p.y>395&&p.y<435),'cats at mattress',s);ensure(s.people.filter(p=>['Коржик','Масяня'].includes(p.name)).every(p=>p.zIndex>s.bed.y+s.bed.height),'cats render over mattress',s);results.mattress=s;await page.screenshot({path:'output/playwright/office24-mattress-1440.png'});
 await page.evaluate(()=>officeQA.setRoster(list=>list.map(a=>a.name==='Марина'?{...a,currentStatus:'working'}:a)));await page.waitForTimeout(30);await step(.1);s=await state();ensure(s.bubbles.includes('❗'),'floor alert',s);results.stranger=s;
 await step(.9);s=await state();ensure(!s.bed,'mat rolled in 1 s',s);await step(3.8);s=await state();const e=s.people.find(p=>p.name==='Евгений');ensure(Math.hypot(e.x-815,e.y-257)<1&&e.visible,'owner desk <=5 s',s);results.desk=s;
 await step(8);s=await state();ensure(s.people.filter(p=>['Коржик','Масяня'].includes(p.name)).every(p=>p.y<280),'cats back in beds',s);
 await load('holiday=codex&scene=mattress');await step(25);s=await state();ensure(s.bed&&!s.people.some(p=>p.name==='Лёха'),'quota mattress',s);results.quota=s;
 await page.evaluate(()=>officeQA.setRoster(list=>list.map(a=>a.name==='Ася'?{...a,currentStatus:'working'}:a)));await page.waitForTimeout(30);
 await step(11);await page.evaluate(()=>officeQA.ref.current.launchEvent('holiday-off'));await page.waitForTimeout(50);await step(.15);s=await state();ensure(s.presence['ася']==='rushing','quota return at door',s);ensure(s.people.find(p=>p.name==='Лёха')?.visible,'Leha returns when limit clears',s);results.quotaReturn=s;
 ensure(!errors.length,'browser errors',errors);return {results,errors};
}
