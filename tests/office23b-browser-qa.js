async page=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1000});
 const load=async id=>{
  await page.goto('http://127.0.0.1:3137/?scene='+id+'&time=day');await page.waitForFunction(()=>window.officeQA?.director.ready);
  await page.evaluate(()=>{const q=officeQA;q.app.stop();q.render=q.app.render.bind(q.app);q.app.ticker.remove(q.app.render,q.app);q.app.render=()=>{};q.fakeTime=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>q.fakeTime});});
 };
 const step=async()=>page.evaluate(async()=>{const q=officeQA;for(let k=0;k<10;k++){q.fakeTime+=50.1;q.app.ticker.update(q.fakeTime);}await new Promise(r=>setTimeout(r,0));});
 const state=()=>page.evaluate(()=>{
  const q=officeQA,app=q.app,find=l=>app.stage.getChildByLabel(l,true);
  const people=app.stage.getChildByLabel('agents-layer').children.filter(n=>n.label?.startsWith('agent-node-')).map(n=>{
   const name=q.agents.find(a=>n.label==='agent-node-'+a.id)?.name,pose=n.children.find(c=>c.visible&&c.label?.startsWith('hero-')),s=pose?.getChildByLabel('atlas-frame'),h=Object.values(q.manifest.heroes).find(h=>h.name===name);
   return {name,x:n.x,y:n.y,frame:Object.entries(h?.frames||{}).find(([k,f])=>s&&f.x===s.texture.frame.x&&f.y===s.texture.frame.y)?.[0]};
  });
  return {active:q.director.active,error:q.director.error,dark:find('office23-blackout')?.visible,box:find('office23-pizza')?.visible,slices:app.stage.getChildByLabel('agents-layer').children.filter(n=>n.visible&&n.label?.startsWith('office23b-slice-')).map(n=>n.label),bubbles:find('office23-effects').children.filter(n=>n.visible&&n.label?.startsWith('office23-bubble')).map(n=>n.children.find(c=>typeof c.text==='string')?.text),people};
 });
 const results=[];
 for(const id of ['breaker','short','standup','pizza']){
  await load(id);const frames=new Set(),recipients=new Set();let shot=false,blackout=false,shoo=false,last=false,finished=false,seconds=0,maxSlices=0,final;
  for(let n=0;n<480;n++){
   await step();seconds+=.5;const s=await state();final=s;if(s.error)throw Error(s.error);
   s.people.forEach(p=>{if(p.frame)frames.add(p.frame);});s.slices.forEach(p=>recipients.add(p.replace('office23b-slice-','')));maxSlices=Math.max(maxSlices,s.slices.length);
   blackout ||= s.dark;shoo ||= s.bubbles.includes('Брысь!');last ||= s.bubbles.includes('Не пропадать же');
   const owner=s.people.find(p=>p.name==='Евгений');
   const key=id==='pizza'?owner?.frame==='owner_eat':id==='standup'?owner?.frame==='owner_point_back':owner?.frame==='owner_breaker';
   if(key&&!shot){await page.evaluate(()=>officeQA.render());await page.screenshot({path:`output/playwright/office23b-${id}-1440.png`});shot=true;}
   if(!s.active){finished=true;break;}
  }
  if(!finished||!shot||final.dark||final.box||final.slices.length)throw Error('Bad scene '+id+JSON.stringify(final));
  if(id==='pizza'&&(!shoo||!last||recipients.size<8))throw Error('Pizza missing participants/jokes '+JSON.stringify({shoo,last,recipients:[...recipients]}));
  results.push({id,seconds,finished,shot,blackout,shoo,last,maxSlices,recipients:[...recipients],frames:[...frames],final});
 }
 await page.goto('http://127.0.0.1:3137/');await page.waitForFunction(()=>window.officeQA?.director.ready);
 await page.getByRole('button',{name:'Проверить УЗО — рубильник',exact:true}).click();await page.waitForFunction(()=>officeQA.director.active==='breaker');
 // A manual demo preserves exhausted providers: no ensureCast resurrection.
 await page.goto('http://127.0.0.1:3137/?holiday=all&scene=pizza&time=day');await page.waitForFunction(()=>officeQA.director.ready);
 await page.evaluate(()=>{const q=officeQA;q.app.stop();q.render=q.app.render.bind(q.app);q.app.ticker.remove(q.app.render,q.app);q.app.render=()=>{};q.fakeTime=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>q.fakeTime});});
 const holidayRecipients=new Set();let holidayFinished=false;
 for(let n=0;n<240;n++){await step();const s=await state();if(s.error)throw Error(s.error);s.slices.forEach(p=>holidayRecipients.add(p.replace('office23b-slice-','')));if(!s.active){holidayFinished=true;break;}}
 const holidayStillActive=await page.evaluate(()=>officeQA.holiday.all);
 if(!holidayFinished||!holidayStillActive||[...holidayRecipients].some(n=>!['Евгений','Марина'].includes(n)))throw Error('Holiday cast was restored');
 if(errors.length)throw Error(errors.join('\n'));
 return {results,errors,paintedShieldTap:true,holidayStillActive,holidayRecipients:[...holidayRecipients]};
}
