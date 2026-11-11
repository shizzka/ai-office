/** The only writer of office scene counters. Browser/demo messages never enter this engine. */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {collectProjectStats, defaultProjectsPath} = require('./office-stats');

const EVENT_COUNTERS = Object.freeze({
  pot:'potsBroken', 'pot-desk':'potsBroken', pizza:'pizzas', short:'shortCircuits',
  breaker:'breakerChecks', standup:'standups', 'cat-chase':'catChases',
  'cat-keyboard':'keyboards', 'cat-laser':'laserGames', night:'officeNights',
  mattress:'mattressNights', rush:'urgentArrivals', blackout:'blackouts', 'cat-hero':'laserGames',
});
const COUNTER_KEYS = [...new Set(Object.values(EVENT_COUNTERS))];
const RANDOM_EVENTS = ['breaker','standup','pizza','rounds','short','review','pot','pot-desk','cat-laser','cat-hero','cat-chase','cat-keyboard','cat-wash','cat-stretch','cat-belly','cat-window','cat-visit','blackout'];
const EVENT_DURATIONS = {breaker:60_000, standup:90_000, pizza:300_000, rounds:120_000, short:75_000, review:60_000, pot:60_000, 'pot-desk':60_000, 'cat-laser':40_000,'cat-hero':45_000,'cat-chase':40_000,'cat-keyboard':30_000,'cat-wash':22_000,'cat-stretch':12_000,'cat-belly':22_000,'cat-window':42_000,'cat-visit':45_000,night:30_000,mattress:40_000,rush:24_000,evening:35_000,blackout:60_000};
// Preserve the regular office's sparse owner scenes; viewer count and stream mode cannot speed them up.
const INTERVALS = {breaker:[60,120],rounds:[40,90],short:[60,180],review:[60,120],pot:[20,40],'pot-desk':[30,60],'cat-laser':[5,10],'cat-hero':[10,25],'cat-chase':[2,4],'cat-keyboard':[4,8],'cat-wash':[3,6],'cat-stretch':[3,6],'cat-belly':[3,6],'cat-window':[3,6],'cat-visit':[4,8]};
const normalize = name => name.trim().toLowerCase().replace(/ё/g,'е');
const resident = name => ['евгений','леха','мотя','jh','коржик','масяня'].includes(normalize(name));
const working = status => ['working','thinking','busy'].includes(status);
function onShift(name, hour) {
  if (resident(name)) return true;
  name=normalize(name);
  return name==='whoami' ? hour>=12||hour<2 : hour>=9&&hour<(name==='иваныч'?18:19);
}
function departureDelay(name) {
  let seed=0; for(const c of normalize(name)) seed=(Math.imul(seed,31)+c.charCodeAt(0))>>>0;
  return (2+seed%781/60)*60_000;
}
function officeClock(now) {
  const date=new Date(now+3*60*60_000);
  return {hour:date.getUTCHours()+date.getUTCMinutes()/60, day:date.toISOString().slice(0,10)};
}
function openOfficeDatabase(filename) {
  fs.mkdirSync(path.dirname(filename), {recursive:true});
  const db=new Database(filename);
  db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000');
  db.exec(`CREATE TABLE IF NOT EXISTS office_scene_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS office_scene_completions (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, completed_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS office_counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);`);
  return db;
}
function readCounters(db) {
  const result=Object.fromEntries(COUNTER_KEYS.map(key=>[key,0]));
  try { for(const row of db.prepare('SELECT key,value FROM office_counters').all()) if(row.key in result) result[row.key]=row.value; } catch { /* worker initializes lazily */ }
  return result;
}
function readSince(db, fallback) {
  try { return JSON.parse(db.prepare("SELECT value FROM office_scene_state WHERE key='since'").get()?.value || 'null') || fallback; } catch { return fallback; }
}
function getOfficeStats({databasePath,configPath=defaultProjectsPath(),stream=false,now=Date.now()}) {
  let counters=Object.fromEntries(COUNTER_KEYS.map(key=>[key,0])), since=new Date(now).toISOString();
  let db;
  try { db=new Database(databasePath,{readonly:true}); counters=readCounters(db); since=readSince(db,since); } catch { /* no scenes yet */ } finally { db?.close(); }
  return {since,updatedAt:now,counters,...collectProjectStats(configPath,stream)};
}
function createOfficeEngine(options) {
  const db=openOfficeDatabase(options.databasePath), clock=options.clock || Date.now, random=options.random || Math.random;
  const read=(key,fallback)=>{try{return JSON.parse(db.prepare('SELECT value FROM office_scene_state WHERE key=?').get(key)?.value || 'null') ?? fallback;}catch{return fallback;}};
  const write=(key,value)=>db.prepare('INSERT INTO office_scene_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
  const since=read('since',new Date(clock()).toISOString()); write('since',since);
  let scene=read('scene',null), nextAt=read('nextAt',clock()), attendanceRecords=read('attendance',{}), daily=read('daily',{});
  let pending=read('pending',[]), attendance={hour:officeClock(clock()).hour,actors:[],ownerNight:'awake'};
  const interval=(eventId)=>{const [min,max]=INTERVALS[eventId];return (min+random()*(max-min))*60_000;};
  const due=read('due',Object.fromEntries(Object.keys(INTERVALS).map(eventId=>[eventId,clock()+interval(eventId)])));
  let lastRegression=read('lastRegression',undefined),lastPizza=read('lastPizza',0);
  let projectsAt=-Infinity, projectCache={};
  const gap=options.gapMs ?? 90_000;
  const gapDuration=()=>typeof gap==='function'?gap():gap;
  function actors() {
    if (options.actors) return options.actors();
    try { return db.prepare('SELECT name,current_status AS status FROM agents WHERE archived=0 ORDER BY name').all(); } catch { return []; }
  }
  function red() {
    try {
      const raw=JSON.parse(db.prepare("SELECT value FROM office_bridge_state WHERE key='office17:public'").get()?.value || '{}');
      return raw.regression?.status==='fail';
    } catch {return false;}
  }
  function updateSchedule(now) {
    if(options.events)return;
    const {hour,day}=officeClock(now);
    if(hour>=10&&hour<10+1/60)queueOnce('standup',`${day}:standup`);
    for(const [eventId,at] of Object.entries(due))if(now>=at){if(!pending.includes(eventId))pending.push(eventId);due[eventId]=now+interval(eventId);}
    let regression=null;
    try {regression=JSON.parse(db.prepare("SELECT value FROM office_bridge_state WHERE key='office17:public'").get()?.value || '{}').regression || null;}catch{}
    const id=regression?.recordId || regression?.timestamp || null;
    if(lastRegression!==undefined&&id&&id!==lastRegression&&regression?.status==='pass'&&regression.fresh&&regression.green&&regression.new&&now-lastPizza>=3*3600_000){pending.push('pizza');lastPizza=now;write('lastPizza',lastPizza);}
    if(regression){lastRegression=id;write('lastRegression',id);}
    write('due',due);write('pending',pending);
  }
  function queueOnce(eventId,key) {
    if(daily[key])return; daily[key]=true; pending.push(eventId);
  }
  function updateAttendance(now) {
    const {hour,day}=officeClock(now), cast=actors();
    for(const actor of cast) {
      const name=normalize(actor.name), active=working(actor.status), old=attendanceRecords[name];
      const record=old || {name:actor.name,status:actor.status,idleSince:now,departureAt:null,home:false};
      if(record.status!==actor.status){record.status=actor.status;record.idleSince=now;record.departureAt=null;}
      if(active || onShift(name,hour)) {
        if(record.home && active) pending.push({eventId:'rush',actorName:actor.name});
        record.home=false; record.departureAt=null;
        if(active)record.idleSince=now;
      } else if(!resident(name)) {
        if(record.departureAt===null)record.departureAt=Math.max(now,record.idleSince+600_000)+departureDelay(name);
        if(now>=record.departureAt)queueOnce('evening',`${day}:evening`);
        record.home=now>=record.departureAt+15_000;
      }
      attendanceRecords[name]=record;
    }
    const names=new Set(cast.map(actor=>normalize(actor.name)));
    for(const [name,record] of Object.entries(attendanceRecords))if(!names.has(name))record.home=true;
    const present=Object.entries(attendanceRecords).filter(([name])=>names.has(name)).map(([,record])=>({...record}));
    const owner=present.find(actor=>normalize(actor.name)==='евгений');
    const night=(hour>=23||hour<7)&&!working(owner?.status)&&!red();
    const privateRoom=!present.some(actor=>!actor.home&&!resident(actor.name));
    const ownerNight=!night?'awake':privateRoom?'mattress':'chair';
    // A night spanning midnight is one occurrence, even after process restart.
    const nightDay=hour<7?officeClock(now-24*60*60_000).day:day;
    if(owner&&night)queueOnce('night',`${nightDay}:night`);
    if(owner&&night&&privateRoom)queueOnce('mattress',`${nightDay}:mattress`);
    attendance={hour,actors:present,ownerNight};
    // Bound day-key history while retaining restart-safe current-night idempotency.
    daily=Object.fromEntries(Object.entries(daily).filter(([key])=>key.slice(0,10)>=officeClock(now-3*24*60*60_000).day));
    write('attendance',attendanceRecords);write('daily',daily);write('pending',pending);
  }
  function stats(stream=false) {
    const now=clock(), cacheKey=stream?'stream':'normal';
    if(now-projectsAt>5000){projectCache={};projectsAt=now;}
    projectCache[cacheKey] ||= collectProjectStats(options.configPath || defaultProjectsPath(),stream);
    return {since,updatedAt:now,counters:readCounters(db),...projectCache[cacheKey]};
  }
  function snapshot(stream=false) {return {type:'office:state',serverNow:clock(),scene,attendance,stats:stats(stream)};}
  const complete=db.transaction((ended,now)=>{
    const inserted=db.prepare('INSERT OR IGNORE INTO office_scene_completions(id,event_id,completed_at) VALUES(?,?,?)').run(ended.id,ended.eventId,now).changes;
    const counter=EVENT_COUNTERS[ended.eventId];
    const counters=counter?[counter]:[];
    if(['breaker','short'].includes(ended.eventId))counters.push('blackouts');
    if(inserted)for(const key of counters)db.prepare('INSERT INTO office_counters(key,value) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET value=value+1').run(key);
    write('scene',null);write('nextAt',now+gapDuration());
  });
  function startScene(eventId,{demo=false,actorName}={}) {
    if(demo || scene || !(eventId in EVENT_DURATIONS))return null;
    const now=clock();
    scene={id:crypto.randomUUID(),eventId,seed:Math.floor(random()*0x100000000)>>>0,startedAt:now,endsAt:now+(options.sceneDurationMs ?? EVENT_DURATIONS[eventId]),actors:actors(),red:red(),attendance:JSON.parse(JSON.stringify(attendance)),...(actorName?{actorName}:{})};
    write('scene',scene);return scene;
  }
  function tick() {
    const now=clock(); updateAttendance(now);if(options.schedule!==false)updateSchedule(now);
    if(scene && now>=scene.endsAt){complete(scene,now);scene=null;nextAt=read('nextAt',now+gapDuration());}
    if(!scene && now>=nextAt && options.schedule!==false) {
      const events=options.events;
      const eventId=pending.shift() || (events?.length ? events[Math.floor(random()*events.length)] : null);write('pending',pending);
      if(eventId)typeof eventId==='string'?startScene(eventId):startScene(eventId.eventId,{actorName:eventId.actorName});
    }
    return snapshot();
  }
  updateAttendance(clock());
  return {tick,snapshot,stats,startScene,close:()=>db.close()};
}
module.exports={EVENT_COUNTERS,COUNTER_KEYS,RANDOM_EVENTS,EVENT_DURATIONS,createOfficeEngine,getOfficeStats,officeClock,onShift,departureDelay};
