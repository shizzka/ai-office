async page=>{
 const errors=[],failedAssets=[],snapshots=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>{if(/heroes-ai|office-bg/.test(r.url()))failedAssets.push(r.url());});
 page.on('websocket',socket=>socket.on('framereceived',event=>{try{const state=JSON.parse(event.payload);if(state.type==='office:state'&&socket.url().includes('stream=1'))snapshots.push(state);}catch{}}));
 await page.setViewportSize({width:1440,height:1000});
 const origin='http://127.0.0.1:3000';
 const open=async stream=>{
  await page.goto(origin+'/office/stream'+(stream?'?stream=1':''));
  await page.waitForFunction(()=>document.querySelector('canvas')&&document.body.innerText.includes('14 агентов'),{timeout:30000});
  await page.waitForTimeout(1500);
 };
 const tapBoard=async()=>{
  const canvas=page.locator('canvas').first(),r=await canvas.boundingBox();
  await page.mouse.click(r.x+289.5/960*r.width,r.y+53.5/600*r.height);
  await page.getByRole('dialog',{name:'Статистика офиса'}).waitFor();
 };
 await open(false);
 const normal=await (await page.request.get(origin+'/api/office/stats')).json();
 if(normal.projects.length!==2||typeof normal.totals.vacancies!=='number')throw Error('Normal project stats missing');
 await page.screenshot({path:'output/office25-1440.png'});
 await tapBoard();
 await page.getByText('Найдено вакансий',{exact:false}).first().waitFor();
 await page.getByRole('dialog').getByText('DCM',{exact:true}).click();
 await page.screenshot({path:'output/office25-stats.png'});
 const text=await page.getByRole('dialog').innerText();
 for(const label of ['Разбито горшков','Проверок УЗО','По проектам','Игровые счётчики с','Job Hunter'])if(!text.includes(label))throw Error('Missing stats field '+label);
 await page.keyboard.press('Escape');
 if(await page.getByRole('dialog').count())throw Error('Escape did not close stats');
 snapshots.length=0;
 await open(true);await tapBoard();
 const streamText=await page.getByRole('dialog').innerText();
 const stream=await (await page.request.get(origin+'/api/office/stats?stream=1')).json();
 if(/вакансий|Job Hunter/.test(streamText)||JSON.stringify(stream).includes('vacancies'))throw Error('Private stats shown in stream');
 await page.waitForTimeout(1200);
 if(!snapshots.length||snapshots.some(s=>JSON.stringify(s.stats).includes('vacancies')||s.stats.projects.some(p=>p.id==='jh')))throw Error('WS stream privacy failed');
 if(errors.length||failedAssets.length)throw Error(JSON.stringify({errors,failedAssets}));
 await page.keyboard.press('Escape');
 await page.goto(origin+'/office/stream');
 return {passed:true,viewport:[1440,1000],normal:{since:normal.since,totals:normal.totals,projects:normal.projects.map(p=>p.id)},stream:{totals:stream.totals,projects:stream.projects.map(p=>p.id),wsSnapshots:snapshots.length},canvasTap:true,escape:true,errors,failedAssets};
}
