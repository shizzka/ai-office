// Run after production restart: node tests/smoke-office2.mjs [LAN origin]
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const origin = process.argv[2] || 'http://192.168.21.166:3000';
const checks = [];
const runId = `office2-${Date.now()}`;
async function check(path, expected, options = {}) {
  const url = new URL(origin + path);
  const response = await new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = transport(url, { method: options.method || 'GET', headers: {
      'x-forwarded-for': runId, ...options.headers,
      ...(options.body ? { 'content-length': Buffer.byteLength(options.body) } : {}),
    } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode,
        json: async () => JSON.parse(Buffer.concat(chunks).toString()),
      }));
    });
    req.setTimeout(10000, () => req.destroy(new Error('Smoke request timed out')));
    req.on('error', reject);
    req.end(options.body);
  });
  checks.push({ path, method: options.method || 'GET', expected, status: response.status,
    access: options.headers?.cookie || options.headers?.authorization ? 'token' : 'anonymous',
    ...(options.headers?.host ? { host: options.headers.host } : {}),
  });
  assert.equal(response.status, expected, `${options.method || 'GET'} ${path}`);
  return response;
}
await check('/office/board', 200);
await check('/office/stream', 200);
await check('/office/admin', 307);
await check('/api/auth/me', 401);
const data = {};
for (const path of ['/api/tasks', '/api/projects', '/api/agents', '/api/activity/feed']) {
  data[path] = await (await check(path, 200)).json();
  await check(path, 401, { headers: { host: 'office.example.test' } });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    await check(path, 401, { method, headers: { 'content-type': 'application/json' }, body: '{}' });
  }
}
for (const path of ['/api/tasks/office2-smoke-nonexistent/status', '/api/activity/log', '/api/agents/register']) {
  await check(path, 401, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
}
await check('/api/tasks', 401, { method: 'POST', headers: { authorization: 'Bearer forged' }, body: '{}' });
await check('/office/admin', 307, { headers: { cookie: 'ai-office-token=forged' } });
const db = new Database('data/database.sqlite', { readonly: true });
const user = db.prepare("SELECT id,username,role FROM users WHERE role='admin' LIMIT 1").get();
db.close();
assert(user, 'An existing admin is required to check signed sessions');
const token = jwt.sign({ userId: user.id, username: user.username, role: user.role },
  process.env.JWT_SECRET || 'dev-secret-change-in-production', { expiresIn: 60 });
const headers = { cookie: `ai-office-token=${token}`, 'content-type': 'application/json' };
await check('/office/admin', 200, { headers });
await check('/api/auth/me', 200, { headers });
// Valid authenticated request reaches validation; empty payload cannot create a task.
await check('/api/tasks', 400, { method: 'POST', headers, body: '{}' });
const tasks = data['/api/tasks'].tasks;
const agents = data['/api/agents'].agents;
const projects = data['/api/projects'].projects;
assert(projects.some(p => p.name === 'DCM Lab'));
assert(projects.some(p => p.name === 'job-hunter'));
assert(agents.some(a => a.id === 'bridge-yarik'));
const result = { at: new Date().toISOString(), origin, checks,
  tasks: tasks.length, projects: projects.map(p => p.name), agents: agents.length,
  yarik: agents.filter(a => a.id === 'bridge-yarik').map(({ name, currentStatus, statusText }) => ({ name, currentStatus, statusText })),
};
await mkdir('output', { recursive: true });
await writeFile('output/smoke-office2.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ checks: checks.length, tasks: result.tasks, agents: result.agents, projects: result.projects, yarik: result.yarik }, null, 2));
