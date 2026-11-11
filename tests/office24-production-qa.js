async page=>{
 const errors=[],badAssets=[],warnings=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/\.png/.test(r.url()))badAssets.push({url:r.url(),status:r.status()});});page.on('console',m=>{if(m.text().includes('Hero atlas unavailable'))warnings.push(m.text());});
 await page.setViewportSize({width:1440,height:1000});
 await page.addInitScript(()=>{window.__PIXI_APP_INIT__=app=>window.liveOffice=app;});
 await page.goto('http://127.0.0.1:3000/office/stream?scene=mattress');
 await page.waitForFunction(()=>window.liveOffice?.stage.getChildByLabel('office24-mattress',true)?.visible,{timeout:30000});
 await page.waitForTimeout(1500);await page.screenshot({path:'output/playwright/office24-production-mattress-1440.png'});
 const state=await page.evaluate(()=>{const app=liveOffice,bed=app.stage.getChildByLabel('office24-mattress',true);return {bed:{visible:bed.visible,x:bed.x,y:bed.y,width:bed.width,height:bed.height},homeLabels:document.body.innerText.match(/🏠 дома/g)?.length||0,canvas:!!document.querySelector('canvas')};});
 if(!state.homeLabels)throw Error('Production panel does not show home');
 await page.getByRole('button',{name:/Режиссёр/}).click();
 const buttons=await page.getByRole('button').allTextContents();
 if(!buttons.some(x=>x.includes('Срочно на работу'))||!buttons.some(x=>x.includes('ГИП на матрасе')))throw Error('Missing production director buttons');
 if(errors.length||badAssets.length||warnings.length)throw Error(JSON.stringify({errors,badAssets,warnings}));
 return {state,buttons,errors,badAssets,warnings};
}
