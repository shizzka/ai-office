async page=>{
  const origin='http://127.0.0.1:3139',browser=page.context().browser(),errors=[],writes=[],contexts=[];
  const baseline=Date.parse('2026-11-02T09:00:00Z');
  const setState=async body=>{const response=await page.request.post(origin+'/qa/state',{data:body});if(!response.ok())throw Error('Fixture control failed');return response.json();};
  const load=async query=>{
    const context=await browser.newContext({viewport:{width:1200,height:800}});contexts.push(context);
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    p.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push({method:r.method(),url:r.url()});});
    await p.goto(origin+'/'+(query||''));
    await p.waitForFunction(()=>window.officeQA?.director.ready,{timeout:30000});
    await p.evaluate(()=>{window.qaTime=performance.now();Object.defineProperty(performance,'now',{configurable:true,value:()=>window.qaTime});const q=officeQA;q.app.stop();q.app.ticker.maxFPS=0;q.render=q.app.render.bind(q.app);q.app.ticker.remove(q.app.render,q.app);q.app.render=()=>{};});
    return p;
  };
  const tick=async(p,seconds,fps)=>p.evaluate(({seconds,fps})=>{const q=officeQA,start=qaTime,frames=Math.ceil(seconds*fps);for(let i=1;i<=frames;i++){qaTime=start+Math.min(seconds,i/fps)*1000;q.app.ticker.update(qaTime);}}, {seconds,fps});
  const sample=p=>p.evaluate(()=>{const q=officeQA,find=label=>q.app.stage.getChildByLabel(label,true),dot=find('cat-laser-dot');const agents=find('agents-layer');return {laser:dot?{visible:dot.visible,x:dot.x,y:dot.y}:null,cats:q.agents.filter(a=>['Коржик','Масяня'].includes(a.name)).map(a=>{const n=agents.getChildByLabel('agent-node-'+a.id);return {name:a.name,x:n.x,y:n.y};}),local:q.director.active,scoreboard:!!find('office25-scoreboard'),trophy:!!find('office25-bug-hunter-trophy')};});
  const equal=(a,b,label)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(label+': '+JSON.stringify({a,b}));};
  const spatial=s=>({laser:s.laser,cats:s.cats});
  const result={};
  await page.goto('about:blank');
  try{
    await setState({serverNow:baseline,scene:null});
    const fast=await load('?stream=1'),slow=await load('?stream=1');
    const fixture=await (await page.request.get(origin+'/qa/state')).json();
    const scene={id:'qa-shared-laser-1',eventId:'cat-laser',seed:12345,startedAt:baseline,endsAt:baseline+30000,actors:fixture.state.attendance.actors.map(a=>({name:a.name,status:a.status})),red:false};
    await setState({serverNow:baseline,scene});
    await fast.waitForTimeout(100);
    await tick(fast,3.025,60);await tick(slow,3.025,10);
    const a=await sample(fast),b=await sample(slow);equal(spatial(a),spatial(b),'Different FPS diverged');
    if(!a.laser?.visible)throw Error('Shared laser did not start');
    result.differentFPS={fast:60,slow:10,seconds:3.025,state:a};await setState({qaResult:result});
    await setState({serverNow:baseline+3000,scene});
    const late=await load('?stream=1');
    await setState({serverNow:baseline+5000,scene});await fast.waitForTimeout(100);
    await tick(fast,.001,60);await tick(slow,.001,10);await tick(late,.001,60);
    const c=await sample(late),atFive=await sample(fast);equal(spatial(atFive),spatial(c),'Late join diverged');result.lateJoin={seconds:5,state:c};await setState({qaResult:result});await late.context().close();
    // A background tab resumes with one render tick after its server clock moved.
    await slow.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    await tick(fast,4,60);
    await slow.evaluate(()=>{qaTime+=4000;Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));qaTime+=1;officeQA.app.ticker.update(qaTime);});
    const resumed=await sample(slow),continued=await sample(fast);equal(spatial(continued),spatial(resumed),'Hidden tab catch-up diverged');result.hiddenCatchUp=resumed;await setState({qaResult:result});await slow.context().close();
    const before=await (await page.request.get(origin+'/qa/state')).json();
    const local=await load('?stream=1&scene=cat-laser');await tick(local,4,20);
    const after=await (await page.request.get(origin+'/qa/state')).json();
    equal(before.stats.counters,after.stats.counters,'Local preview changed counters');
    equal(before.incoming,after.incoming,'Local preview sent websocket writes');
    if(writes.length)throw Error('Browser sent mutation requests '+JSON.stringify(writes));
    const localState=await sample(local);if(localState.local!=='cat-laser'||!localState.laser?.visible)throw Error('Local preview lost laser '+JSON.stringify(localState));
    result.localPreview={state:localState,webSocketMessages:after.incoming.length,writes,counters:after.stats.counters};
    await local.context().close();
    const mattress=await load('?stream=1&scene=mattress');await tick(mattress,12,20);
    const mattressState=await mattress.evaluate(()=>({active:officeQA.director.active,visible:officeQA.app.stage.getChildByLabel('office24-mattress',true)?.visible}));
    if(mattressState.active!=='mattress'||!mattressState.visible)throw Error('Legacy mattress failed '+JSON.stringify(mattressState));
    result.legacyMattress=mattressState;await setState({qaResult:result});await mattress.context().close();
    const wash={...scene,id:'qa-shared-wash-2',eventId:'cat-wash',startedAt:baseline+5000,endsAt:baseline+35000};
    await setState({serverNow:baseline+5000,scene:wash});await fast.waitForTimeout(100);await tick(fast,.1,20);
    await fast.evaluate(()=>officeQA.ref.current.launchEvent('cat-laser'));await fast.waitForTimeout(50);await tick(fast,1,20);
    const switched=await sample(fast);if(switched.local!=='cat-laser'||!switched.laser?.visible)throw Error('Pult transition from shared wash failed '+JSON.stringify(switched));
    result.pultDuringSharedWash=switched;
    result.thirdProject=after.stats.projects[2];result.errors=errors;
    if(errors.length)throw Error(errors.join('\n'));
    console.log('OFFICE25_BROWSER_QA '+JSON.stringify(result));return result;
  }finally{for(const context of contexts)await context.close();}
}
