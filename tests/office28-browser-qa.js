async page => {
  const origin='http://127.0.0.1:3149', artifacts='output/playwright/office28/';
  const errors=[],events=[];page.on('pageerror',e=>errors.push(e.message));
  const state=async data=>{await page.request.post(origin+'/qa/state',{data});await page.waitForTimeout(70);};
  await state({scene:null,attendance:{hour:12,ownerNight:'awake',actors:[]}});
  await page.goto(origin+'/office/stream?stream=1');
  await page.waitForFunction(()=>window.officeQA?.director.ready&&officeQA.nodes?.size>5,null,{timeout:90000});
  const install=async()=>{
    await page.evaluate(()=>{
      const q=officeQA;q.app.stop();q.app.ticker.maxFPS=0;q.app.ticker.remove(q.app.render,q.app);
      window.qaTime=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>qaTime});
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      q.frames=0;q.violations=[];q.maxSpecial=0;q.minimum=99;q.exits=[];q.last=new Map();
      q.sample=()=>[...q.nodes.values()].map(n=>{
        const pose=[n.sprite,...n.walkFrames,n.stretchSprite,n.coolerSprite].find(p=>p.visible);
        const sprite=pose?.getChildByLabel('atlas-frame'),f=sprite?.texture.frame;
        const hero=Object.values(n.renderer==='art'?q.manifest.heroes:q.legacy.heroes).find(h=>h.name.toLowerCase().replaceAll('ё','е')===n.appearanceName.toLowerCase().replaceAll('ё','е'));
        const frame=hero&&f?Object.entries(hero.frames).find(([,v])=>v.x===f.x&&v.y===f.y)?.[0]:null;
        return {name:n.appearanceName,visible:n.container.visible&&n.container.alpha>.01&&!!pose?.visible&&pose.alpha>.01,frame,clock:n.eggClock,until:n.rareGesture.until,x:n.container.x,y:n.container.y,identity:n.agentId};
      });
      q.check=()=>{
        const sample=q.sample(),special=sample.filter(n=>n.visible&&/^(stretch|easter)/.test(n.frame||'')&&!['Коржик','Масяня'].includes(n.name));
        const visible=sample.filter(n=>n.visible).length;q.minimum=Math.min(q.minimum,visible);q.maxSpecial=Math.max(q.maxSpecial,special.length);
        if(special.length>=3&&q.violations.length<20)q.violations.push({frame:q.frames,type:'mass-gesture',sample:special});
        if(q.last.size>=3&&visible===0&&q.violations.length<20)q.violations.push({frame:q.frames,type:'all-hidden'});
        for(const n of sample){const old=q.last.get(n.name);if(old?.visible&&!n.visible){q.exits.push(n);if(Math.hypot(n.x-804,n.y-476)>2&&!['Евгений','Коржик','Масяня'].includes(n.name)&&q.violations.length<20)q.violations.push({type:'hidden-outside-door',sample:n});}}
        q.last=new Map(sample.map(n=>[n.name,n]));q.frames++;
      };
      q.tick=seconds=>{for(let k=0;k<Math.ceil(seconds*20);k++){qaTime+=50;q.app.ticker.update(qaTime);q.check();}};
      q.setRoster(q.agents.map(a=>({...a,currentStatus:'working'})));
    });
    await page.waitForTimeout(100);
  };
  await install();
  const names=await page.evaluate(()=>officeQA.agents.map(a=>a.name));
  let wall=Date.parse('2026-11-02T09:00:00Z');
  const attendance=(status='working',home=false,hour=12)=>({hour,ownerNight:'awake',actors:names.map(name=>({name,status,idleSince:wall-3600000,departureAt:home?wall-20000:null,home}))});
  await state({serverNow:wall,scene:null,attendance:attendance()});
  const tick=async seconds=>{for(let t=0;t<seconds;t+=10){const step=Math.min(10,seconds-t);await page.evaluate(s=>officeQA.tick(s),step);wall+=step*1000;}};
  const snapshot=async label=>{const result=await page.evaluate(()=>({frames:officeQA.frames,sample:officeQA.sample(),violations:officeQA.violations,maxSpecial:officeQA.maxSpecial,minimum:officeQA.minimum,exits:officeQA.exits}));events.push({label,wall,...result});return result;};
  await tick(330);await snapshot('330s-old-gestures-completed');
  // Same historical condition as the before screenshot, including unseated offline humans.
  await page.evaluate(()=>officeQA.setRoster(officeQA.agents.map(a=>({...a,currentStatus:'offline'}))));await page.waitForTimeout(80);
  await state({serverNow:wall,attendance:attendance('offline'),scene:{attendance:attendance('offline'),id:'reset-after-gestures',eventId:'cat-wash',seed:42,startedAt:wall,endsAt:wall+22000}});
  await tick(1);await snapshot('shared-reset');await page.evaluate(()=>officeQA.app.render());await page.screenshot({path:artifacts+'fixed-reset.png'});
  await tick(24);await state({serverNow:wall,scene:null,attendance:attendance()});
  await page.evaluate(()=>officeQA.setRoster(officeQA.agents.map(a=>({...a,currentStatus:'working'}))));await page.waitForTimeout(80);
  // Close a real WebSocket; allow the real five-second reconnect timer to run.
  await page.request.get(origin+'/qa/disconnect');await page.waitForTimeout(5500);await tick(1);await snapshot('reconnected');
  for(const cycle of [0,1]){
    const identities=await page.evaluate(()=>[...officeQA.nodes.values()].map(n=>n.container.uid));
    await page.evaluate(()=>officeQA.setQuota({codex:{windows:[],error:{blocked:true,resetsAt:Date.now()/1000+86400}},claude:{windows:[],error:{blocked:true,resetsAt:Date.now()/1000+86400}}}));await page.waitForTimeout(80);
    await tick(1);await snapshot('quota-on-'+cycle);await tick(35);await snapshot('quota-home-'+cycle);
    await page.evaluate(()=>officeQA.app.render());await page.screenshot({path:artifacts+'fixed-quota-home-'+cycle+'.png'});
    await page.evaluate(()=>officeQA.setQuota({codex:{windows:[],error:null},claude:{windows:[],error:null}}));await page.waitForTimeout(80);
    await tick(35);await snapshot('quota-return-'+cycle);
    const after=await page.evaluate(()=>[...officeQA.nodes.values()].map(n=>n.container.uid));if(JSON.stringify(identities)!==JSON.stringify(after))throw Error('Quota recreated actors');
  }
  await page.evaluate(()=>officeQA.setRoster(officeQA.agents.map(a=>({...a,currentStatus:'idle'}))));await page.waitForTimeout(80);
  await state({serverNow:wall,attendance:attendance('idle',false,19)});await tick(2);
  // Reconnect after an entire evening eligibility window: existing actors must walk out.
  const gone=attendance('idle',true,23.99);gone.actors=gone.actors.map(a=>['Евгений','Лёха','Мотя','JH','Коржик','Масяня'].includes(a.name)?{...a,home:false,departureAt:null}:a);
  await state({serverNow:wall,attendance:gone});await tick(35);await snapshot('evening-home');
  await state({serverNow:wall+86400000,attendance:{...gone,hour:.01}});wall+=86400000;await tick(3);await snapshot('midnight');
  await state({serverNow:wall,attendance:attendance('working')});await tick(35);await snapshot('urgent-return');
  while(events.at(-1).frames<30000){await tick(30);await state({serverNow:wall,scene:null,attendance:attendance()});await snapshot('soak');}
  const result=await snapshot('25-minutes');if(result.violations.length||errors.length)throw Error(JSON.stringify({errors,violations:result.violations,events}));
  await page.evaluate(()=>officeQA.app.render());await page.screenshot({path:artifacts+'fixed-25min.png'});
  // A bundle reload remounts the scene; sample the first visible tick again.
  await page.reload();await page.waitForFunction(()=>officeQA.director.ready&&officeQA.nodes?.size>5,null,{timeout:90000});await install();await tick(.1);const remount=await snapshot('bundle-reload');
  if(remount.violations.length)throw Error(JSON.stringify(remount));
  return {passed:true,errors,events};
}
