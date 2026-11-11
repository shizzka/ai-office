// Isolated browser QA of the production PixelOffice with a synthetic roster.
// Status/movement controls affect this page only; there are no API/DB calls.
// Run: node tests/preview-office.mjs (http://127.0.0.1:3116)
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layout = JSON.parse(await readFile(path.join(root, 'office-art/layout-ai.json'), 'utf8'));
const agents = Object.entries(layout.heroes).map(([name, pos], i) => ({
  id: 'qa-' + i, name, role: 'QA', positionX: name === 'Саня' ? 610 : pos.x, positionY: name === 'Саня' ? 550 : pos.y,
  statusText: name === 'Мотя' ? 'Последняя регрессия: зелёная' : '',
}));
const bundle = await build({
  stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React, { useRef, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { PixelOffice } from './src/components/office/PixelOffice';
    import { createAtlasPose, animateAtlasPose } from './src/components/office/heroAtlas';
    import { isLoftWalkable } from './src/components/office/officeNavigation';
    import { isArtWalkable, artFootprintsOverlap } from './src/components/office/aiOfficeNavigation';
    import { createArtEnvironment } from './src/components/office/artEnvironment';
    const qa = window.officeQA = { app: null, ref: null, isLoftWalkable, history: [], errors: [], isArtWalkable, artFootprintsOverlap, createArtEnvironment, createAtlasPose, animateAtlasPose };
    window.__PIXI_APP_INIT__ = app => { qa.app = app; };
    function Preview() {
      const ref = useRef(null);
      const [roster, setRoster] = useState(${JSON.stringify(agents)}.map(a => ({ ...a, currentStatus: 'idle' })));
      const [theme, setTheme] = useState('art');
      const [renderer, setRenderer] = useState('art');
      qa.setRenderer = setRenderer;
      qa.setTheme = setTheme; qa.setRoster = setRoster;
      qa.ref = ref; qa.agents = roster;
      qa.result = result => setRoster(list => list.map(a => a.name === 'Мотя' ? { ...a, statusText: result === 'unknown' ? '' : 'Последняя регрессия: ' + (result === 'red' ? '⚠ красная' : 'зелёная') } : a));
      return <PixelOffice agents={roster} ref={ref} theme={theme} heroRenderer={renderer} />;
    }
    createRoot(document.querySelector('main')).render(<React.StrictMode><Preview /></React.StrictMode>);
  ` },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
});
const html = '<!doctype html><html lang="ru"><meta charset="utf-8"><title>OFFICE-8 isolated QA</title><style>body{margin:0;background:#292c2d}main{width:960px;height:600px}main>div{width:100%;height:100%}canvas{image-rendering:pixelated}</style><main></main><script src="/preview.js"></script></html>';
createServer(async (req, res) => {
  try {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); }
    else if (req.url === '/favicon.ico') { res.writeHead(204).end(); }
    else if (req.url === '/preview.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); }
    else {
      const publicRoot = path.join(root, 'public');
      const asset = path.resolve(publicRoot, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!asset.startsWith(publicRoot + path.sep) || !asset.endsWith('.png')) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', 'image/png'); res.end(await readFile(asset));
    }
  } catch { res.writeHead(404).end(); }
}).listen(Number(process.env.OFFICE_QA_PORT || 3116), '127.0.0.1', () => console.log('Read-only office preview on port ' + (process.env.OFFICE_QA_PORT || 3116)));
