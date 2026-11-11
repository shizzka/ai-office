/** Numeric/null projection of configurable local project evidence. Never returns source text. */
const fs = require('fs');
const path = require('path');

const BACKLOG_KEYS = ['bugsFound', 'bugsClosed', 'tasksCreated', 'tasksDone'];
const PIPELINE_KEYS = ['regressionsPassed', 'regressionsFailed', 'loops', 'reviews'];
const REAL_KEYS = [...BACKLOG_KEYS, ...PIPELINE_KEYS];
const emptyMetrics = () => Object.fromEntries(REAL_KEYS.map(key => [key, 0]));
function readText(filename) {
  if (typeof filename !== 'string') return null;
  try { return fs.readFileSync(filename, 'utf8'); } catch { return null; }
}
function closedStatus(status) {
  // Ignore negated completion and infinitives such as «вкладку закрыть».
  const positive = status.replace(/не\s+(?:сделано|закрыт[оаы]?|исправлено|done|closed)(?!\p{L})/giu, '');
  return /✅|(?<!\p{L})(?:сделано|закрыт[оаы]?|исправлено|done|closed|не баг)(?!\p{L})/iu.test(positive);
}
function parseBugs(text) {
  const records = new Map();
  const lines = text.split(/\r?\n/);
  let statusColumn = -1;
  const add = (id, status) => {
    const key = id.toUpperCase().replace('-', '');
    // A summary row and a detailed heading describe the same record.
    records.set(key, Boolean(records.get(key)) || closedStatus(status));
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const cells = line.split(/(?<!\\)\|/).slice(1, -1);
    if (/^\s*\|/.test(line) && /^(?:ID|#)$/iu.test(cells[0]?.trim())) {
      statusColumn = cells.findIndex(cell => /^(?:статус|status|задача и итог круга)$/iu.test(cell.trim()));
    } else if (!/^\s*\|/.test(line)) statusColumn = -1;
    const row = line.match(/^\s*\|\s*\**([BTSF]-?\d+[a-zа-я]?)\**\s*\|/iu);
    if (row) {
      // Headerless DCM: severity second, status last. JH: status second,
      // including 🟢 (which alone does not mean done), ⏳ and plain text.
      const severity = /^\s*\**(?:major|minor|critical|blocker|ux|tests|security|техдолг|функция)\**\s*$/iu.test(cells[1] || '');
      const status = statusColumn >= 0 ? cells[statusColumn] : severity && cells.length >= 3 ? cells.at(-1) : cells[1];
      add(row[1], status || '');
    }
    const heading = line.match(/^#{3}\s+\**([BTSF]-?\d+[a-zа-я]?)\**(?=\s|[·:—–-]|$)/iu);
    if (heading) {
      let next = index + 1;
      while (next < lines.length && !lines[next].trim()) next++;
      const paragraph = [];
      while (next < lines.length && lines[next].trim() && !/^\s*(?:#{1,6}\s|\|)/u.test(lines[next])) paragraph.push(lines[next++]);
      add(heading[1], paragraph.join(' '));
    }
  }
  const bugs = [...records].filter(([id]) => /^[BS]/.test(id));
  const tasks = [...records].filter(([id]) => /^[TF]/.test(id));
  return { bugsFound: bugs.length, bugsClosed: bugs.filter(([,closed]) => closed).length,
    tasksCreated: tasks.length, tasksDone: tasks.filter(([,closed]) => closed).length };
}
function parsePipeline(text) {
  const metrics = emptyMetrics(), commits = new Set(), reviews = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (/регресс|regression/iu.test(line)) {
      const result = line.match(/RESULT\s*[:=]?\s*(True|False)/i);
      const colour = line.match(/зел[её]н\p{L}*|красн\p{L}*/iu);
      const verdict = line.match(/\b(PASS|FAIL)\b/i);
      const passed = result ? result[1].toLowerCase() === 'true' : colour ? /^зел/iu.test(colour[0]) : verdict ? verdict[1].toLowerCase() === 'pass' : null;
      // 'not green' is a failure, including an interrupted queue gate.
      if (passed !== null) metrics[/не\s+зел/iu.test(line) ? 'regressionsFailed' : passed ? 'regressionsPassed' : 'regressionsFailed']++;
    }
    const commit = line.match(/(?:коммит|commit)\s+([a-f\d]{7,40})\b/iu);
    // Docs/acceptance commits are not completed developer rounds.
    if (commit && !/(?:docs[- ]|при[её]мк|review|critic|ревью)/iu.test(line)) commits.add(commit[1].toLowerCase());
    const review = line.match(/\b(CRITIC[- ]?\d+)\b/iu);
    if (review && /готов|заверш|принят|конец|completed|done|EXIT\s*=\s*0/iu.test(line)) reviews.add(review[1].toUpperCase());
    else if (!review && /Ася|Asya/iu.test(line) && /(?:ревью|review).*(?:готов|заверш|принят|completed|done)/iu.test(line)) reviews.add(line.trim());
  }
  metrics.loops = commits.size;
  metrics.reviews = reviews.size;
  return metrics;
}
function vacancyFiles(source) {
  if (typeof source === 'string') return [source];
  if (!source || typeof source !== 'object') return [];
  const files = Array.isArray(source.files) ? source.files.filter(f => typeof f === 'string') : [];
  if (typeof source.profilesRoot === 'string') {
    try {
      for (const item of fs.readdirSync(source.profilesRoot, {withFileTypes:true})) {
        if (item.isDirectory()) files.push(path.join(source.profilesRoot, item.name, 'analytics_events.jsonl'));
      }
    } catch { /* optional evidence */ }
  }
  return files;
}
const analyticsCache = new Map();
function vacancyRuns(filename) {
  let fd;
  try {
    const stat=fs.statSync(filename), prior=analyticsCache.get(filename);
    const state=prior && prior.ino===stat.ino && prior.offset<=stat.size && (prior.offset!==stat.size||prior.mtime===stat.mtimeMs) ? prior : {ino:stat.ino,offset:0,pending:Buffer.alloc(0),runs:new Map()};
    if(state.offset===stat.size)return state.runs;
    fd=fs.openSync(filename,'r');
    const buffer=Buffer.alloc(256*1024);
    while(state.offset<stat.size) {
      const count=fs.readSync(fd,buffer,0,Math.min(buffer.length,stat.size-state.offset),state.offset);
      if(!count)break;
      state.offset+=count;
      const chunk=Buffer.concat([state.pending,buffer.subarray(0,count)]),end=chunk.lastIndexOf(10);
      if(end<0){state.pending=chunk;continue;}
      state.pending=Buffer.from(chunk.subarray(end+1));
      const complete=chunk.subarray(0,end);
      if(!complete.includes('"search_finished"'))continue;
      for(const line of complete.toString('utf8').split('\n')) {
        // Most analytics rows are decisions; avoid JSON-parsing their private payloads.
        if(!/"event"\s*:\s*"search_finished"/.test(line))continue;
      try {
        const row = JSON.parse(line);
        if (row.event !== 'search_finished' || !Number.isSafeInteger(row.found) || row.found < 0) continue;
        const key = typeof row.run_id === 'string' ? row.run_id : typeof row.event_id === 'string' ? row.event_id : null;
        if (key) state.runs.set(key, row.found);
      } catch { /* incomplete/unrelated record */ }
      }
    }
    state.mtime=stat.mtimeMs;analyticsCache.set(filename,state);return state.runs;
  } catch {return new Map();} finally {if(fd!==undefined)fs.closeSync(fd);}
}
function parseVacancies(files) {
  const runs=new Map();
  for(const filename of new Set(files))for(const [key,count] of vacancyRuns(filename))runs.set(key,count);
  return [...runs.values()].reduce((sum, count) => sum + count, 0);
}
function loadProjects(configPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const entries = Array.isArray(raw) ? raw : raw.projects;
    if (!Array.isArray(entries)) return [];
    const seen = new Set();
    return entries.filter(project => {
      if (!project || typeof project.id !== 'string' || !/^[a-z\d-]{1,60}$/i.test(project.id) || seen.has(project.id)) return false;
      if (typeof project.name !== 'string' || !/^[\p{L}\p{N} ._()—–-]{1,60}$/u.test(project.name)) return false;
      seen.add(project.id); return true;
    });
  } catch { return []; }
}
function projectStats(project) {
  const backlog = readText(project.backlog);
  const result = backlog === null ? Object.fromEntries(BACKLOG_KEYS.map(key => [key, null])) : parseBugs(backlog);
  // Legacy paths and typed log sources are read-only. An unavailable source
  // deliberately stays null, so absence cannot look like a successful zero.
  let legacyQueue = project.queue;
  try { if (typeof legacyQueue === 'string' && fs.statSync(legacyQueue).isDirectory()) legacyQueue = null; } catch { /* readText will retain missing-log semantics */ }
  const filenames = [project.pipeline, legacyQueue, ...(Array.isArray(project.queues) ? project.queues.map(queue => queue?.log) : [])].flatMap(source =>
    typeof source === 'string' ? [source] : source?.type === 'logs' && Array.isArray(source.files) ? source.files : []);
  const texts = [...new Set(filenames)].map(readText);
  const pipeline = texts.length && texts.every(text => text !== null) ? parsePipeline(texts.join('\n')) : null;
  for (const key of PIPELINE_KEYS) result[key] = pipeline ? pipeline[key] : null;
  if (project.vacancies) result.vacancies = parseVacancies(vacancyFiles(project.vacancies));
  return {id:project.id, name:project.name, ...result};
}
function collectProjectStats(configPath, stream = false) {
  const projects = loadProjects(configPath).filter(project => !stream || project.hideInStream !== true).map(projectStats);
  if (stream) for (const project of projects) delete project.vacancies;
  const totals = emptyMetrics();
  if (!stream && projects.some(project => 'vacancies' in project)) totals.vacancies = 0;
  for (const key of Object.keys(totals)) {
    if (key === 'vacancies') {
      totals[key] = projects.reduce((sum, project) => sum + (project.vacancies || 0), 0);
      continue;
    }
    totals[key] = projects.length && projects.every(project => typeof project[key] === 'number')
      ? projects.reduce((sum, project) => sum + project[key], 0) : null;
  }
  return {totals, projects};
}
const defaultProjectsPath = () => path.resolve(process.env.OFFICE_PROJECTS_CONFIG || 'config/office-projects.json');
module.exports = {REAL_KEYS, emptyMetrics, parseBugs, parsePipeline, parseVacancies, collectProjectStats, defaultProjectsPath};
