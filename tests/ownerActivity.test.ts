import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { latestOwnerInput, ownerStatus, ownerUserTimestamp } from '../src/lib/ownerActivity';
const now = Date.now();
const row = (age: number, role = 'user', content: unknown = 'Проверь сборку') => ({ timestamp: new Date(now-age).toISOString(), cwd: '/home/q/work/dcm-local', message: { role, content } });
test('owner activity uses a strict two-minute human input window', () => {
  assert.equal(ownerStatus(now-119999, now).currentStatus, 'working');
  assert.deepEqual(ownerStatus(now-120000, now), { currentStatus:'idle', statusText:'на объекте' });
  assert.equal(ownerStatus(now+1, now).currentStatus, 'idle');
  assert.equal(ownerUserTimestamp(row(0,'assistant')), null);
  assert.equal(ownerUserTimestamp(row(0,'user',[{ type:'tool_result',content:'ok' }])), null);
  assert.equal(ownerUserTimestamp({ ...row(0), isMeta: true }), null);
});
test('recursive JSONL reader rejects assistant/tool activity and unrelated projects, handles root cwd sessions', async () => {
  const root = await mkdtemp(join(tmpdir(),'office-owner-'));
  try {
    await mkdir(join(root,'nested'));
    const file = join(root,'nested','session.jsonl');
    await writeFile(file, [row(180000),row(0,'assistant'),row(0,'user',[{type:'tool_result',content:'ok'}])].map(r=>JSON.stringify(r)).join('\n'));
    assert.equal(ownerStatus(await latestOwnerInput(root,now),now).currentStatus,'idle');
    await writeFile(file, JSON.stringify({ ...row(1000), cwd:'/home/q/other' }));
    assert.equal(await latestOwnerInput(root,now),0);
    await writeFile(file, JSON.stringify({ ...row(1000), cwd:'/home/q', message:{ role:'user', content:'Работаем в /home/q/work/job-hunter' } })+'\n{partial');
    assert.equal(await latestOwnerInput(root,now),now-1000);
    assert.equal(await latestOwnerInput(root,now),now-1000,'cached read');
    await writeFile(file, JSON.stringify(row(500)));
    assert.equal(await latestOwnerInput(root,now),now-500,'append/change invalidates cache');
    await utimes(file,new Date(now-180000),new Date(now-180000));
    assert.equal(await latestOwnerInput(root,now),0);
  } finally { await rm(root,{recursive:true,force:true}); }
});
