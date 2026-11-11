import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import React, {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TaskCard} from '../src/components/tasks/TaskCard';
import type {Task} from '../src/lib/utils/types';

const require = createRequire(import.meta.url);
const {parsePipeline, collectProjectStats} = require('../worker/office-stats');
const pipeline = readFileSync(new URL('./fixtures/office30/pipeline.log', import.meta.url), 'utf8');

test('shared DCM journal counts both lanes exactly once, including smeta commits and regression verdicts', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'office30-'));
  try {
    const log = path.join(root, 'pipeline.log'), config = path.join(root, 'projects.json');
    writeFileSync(log, pipeline);
    const queues = [
      {path:path.join(root, 'queue'), name:'Щит', logMarker:'[очередь]'},
      {path:path.join(root, 'queue-smeta'), name:'Смета', logMarker:'[смета]'},
    ];
    for (const queue of queues) mkdirSync(queue.path);
    const project = {id:'dcm', name:'DCM', pipeline:log, queues};
    writeFileSync(config, JSON.stringify({projects:[project]}));
    const stats = collectProjectStats(config);
    assert.equal(stats.projects[0].loops, 2);
    assert.equal(stats.projects[0].regressionsPassed, 2);
    assert.equal(stats.projects[0].regressionsFailed, 2);
    assert.equal(stats.totals.loops, 2);
    assert.equal(collectProjectStats(config, true).totals.regressionsPassed, 2);
    assert.deepEqual(parsePipeline(pipeline).loops, stats.totals.loops);
    // Explicit shared log aliases remain deduplicated, as does the old path.
    writeFileSync(config, JSON.stringify({projects:[{...project, queue:log, queues:queues.map(queue => ({...queue, log}))}]}));
    assert.deepEqual(collectProjectStats(config), stats);
    // A legacy queue directory is not a second log source.
    writeFileSync(config, JSON.stringify({projects:[{...project, queue:queues[0].path}]}));
    assert.deepEqual(collectProjectStats(config), stats);
    // Distinct journals also contribute both lanes.
    const smetaLog = path.join(root, 'smeta.log');
    writeFileSync(log, pipeline.split('\n').filter(line => line.includes('[очередь]')).join('\n'));
    writeFileSync(smetaLog, pipeline.split('\n').filter(line => line.includes('[смета]')).join('\n'));
    writeFileSync(config, JSON.stringify({projects:[{...project, queues:[queues[0], {...queues[1], log:smetaLog}]}]}));
    assert.deepEqual(collectProjectStats(config), stats);
  } finally { rmSync(root, {recursive:true, force:true}); }
});

test('task cards render the configured lane name delivered by the bridge', () => {
  // tsx preserves this project's classic JSX transform outside Next's compiler.
  Object.assign(globalThis, {React});
  for (const [name, code] of [['Щит', 'SHIELD-1'], ['Смета', 'SMETA-0']]) {
    const task = {id:`bridge-dcm-task-${code.toLowerCase()}`, projectId:'bridge-dcm',
      title:`DCM · ${name} · ${code} — контракт`, status:'todo', priority:'medium'} as Task;
    const html = renderToStaticMarkup(createElement(TaskCard, {task, projectName:'DCM Lab', onDragStart:() => {}}));
    assert.ok(html.includes(`DCM · ${name} · ${code}`));
  }
});
