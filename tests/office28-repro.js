async page => {
  const origin='http://127.0.0.1:3148';
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/office');
  await page.waitForFunction(()=>window.officeQA?.director.ready&&officeQA.nodes?.size>5);
  await page.evaluate(()=>officeQA.setRenderer('atlas'));
  await page.waitForTimeout(1200);
  await page.evaluate(()=>{
    const q=officeQA;q.app.stop();q.app.ticker.maxFPS=0;
    window.qaTime=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>qaTime});
    q.app.ticker.remove(q.app.render,q.app);
    q.tick=seconds=>{for(let k=0;k<Math.ceil(seconds*20);k++){qaTime+=50;q.app.ticker.update(qaTime);}};
    q.setRoster(q.agents.map(a=>({...a,currentStatus:'working'})));
    q.sample=()=>[...q.nodes.values()].filter(n=>!n.cat).map(n=>{
      const pose=[n.sprite,...n.walkFrames,n.stretchSprite,n.coolerSprite].find(p=>p.visible);
      const sprite=pose?.getChildByLabel('atlas-frame');const f=sprite?.texture.frame;
      return {name:n.appearanceName,visible:n.container.visible&&n.container.alpha>.01,renderer:n.renderer,clock:n.eggClock,until:n.rareGesture.until,frame:f?{x:f.x,y:f.y,w:f.width,h:f.height}:null,pose:pose?.label};
    });
  });
  await page.waitForTimeout(100);
  await page.request.post(origin+'/qa/state',{data:{attendance:{hour:12,ownerNight:'awake',actors:await page.evaluate(()=>officeQA.agents.map(a=>({name:a.name,status:'working',idleSince:0,departureAt:null,home:false})))}}});
  await page.waitForTimeout(100);
  const before=await page.evaluate(()=>{officeQA.tick(330);return officeQA.sample();});
  const base=(await (await page.request.get(origin+'/qa/state')).json()).state.serverNow;
  await page.request.post(origin+'/qa/state',{data:{serverNow:base,scene:{id:'repro-reset',eventId:'cat-wash',seed:42,startedAt:base,endsAt:base+22000}}});
  await page.waitForTimeout(100);
  const after=await page.evaluate(()=>{officeQA.tick(1);officeQA.app.render();return officeQA.sample();});
  await page.screenshot({path:'output/playwright/office28/before-reset-easter.png'});
  await page.evaluate(()=>officeQA.setQuota({codex:{windows:[],error:{blocked:true,resetsAt:Date.now()/1000+3600}},claude:{windows:[],error:{blocked:true,resetsAt:Date.now()/1000+3600}}}));
  await page.waitForTimeout(100);
  const holiday=await page.evaluate(()=>{officeQA.tick(.1);officeQA.app.render();return officeQA.sample();});
  await page.screenshot({path:'output/playwright/office28/before-quota-disappear.png'});
  return {before,after,holiday,errors};
}
