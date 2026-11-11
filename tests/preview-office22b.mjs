// Isolated browser QA of the production PixelOffice with a synthetic roster.
// Status/movement controls affect this page only; there are no API/DB calls.
// Run: node tests/preview-office22.mjs (http://127.0.0.1:3133)
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
    import { OfficeDirectorPanel } from './src/components/office/OfficeDirectorPanel';
    import { EMPTY_DIRECTOR } from './src/components/office/officeDirector';
    import manifest from './public/heroes-ai/atlas.json';
    import { createAtlasPose, animateAtlasPose, atlasHeadY, setCatAtlasPose } from './src/components/office/heroAtlas';
    import { Container, Sprite } from 'pixi.js';
    import { deskSeat, deskSeatScale } from './src/components/office/deskSeating';
    import { WORKSTATIONS } from './src/components/office/workstation';
    import { isLoftWalkable } from './src/components/office/officeNavigation';
    import { isArtWalkable, artFootprintsOverlap } from './src/components/office/aiOfficeNavigation';
    import { createArtEnvironment } from './src/components/office/artEnvironment';
    const qa = window.officeQA = { app: null, ref: null, manifest, Container, Sprite, deskSeat, deskSeatScale, WORKSTATIONS, isLoftWalkable, history: [], catEvents: [], errors: [], isArtWalkable, artFootprintsOverlap, createArtEnvironment, createAtlasPose, animateAtlasPose, atlasHeadY, setCatAtlasPose };
    window.__PIXI_APP_INIT__ = app => { qa.app = app; };
    function Preview() {
      const ref = useRef(null);
      const [director,setDirector]=useState(EMPTY_DIRECTOR);qa.director=director;
      const [now, setNow] = useState(Date.now()/1000); qa.setNow = setNow;
      const [quota, setQuota] = useState(demoQuotas(new URLSearchParams(location.search).get('holiday'), now) || { ...EMPTY_QUOTAS, codex: { windows: [{usedPercent:0, resetsAt:now+3600}], error:null } }); qa.setQuota = setQuota;
      const holiday = officeHoliday(quota, now); qa.holiday = holiday;
      const [roster, setRoster] = useState(${JSON.stringify(agents)}.map(a => ({ ...a, currentStatus: 'idle' })));
      const [theme, setTheme] = useState('art');
      const [renderer, setRenderer] = useState('art');
      const [details, setDetails] = useState(false); qa.setDetails = setDetails;
      qa.setRenderer = setRenderer;
      qa.setTheme = setTheme; qa.setRoster = setRoster;
      qa.ref = ref; qa.agents = roster;
      qa.result = result => setRoster(list => list.map(a => a.name === 'Мотя' ? { ...a, statusText: result === 'unknown' ? '' : 'Последняя регрессия: ' + (result === 'red' ? '⚠ красная' : 'зелёная') } : a));
      return <><OfficeDirectorPanel state={director} launch={id=>ref.current?.launchEvent(id)} stop={()=>ref.current?.stopEvents()} /><PixelOffice onDirectorChange={setDirector} holiday={holiday} holidayNow={now} onCatActivity={event => qa.catEvents.push(event)} agents={roster} details={details} ref={ref} theme={theme} heroRenderer={renderer} /></>;
    }
    createRoot(document.querySelector('main')).render(<React.StrictMode><Preview /></React.StrictMode>);
  ` },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
});
const html = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OFFICE-22b isolated QA</title><style>body{margin:0;background:#292c2d}main{width:min(100vw,160dvh);aspect-ratio:8/5}body{min-height:100dvh;display:grid;place-items:center}main>div{width:100%;height:100%;position:relative;overflow:hidden}[role=tooltip]{position:absolute;z-index:20;max-height:90%;overflow:auto;box-sizing:border-box;background:#171916;color:#fff;font:12px sans-serif;padding:12px}canvas{image-rendering:auto}</style><main></main><script src="/preview.js"></script></html>';
createServer(async (req, res) => {
  try {
    if (new URL(req.url, 'http://localhost').pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); }
    else if (req.url === '/api/office/dcm') { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({bugCount:18,bugTitle:'🐞 B13: Незаданный номинал превращается в C16 в симуляции и в пустое место в документах',regression:{status:'pass',timestamp:new Date().toISOString(),fresh:true}})); }
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
}).listen(Number(process.env.OFFICE_QA_PORT || 3133), '127.0.0.1', () => console.log('Read-only OFFICE-22b preview on port ' + (process.env.OFFICE_QA_PORT || 3133)));
