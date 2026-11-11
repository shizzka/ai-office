import test from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_CONTENT, WORK_CONTENT, MONITOR_COPY, idleMonitorPeriod, monitorKind, monitorFrameKey, monitorCommands, type MonitorKind } from '../src/components/office/monitorContent';

const working={present:true,working:true},idle={present:true,working:false};
const expected:Record<string,MonitorKind[]>={ярик:['kanban'],леха:['code'],ася:['diff'],тая:['canvas'],иваныч:['draft'],whoami:['terminal','terminal','terminal'],марина:['checklist'],евгений:['panel','estimate','jh-mini']};

test('working displays have explicit role content, including three different Evgeniy displays',()=>{
  assert.deepEqual(WORK_CONTENT,expected);
  for(const [name,kinds] of Object.entries(expected)) kinds.forEach((kind,index)=>assert.equal(monitorKind(name,index,working,81,false),kind));
  assert.equal(monitorKind('Лёха',0,working,0,false),'code');
});

test('each owner has three distinct idle eggs, changing on an owner period of 30–90 seconds',()=>{
  assert.deepEqual(Object.keys(IDLE_CONTENT).sort(),Object.keys(expected).sort());
  for(const name of Object.keys(expected)) {
    const period=idleMonitorPeriod(name);
    assert.ok(period>=30&&period<=90,name);
    const kinds=[0,1,2].map(i=>monitorKind(name,0,idle,i*period+.001,false));
    assert.equal(new Set(kinds).size,3,name);
    assert.deepEqual(kinds,IDLE_CONTENT[name]);
    assert.equal(monitorKind(name,0,idle,period-.001,false),kinds[0]);
    assert.equal(monitorKind(name,0,idle,3*period+.001,false),kinds[0]);
  }
});

test('presence takes priority; absent screens save by day and turn off at night',()=>{
  for(const name of Object.keys(expected)) for(const night of [false,true]) {
    assert.equal(monitorKind(name,0,undefined,70,night),night?'off':'screensaver');
    assert.equal(monitorKind(name,0,{present:false,working:true},70,night),night?'off':'screensaver');
    assert.equal(monitorKind(name,0,working,70,night),expected[name][0]);
    assert.notEqual(monitorKind(name,0,idle,70,night),'off');
  }
  assert.notDeepEqual(monitorCommands('weather',1,false),monitorCommands('weather',1,true));
});

test('every generated text frame is synthetic and cannot accept live task, feed, path or IP fields',()=>{
  const poisoned={present:true,working:true,task:'PRIVATE_TASK_SENTINEL_482',path:'/srv/private/customer-secret',ip:'203.0.113.71',feed:'FEED_SENTINEL_946',agent:{name:'AGENT_SENTINEL_731'}};
  // Extra runtime fields mimic a caller passing an Agent; only two booleans cross the boundary.
  assert.equal(monitorKind('whoami',0,poisoned,1,false),'terminal');
  const forbidden=/PRIVATE_TASK_SENTINEL_482|customer-secret|203\.0\.113\.71|FEED_SENTINEL_946|AGENT_SENTINEL_731|(?:\d{1,3}\.){3}\d{1,3}|(?:\/home\/|\/srv\/|[A-Z]:\\)|https?:\/\/|(?:task|feed|agent)[_-](?:id|text|name)/i;
  const kinds=Object.keys(MONITOR_COPY) as MonitorKind[];
  for(const kind of kinds) for(let frame=0;frame<32;frame++) for(const night of [false,true]) {
    const commands=monitorCommands(kind,frame,night);
    const text=commands.filter(c=>c.op==='text').map(c=>c.text).join('\n');
    assert.doesNotMatch(text,forbidden,`${kind} frame ${frame}`);
    assert.deepEqual(commands,monitorCommands(kind,frame,night),'display generation has no live-state dependency');
  }
  assert.match(monitorCommands('terminal',31).filter(c=>c.op==='text').map(c=>c.text).join(' '),/localhost/);
});

test('display lists differ by role and animated frames change actual drawing commands',()=>{
  const kinds=Object.keys(MONITOR_COPY) as MonitorKind[];
  const signatures=kinds.map(kind=>JSON.stringify(monitorCommands(kind,0)));
  assert.equal(new Set(signatures).size,kinds.length);
  for(const kind of kinds) {
    const commands=monitorCommands(kind,0);
    assert.ok(commands.length>1,kind);
    assert.ok(commands.some(c=>c.op==='rect'&&c.w>0&&c.h>0),kind);
    if(!['off','machine','bug-search','socket-estimate','moodboard','duck'].includes(kind)) {
      assert.ok(Array.from({length:31},(_,i)=>JSON.stringify(monitorCommands(kind,i+1))).some(frame=>frame!==JSON.stringify(commands)),`${kind} should animate its actual display list`);
    }
  }
});

test('reduced motion fixes animation keys; normal keys advance at eight frames per second',()=>{
  for(const kind of Object.keys(MONITOR_COPY) as MonitorKind[]) {
    assert.equal(monitorFrameKey(kind,0,true,false),monitorFrameKey(kind,99,true,false));
  }
  assert.equal(monitorFrameKey('code',0,false,false),monitorFrameKey('code',.124,false,false));
  assert.notEqual(monitorFrameKey('code',0,false,false),monitorFrameKey('code',.125,false,false));
});
