async page=>{
  const errors=[],writes=[],result={};
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
  await page.setViewportSize({width:1440,height:1000});
  const load=async()=>{
    if(page.url()!=='http://127.0.0.1:3140/')await page.goto('http://127.0.0.1:3140/');
    await page.waitForFunction(()=>window.officeQA?.director.ready,undefined,{timeout:30000});
    await page.getByRole('button',{name:'Режиссёр',exact:true}).click();
    if(!await page.locator('#office-director').isVisible())await page.getByRole('button',{name:'Режиссёр',exact:true}).click();
    await page.evaluate(()=>{
      const q=officeQA;q.app.stop();q.app.ticker.maxFPS=0;q.render=q.app.render.bind(q.app);
      q.app.ticker.remove(q.app.render,q.app);q.app.render=()=>{};
      q.fakeTime=performance.now();q.wall=Date.now();
      Object.defineProperty(performance,'now',{configurable:true,value:()=>q.fakeTime});Date.now=()=>q.wall;
      q.trace=[];q.lastStates={};
    });
  };
  const drive=async seconds=>page.evaluate(seconds=>{
    const q=officeQA,find=l=>q.app.stage.getChildByLabel(l,true);
    for(let k=0;k<Math.ceil(seconds/.05);k++){
      q.fakeTime+=50;q.wall+=50;q.app.ticker.update(q.fakeTime);
      for(const a of q.agents.filter(a=>!['Коржик','Масяня','Мотя','Люда','Шарик'].includes(a.name))){
        const n=find('agent-node-'+a.id),label=find('annotation-'+a.id);if(!n)continue;
        const value={name:a.name,x:n.x,y:n.y,alpha:n.alpha,visible:n.visible,labelAlpha:label?.alpha,labelVisible:label?.visible};
        const old=q.lastStates[a.name];
        if(n.alpha<1&&n.visible){
          if(n.x<750||n.x>856||n.y<474||n.y>572)throw Error('Faded outside door: '+JSON.stringify(value));
          if(Math.hypot(n.x-875,n.y-468)<4)throw Error('Faded at cooler');
          if(Math.abs(label.alpha-n.alpha)>1e-9)throw Error('Label did not fade with hero');
        }
        if(!old||old.alpha!==value.alpha||old.visible!==value.visible)q.trace.push({...value,time:q.fakeTime});
        q.lastStates[a.name]=value;
      }
    }
    q.render();return {people:Object.values(q.lastStates),trace:q.trace,events:q.catEvents};
  },seconds);
  const launch=async id=>{
    await page.locator('[data-office-event="'+id+'"]').click();
    await drive(.05);
    await page.waitForTimeout(20);
    const state=await page.evaluate(()=>officeQA.director);
    if(state.error)throw Error(JSON.stringify(state));
    return state;
  };
  const ensure=(ok,message,value)=>{if(!ok)throw Error(message+' '+JSON.stringify(value));};
  const fade=(s,name)=>s.trace.filter(a=>a.name===name&&a.visible&&a.alpha>0&&a.alpha<1);
  const door=p=>Math.hypot(p.x-804,p.y-476)<.001;
  const reset=async()=>{
    if(await page.locator('[aria-controls="office-director"]').getAttribute('aria-expanded')==='false')await page.getByRole('button',{name:'Режиссёр',exact:true}).click();
    await page.locator('.director-stop').click();await drive(.05);
    await page.evaluate(()=>{officeQA.trace=[];officeQA.lastStates={};officeQA.catEvents=[];});
  };

  await load();result.eveningLaunch=await launch('evening');let s=await drive(45);
  const leavers=['Ася','Ярик','Иваныч','Тая','Саня','Марина'];
  for(const name of leavers){const p=s.people.find(a=>a.name===name);ensure(!p.visible&&door(p),'Evening did not end at door',p);ensure(fade(s,name).length>0,'No evening fade',name);}
  result.evening={departed:s.people.filter(a=>leavers.includes(a.name)),fadeSamples:s.trace.filter(a=>a.alpha>0&&a.alpha<1)};

  await reset();result.rushLaunch=await launch('rush');s=await drive(2.1);
  ensure(fade(s,'Ася').some(door),'Urgent return did not fade in at door',s);
  await page.getByRole('button',{name:'Закрыть режиссёра',exact:true}).click();
  await page.screenshot({path:'output/playwright/office24b-door-1440.png'});
  s=await drive(16);const asya=s.people.find(a=>a.name==='Ася');ensure(asya.visible&&asya.alpha===1&&Math.hypot(asya.x-122,asya.y-546)<1,'Urgent arrival did not finish at desk',asya);
  result.rush={arrival:asya,fadeSamples:fade(s,'Ася')};

  await reset();result.pizzaLaunch=await launch('pizza');s=await drive(170);
  const ownerFades=fade(s,'Евгений');ensure(ownerFades.length>=4&&ownerFades.every(door),'Pizza did not leave and enter through door',ownerFades);
  ensure(s.events.some(e=>e.message.includes('пицца')),'Pizza did not run',s.events);
  result.pizza={ownerFades,events:s.events,owner:s.people.find(a=>a.name==='Евгений')};

  await reset();await launch('pot');s=await drive(95);
  ensure(fade(s,'Марина').length>=4&&fade(s,'Марина').every(door),'Pot fetch did not use door',s.trace);
  ensure(s.events.some(e=>e.message==='🪴 Новый горшок на месте'),'Pot was not replaced',s.events);
  result.pot={marinaFades:fade(s,'Марина'),events:s.events};
  ensure(!errors.length,'Browser errors',errors);ensure(!writes.length,'Browser mutated external state',writes);
  result.errors=errors;result.writes=writes;
  return result;
}
