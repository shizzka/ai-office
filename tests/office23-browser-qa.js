async page => {
 await page.setViewportSize({width:960,height:650});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const load=async(query='')=>{
  await page.goto('http://127.0.0.1:3135/'+query);
  await page.waitForFunction(()=>window.officeQA?.director.ready);
  await page.evaluate(()=>{
   const q=officeQA;q.app.stop();q.render=q.app.render.bind(q.app);q.app.ticker.remove(q.app.render,q.app);q.app.render=()=>{};
   q.fakeTime=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>q.fakeTime});
  });
 };
 const step=async seconds=>page.evaluate(async seconds=>{
  const q=officeQA;for(let i=0;i<Math.ceil(seconds*20);i++){q.fakeTime+=50.1;q.app.ticker.update(q.fakeTime);if(i%30===0)await new Promise(r=>setTimeout(r,0));}await new Promise(r=>setTimeout(r,0));
 },seconds);
 const scene=()=>page.evaluate(()=>{
  const q=officeQA,a=q.app,layer=a.stage.getChildByLabel('agents-layer');
  const find=l=>a.stage.getChildByLabel(l,true);
  const actors=layer.children.filter(n=>n.label?.startsWith('agent-node-')).map(n=>{
   const pose=n.children.find(c=>c.visible&&c.label?.startsWith('hero-')),s=pose?.getChildByLabel('atlas-frame');
   const name=q.agents.find(a=>n.label==='agent-node-'+a.id)?.name,h=Object.values(q.manifest.heroes).find(h=>h.name===name);
   return {name,x:n.x,y:n.y,frame:Object.entries(h?.frames||{}).find(([k,f])=>s&&f.x===s.texture.frame.x&&f.y===s.texture.frame.y)?.[0]};
  });
  const monitors=find('desk-screen-content')?.children.map(n=>({label:n.label,texture:n.texture?.label,visible:n.visible}))||[];
  return {director:q.director,dark:find('office23-blackout')?.visible,pizza:find('office23-pizza')?.visible,
   bubbles:find('office23-effects')?.children.filter(n=>n.visible&&n.label?.startsWith('office23-bubble')).map(n=>({name:n.label,text:n.children?.find(c=>typeof c.text==='string')?.text})),actors,monitors};
 });
 const shot=async id=>{await page.evaluate(()=>officeQA.render());await page.screenshot({path:'output/office23-'+id+'.png'});};
 const results=[];
 await load();await step(.1);const homes=(await scene()).actors;
 for(const id of ['breaker','standup','pizza','rounds','short','review']){
  await load('?scene='+id+'&time=day');
  const initial=await scene();const evidence={frames:[],dark:false,lightRestored:false,pizza:false,review:false,moved:false};
  const seen=new Set();let finished=false,seconds=0,screenshot=false,maxDisplacement=0,final;
  for(let n=0;n<440;n++){
   await step(.5);seconds+=.5;const s=await scene();final=s;
   check(!s.director.error,id+': '+s.director.error);
   s.actors.forEach(a=>{if(a.frame?.startsWith('owner_')||a.frame?.startsWith('chair_'))seen.add(a.frame);const b=initial.actors.find(b=>b.name===a.name);if(b)maxDisplacement=Math.max(maxDisplacement,Math.hypot(a.x-b.x,a.y-b.y));});
   evidence.powerOff ||= !!s.dark&&s.monitors.filter(m=>m.visible).every(m=>m.texture?.startsWith('off:'));evidence.dark ||= !!s.dark;evidence.lightRestored ||= evidence.dark&&!s.dark;evidence.pizza ||= !!s.pizza;
   evidence.review ||= (s.bubbles||[]).some(b=>/сечение|Поправим|Так-то/.test(b.text));
   const key=id==='breaker'?s.dark:id==='standup'?seen.has('owner_point_back'):id==='pizza'?seen.has('owner_eat')&&s.pizza:id==='rounds'?seen.has('owner_peek')||seen.has('owner_skeptic'):id==='short'?s.dark:evidence.review;
   if(key&&!screenshot){await shot(id);screenshot=true;}
   if(!s.director.active){finished=true;break;}
  }
  evidence.frames=[...seen];evidence.moved=maxDisplacement>10;
  const displaced=final.actors.filter(a=>{const b=homes.find(b=>b.name===a.name);return b&&Math.hypot(a.x-b.x,a.y-b.y)>4;});
  const result={id,finished,seconds,evidence,screenshot,maxDisplacement,displaced,finalDark:final.dark,finalPizza:final.pizza};results.push(result);
  await page.evaluate(results=>{officeQA.browserResults=results;sessionStorage.setItem('office23-browser-results',JSON.stringify(results));},results);
  check(finished,id+' did not finish: '+JSON.stringify(result));check(evidence.moved,id+' did not move');check(screenshot,id+' missing key pose');
  check(!final.dark&&!final.pizza,id+' effects not restored');check(!displaced.length,id+' actors did not return: '+JSON.stringify(displaced));
 }
 // Actual hit targets: narrow mobile viewport and a Pixi owner body double tap.
 await page.setViewportSize({width:390,height:844});await load();
 await page.getByRole('button',{name:'Проверить УЗО — рубильник',exact:true}).click();await step(.1);
 check((await scene()).director.active==='breaker','mobile breaker click');await shot('mobile-breaker');
 await page.evaluate(()=>officeQA.ref.current.stopEvents());await step(.1);
 await page.setViewportSize({width:960,height:600});await load();await step(1);
 const owner=await page.evaluate(()=>{const q=officeQA,id=q.agents.find(a=>a.name==='Евгений').id,n=q.app.stage.getChildByLabel('agent-node-'+id,true),p=n.toGlobal({x:0,y:-25});const r=q.app.canvas.getBoundingClientRect();return{x:r.x+p.x/q.app.screen.width*r.width,y:r.y+p.y/q.app.screen.height*r.height};});
 await page.evaluate(()=>officeQA.render());
 await page.mouse.dblclick(owner.x,owner.y,{delay:100});await step(.1);
 check((await scene()).director.active==='standup','owner body double tap '+JSON.stringify(owner));
 await page.evaluate(()=>officeQA.ref.current.stopEvents());await step(.1);
 await page.evaluate(()=>{officeQA.ref.current.launchEvent('pot');officeQA.ref.current.launchEvent('breaker');});await step(.1);
 let s=await scene();check(s.director.active==='pot'&&s.director.queued===1,'pot interlock queue');
 const order=['pot'];for(let n=0;n<200;n++){await step(.5);s=await scene();const id=s.director.active;if(id&&id!==order.at(-1))order.push(id);if(!id)break;}
 check(JSON.stringify(order)===JSON.stringify(['pot','breaker']),'FIFO '+JSON.stringify(order));check(!s.director.active&&!s.director.queued&&!s.dark,'queue cleanup');
 check(!errors.length,errors.join('\n'));
 return {results,mobileBreaker:true,ownerDoubleTap:true,potInterlock:order,errors,limitations:['Synthetic roster, isolated preview; no production API/DB writes.','Screenshots show software-rendered production Pixi scene; video uses controlled simulation time.']};
}
