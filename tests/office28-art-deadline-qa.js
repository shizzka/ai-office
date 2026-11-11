async page=>{
 const origin='http://127.0.0.1:3148',base=Date.parse('2026-11-02T09:00:00Z');
 await page.request.post(origin+'/qa/state',{data:{serverNow:base,scene:null,attendance:{hour:12,ownerNight:'awake',actors:[]}}});
 await page.goto(origin+'/office/stream');await page.waitForFunction(()=>officeQA?.director.ready&&officeQA.nodes?.size>5,null,{timeout:90000});
 await page.evaluate(()=>{const q=officeQA;q.app.stop();q.app.ticker.maxFPS=0;q.app.ticker.remove(q.app.render,q.app);window.qaTime=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>qaTime});Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});q.tick=seconds=>{for(let k=0;k<Math.ceil(seconds*20);k++){qaTime+=50;q.app.ticker.update(qaTime);}};q.setRoster(q.agents.map(a=>({...a,currentStatus:'offline'})));for(const n of q.nodes.values())if(!n.cat){n.eggClock=330;n.rareGesture.until=243;n.rareGesture.next=480;}});
 await page.waitForTimeout(100);
 const attendance={hour:12,ownerNight:'awake',actors:await page.evaluate(()=>officeQA.agents.map(a=>({name:a.name,status:'offline',idleSince:0,departureAt:null,home:false})))};
 await page.request.post(origin+'/qa/state',{data:{serverNow:base,attendance,scene:{id:'seeded-completed-deadline',eventId:'cat-wash',seed:42,startedAt:base,endsAt:base+22000,attendance}}});await page.waitForTimeout(100);
 const result=await page.evaluate(()=>{const q=officeQA;q.tick(1);q.app.render();return [...q.nodes.values()].filter(n=>!n.cat).map(n=>{const p=[n.sprite,...n.walkFrames,n.stretchSprite,n.coolerSprite].find(p=>p.visible),f=p.getChildByLabel('atlas-frame').texture.frame,h=Object.values(q.manifest.heroes).find(h=>h.name===n.appearanceName);return {name:n.appearanceName,clock:n.eggClock,until:n.rareGesture.until,frame:Object.entries(h.frames).find(([,v])=>v.x===f.x&&v.y===f.y)?.[0]};});});
 await page.screenshot({path:'output/playwright/office28/before-art-deadlines.png'});
 if(result.filter(n=>n.frame==='stretch').length<3)throw Error(JSON.stringify(result));
 return {method:'injected completed deadlines matching the natural atlas reproduction: now=330, until=243, next=480; actual shared scene resets/rendering',result};
}
