import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceSanyaAlert, sanyaBugTooltip, sanyaVictoryToast, BUG_ALERT_SECONDS, SANYA_VICTORY_SECONDS, type SanyaAlert } from '../src/components/office/sanyaLife';
import { registerTap } from '../src/components/office/officeMoments';
import { publicDcm, type OfficeDcmSignal } from '../src/lib/officeDcm';

const wallNow = Date.parse('2026-11-01T18:00:00Z');
const signal = (status: 'pass' | 'fail' | 'unknown', timestamp='2026-11-01T17:59:00Z'): OfficeDcmSignal => publicDcm({bugCount:18,bugTitle:'🐞 B1: Окно молчит',regression:{status,timestamp}},wallNow);

test('fresh failed regression gets one ten-second alert and repeated polling cannot extend it', () => {
  const state: SanyaAlert={seen:null,until:0};
  assert.equal(BUG_ALERT_SECONDS,10);
  assert.equal(advanceSanyaAlert(state,signal('fail'),100),true);
  assert.equal(state.until,110);
  assert.equal(advanceSanyaAlert(state,signal('fail'),109.99),true);
  assert.equal(state.until,110);
  assert.equal(advanceSanyaAlert(state,signal('fail'),110),false);
  assert.equal(advanceSanyaAlert(state,signal('fail'),160),false);
  assert.equal(advanceSanyaAlert(state,signal('fail','2026-11-01T18:00:00Z'),161),true);
  assert.equal(state.until,171);
  assert.equal(advanceSanyaAlert(state,signal('pass','2026-11-01T18:00:01Z'),162),false);
});

test('missing, stale, future and passed regressions never start a bubble', () => {
  for (const value of [null,signal('unknown'),signal('pass'),signal('fail','2026-11-01T17:29:59Z'),signal('fail','2026-11-01T18:00:01Z')]) {
    const state:SanyaAlert={seen:null,until:0};
    assert.equal(advanceSanyaAlert(state,value,10),false);
    assert.equal(advanceSanyaAlert(state,value,100),false);
    assert.equal(state.until,0);
  }
});

test('victory distinguishes known outcomes, and jar uses genuine count and title with graceful unknown', () => {
  assert.equal(SANYA_VICTORY_SECONDS,3);
  assert.equal(sanyaVictoryToast(signal('pass')),'Все тесты зелёные! ✅');
  assert.equal(sanyaVictoryToast(signal('fail')),'Нашёл! 🐞 Регрессия красная');
  assert.equal(sanyaVictoryToast(null),'Результат регрессии пока неизвестен');
  assert.equal(sanyaVictoryToast(signal('unknown')),'Результат регрессии пока неизвестен');
  assert.equal(sanyaBugTooltip(signal('pass')),'Поймано багов: 18\n🐞 B1: Окно молчит');
  assert.equal(sanyaBugTooltip({...signal('pass'),bugCount:0,bugTitle:null}),'Поймано багов: 0');
  assert.equal(sanyaBugTooltip(null),'Баги пока не посчитаны');
});

test('five taps must fit a three-second window and consume the gesture exactly once', () => {
  const taps:number[]=[];
  for(const time of [0,750,1500,2250]) assert.equal(registerTap(taps,time),false);
  assert.equal(registerTap(taps,3000),true,'exact three-second boundary is included');
  assert.deepEqual(taps,[]);
  assert.equal(registerTap(taps,3001),false,'sixth tap starts a new gesture');
  const slow:number[]=[];
  for(const time of [0,1000,2000,3000,4000]) assert.equal(registerTap(slow,time),false);
  assert.deepEqual(slow,[1000,2000,3000,4000]);
  const future=[10000];
  assert.equal(registerTap(future,10),false);
  assert.deepEqual(future,[10],'clock rollback removes future samples');
});
