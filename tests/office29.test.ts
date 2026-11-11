import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MetricList, formatOfficeMetric, hasOfficeTaskMetrics} from '../src/components/office/OfficeStats';
import {scoreboardReading} from '../src/components/office/officeScoreboard';
import type {OfficeStatsSnapshot} from '../src/lib/officeStatsTypes';
const require = createRequire(import.meta.url);
const {parseBugs, collectProjectStats} = require('../worker/office-stats');
const fixture = (name:string) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/office29', name),'utf8');

test('DCM table and heading records are unique; only the first paragraph supplies heading status',()=>{
  assert.deepEqual(parseBugs(fixture('dcm-backlog.md')),{bugsFound:8,bugsClosed:6,tasksCreated:3,tasksDone:1});
  const heading='### B44 · заголовок\n\n✅ Закрыто.\n';
  const row='| B44 | major | запись | модуль | открыто |\n';
  assert.deepEqual(parseBugs(heading+row),parseBugs(row+heading));
  assert.equal(parseBugs(heading+row).bugsFound,1);
  assert.equal(parseBugs(heading+row).bugsClosed,1);
});

test('real JH column shapes group B+S and T+F; notes and green/open statuses do not close records',()=>{
  assert.deepEqual(parseBugs(fixture('jh-backlog.md')),{bugsFound:7,bugsClosed:3,tasksCreated:8,tasksDone:3});
  assert.deepEqual(parseBugs('| B1 | открыто | описание | модуль | ✅ в примечании |'),{bugsFound:1,bugsClosed:0,tasksCreated:0,tasksDone:0});
  assert.equal(parseBugs('| B12a | ✅ | описание |\n| B12b | 🟡 | описание |').bugsFound,2);
});

function configured(run:(config:string, root:string)=>void) {
  const root=mkdtempSync(path.join(tmpdir(),'office29-'));
  try {run(path.join(root,'projects.json'),root);} finally {rmSync(root,{recursive:true,force:true});}
}
test('missing, partial and explicitly unavailable sources yield null; readable empty logs yield zero',()=>configured((config,root)=>{
  const log=path.join(root,'pipeline.log');writeFileSync(log,'');
  const backlog=path.join(root,'BACKLOG.md');writeFileSync(backlog,'');
  const cases=[{}, {pipeline:path.join(root,'missing')}, {pipeline:{type:'unavailable'}}, {pipeline:{type:'logs',files:[log,path.join(root,'missing')]}}];
  for (const source of cases) {
    writeFileSync(config,JSON.stringify({projects:[{id:'jh',name:'Job Hunter',backlog,...source}]}));
    const stats=collectProjectStats(config);
    for(const key of ['loops','reviews','regressionsPassed','regressionsFailed']) {
      assert.equal(stats.projects[0][key],null);assert.equal(stats.totals[key],null);
    }
    assert.equal(stats.totals.bugsFound,0);
    const html=renderToStaticMarkup(createElement(MetricList,{value:stats.totals,stream:false}));
    assert.equal((html.match(/нет данных/g)||[]).length,4);
  }
  writeFileSync(config,JSON.stringify({projects:[{id:'dcm',name:'DCM',pipeline:{type:'logs',files:[log,log]}}]}));
  assert.equal(collectProjectStats(config).totals.loops,0);
  assert.equal(collectProjectStats(config).totals.bugsFound,null);
  assert.equal(formatOfficeMetric(null),'нет данных');assert.equal(formatOfficeMetric(0),'0');
  writeFileSync(config,JSON.stringify({projects:[]}));assert.equal(collectProjectStats(config).totals.loops,null);
}));

test('stream filters JH before collecting/summing; panel and LED separate tasks and bugs by project',()=>configured((config,root)=>{
  const backlog=path.join(root,'dcm.md'),jh=path.join(root,'jh.md'),pipeline=path.join(root,'pipeline.log');
  writeFileSync(backlog,fixture('dcm-backlog.md'));writeFileSync(jh,fixture('jh-backlog.md'));
  writeFileSync(pipeline,'коммит abcdef1 — ROUND-1\nрегрессия RESULT True\nCRITIC-1 готов\n');
  writeFileSync(config,JSON.stringify({projects:[{id:'dcm',name:'DCM',backlog,pipeline,queue:pipeline},{id:'jh',name:'Job Hunter',backlog:jh,hideInStream:true,pipeline:{type:'unavailable'},vacancies:path.join(root,'missing') }]}));
  const all=collectProjectStats(config),stream=collectProjectStats(config,true);
  assert.equal(hasOfficeTaskMetrics(all),true);
  const legacy=structuredClone(all);delete legacy.totals.tasksCreated;
  assert.equal(hasOfficeTaskMetrics(legacy),false);
  assert.equal(all.totals.bugsFound,15);assert.equal(all.totals.tasksCreated,11);
  assert.equal(all.totals.loops,null);assert.equal(stream.totals.loops,1);
  assert.equal(stream.totals.bugsFound,8);assert.equal(stream.totals.tasksCreated,3);
  assert.equal(stream.projects.length,1);assert.ok(!/Job Hunter|"jh"|vacancies/.test(JSON.stringify(stream)));
  for (const stats of [all,stream]) {
    const readings=Array.from({length:6*(stats.projects.length+1)},(_,slot)=>scoreboardReading({...stats,counters:{pizzas:0,potsBroken:0}} as OfficeStatsSnapshot,slot*7));
    assert.ok(readings.some(r=>r.label==='Σ · ЗАДАЧИ СОЗДАНЫ'&&r.value===stats.totals.tasksCreated));
    assert.ok(readings.some(r=>r.label==='DCM · БАГИ НАЙДЕНЫ'&&r.value===8));
    assert.equal(readings.some(r=>r.label.startsWith('JH')),stats===all);
    const html=renderToStaticMarkup(createElement(MetricList,{value:stats.totals,stream:stats===stream}));
    assert.match(html,/Создано задач/);assert.match(html,/Сделано задач/);assert.match(html,/Найдено багов/);
  }
}));
