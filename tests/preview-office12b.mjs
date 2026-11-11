// Isolated browser QA of the production PixelOffice with a synthetic roster.
// Status/movement controls affect this page only; there are no API/DB calls.
// Run: node tests/preview-office13.mjs (http://127.0.0.1:3119)
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layout = JSON.parse(await readFile(path.join(root, 'office-art/layout-ai.json'), 'utf8'));
const agents = Object.entries({ ...layout.heroes, ...Object.fromEntries(Object.entries(layout.fixtures).filter(([name]) => name !== 'JH').map(([name, fixture]) => [name, fixture.name_anchor])) }).map(([name, pos], i) => ({
  id: 'qa-' + i, name, role: 'QA', positionX: pos.x, positionY: pos.y,
  statusText: name === 'Мотя' ? 'Последняя регрессия: зелёная' : '',
}));
agents.push({id:'bridge-lyuda',name:'Люда',role:'Эксплуатация',currentStatus:'working',statusText:'jh-ops: наблюдение'}, {id:'bridge-sharik',name:'Шарик',role:'Бот',currentStatus:'idle',statusText:'Последний поиск: 01.11 17:30'});
const bundle = await build({
  stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React, { useRef, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { officeHoliday, demoQuotas, EMPTY_QUOTAS } from './src/components/office/officeHoliday';
    import { PixelOffice } from './src/components/office/PixelOffice';
    import { createAtlasPose, animateAtlasPose, atlasHeadY } from './src/components/office/heroAtlas';
    import { isLoftWalkable } from './src/components/office/officeNavigation';
    import { isArtWalkable, artFootprintsOverlap } from './src/components/office/aiOfficeNavigation';
    import { createArtEnvironment } from './src/components/office/artEnvironment';
    const qa = window.officeQA = { app: null, ref: null, isLoftWalkable, history: [], catEvents: [], errors: [], isArtWalkable, artFootprintsOverlap, createArtEnvironment, createAtlasPose, animateAtlasPose, atlasHeadY };
    window.__PIXI_APP_INIT__ = app => { qa.app = app; };
    function Preview() {
      const ref = useRef(null);
      const [now, setNow] = useState(Date.now()/1000); qa.setNow = setNow;
      const [quota, setQuota] = useState(demoQuotas(new URLSearchParams(location.search).get('holiday'), now) || { ...EMPTY_QUOTAS, codex: { windows: [{usedPercent:90, resetsAt:now+3600}], error:null } }); qa.setQuota = setQuota;
      const holiday = officeHoliday(quota, now); qa.holiday = holiday;
      const [roster, setRoster] = useState(${JSON.stringify(agents)}.map(a => ({ ...a, currentStatus: 'idle' })));
      const [theme, setTheme] = useState('art');
      const [renderer, setRenderer] = useState('art');
      const [details, setDetails] = useState(false); qa.setDetails = setDetails;
      qa.setRenderer = setRenderer;
      qa.setTheme = setTheme; qa.setRoster = setRoster;
      qa.ref = ref; qa.agents = roster;
      qa.result = result => setRoster(list => list.map(a => a.name === 'Мотя' ? { ...a, statusText: result === 'unknown' ? '' : 'Последняя регрессия: ' + (result === 'red' ? '⚠ красная' : 'зелёная') } : a));
      return <PixelOffice holiday={holiday} holidayNow={now} onCatActivity={event => qa.catEvents.push(event)} agents={roster} details={details} ref={ref} theme={theme} heroRenderer={renderer} />;
    }
    createRoot(document.querySelector('main')).render(<React.StrictMode><Preview /></React.StrictMode>);
  ` },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
});
const html = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OFFICE-12b isolated QA</title><style>body{margin:0;background:#292c2d}main{width:960px;height:600px}main>div{width:100%;height:100%;position:relative;overflow:hidden}[role=tooltip]{position:absolute;z-index:20;max-height:90%;overflow:auto;box-sizing:border-box;background:#171916;color:#fff;font:12px sans-serif;padding:12px}canvas{image-rendering:pixelated}</style><main></main><script src="/preview.js"></script></html>';
createServer(async (req, res) => {
  try {
    if (new URL(req.url, 'http://localhost').pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); }
    else if (req.url === '/api/office/moments') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ bugs: 'вагон 🚃', total: 0, latestCount: 3 })); }
    else if (req.url === '/favicon.ico') { res.writeHead(204).end(); }
    else if (req.url === '/preview.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
    else {
      const publicRoot = path.join(root, 'public');
      const asset = path.resolve(publicRoot, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!asset.startsWith(publicRoot + path.sep) || !asset.endsWith('.png')) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', 'image/png'); res.end(await readFile(asset));
    }
  } catch { res.writeHead(404).end(); }
}).listen(Number(process.env.OFFICE_QA_PORT || 3122), '127.0.0.1', () => console.log('Read-only office preview on port ' + (process.env.OFFICE_QA_PORT || 3122)));
