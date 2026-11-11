async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3139/?stream=1&time=day');
  await page.waitForFunction(() => window.officeQA?.director.ready);
  await page.evaluate(() => {
    const q = officeQA;
    q.app.stop(); q.app.ticker.maxFPS = 0;
    window.qaTime = performance.now();
    Object.defineProperty(performance, 'now', {configurable: true, value: () => qaTime});
    q.app.ticker.remove(q.app.render, q.app);
    q.tick = seconds => {
      for (let frame = 0; frame < Math.ceil(seconds * 20); frame++) {
        qaTime += 50; q.app.ticker.update(qaTime);
      }
    };
    q.sample = () => ['Коржик', 'Масяня'].map(name => {
      const actor = q.agents.find(a => a.name === name);
      const node = q.app.stage.getChildByLabel('agent-node-' + actor.id, true);
      const annotation = q.app.stage.getChildByLabel('annotation-' + actor.id, true);
      const text = root => [root.text || '', ...(root.children || []).flatMap(text)];
      const effect = q.app.stage.getChildByLabel('cat-reaction-' + name, true);
      const zzz = effect?.children.find(c => c.text === 'z z z');
      const phrase = effect?.children[1];
      const p = node.getGlobalPosition(), rect = q.app.canvas.getBoundingClientRect();
      return {name, status: text(annotation).join(' '), sleeping: text(annotation).join(' ').includes('спит клубком'),
        zzz: !!(zzz?.visible && effect?.visible && zzz.alpha > .2),
        reaction: phrase?.visible && effect?.visible ? phrase.text : '',
        click: {x: rect.x + p.x * rect.width / 960, y: rect.y + (p.y - 12) * rect.height / 600}};
    });
  });
  const result = {errors};
  // Find a natural daytime nap with a visible Zzz; no cat state is overwritten.
  result.day = await page.evaluate(() => {
    const q = officeQA;
    for (let second = 0; second < 300; second++) {
      const sample = q.sample();
      if (sample.some(cat => cat.sleeping && cat.zzz) && sample.some(cat => !cat.sleeping)) {
        q.app.render(); return sample;
      }
      q.tick(1);
    }
    throw Error('No staggered daytime nap with visible Zzz');
  });
  await page.screenshot({path: 'output/office26-nap-1440.png'});
  const sleeper = result.day.find(cat => cat.sleeping);
  await page.mouse.click(sleeper.click.x, sleeper.click.y);
  result.tap = await page.evaluate(() => {officeQA.tick(.1); officeQA.app.render(); return officeQA.sample();});
  const awake = result.tap.find(cat => cat.name === sleeper.name);
  if (awake.sleeping || awake.zzz || !awake.reaction) throw Error('Tap did not wake sleeper: ' + JSON.stringify(awake));
  // Director demos must retain their priority over local naps.
  await page.evaluate(() => officeQA.ref.current.launchEvent('cat-wash'));
  await page.waitForTimeout(100);
  result.demo = await page.evaluate(() => {officeQA.tick(1); return officeQA.sample();});
  if (!result.demo.every(cat => cat.status.includes('умывается'))) throw Error('Wash demo lost its pose');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('OFFICE26_BROWSER_QA ' + JSON.stringify(result));
  return result;
}
