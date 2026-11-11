import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceHeroMotion, walkFrameIndex, heroBreathing, stationaryMotion, createIdleEvent, sampleIdleEvent, WEIGHT_SHIFT, CAT_EAR_TWITCH } from '../src/components/office/heroMotion';

test('individual breathing uses 40% inhale / 60% exhale and the specified human/cat ranges', () => {
  const names = ['ярик','леха','ася','иваныч','тая','саня','whoami','евгений','марина','коржик','масяня'];
  const profiles = names.map(heroBreathing);
  assert.equal(new Set(profiles.map(p => `${p.period}:${p.phase}`)).size, names.length);
  for (const [index,profile] of profiles.entries()) {
    const cat = index >= names.length - 2;
    assert.ok(profile.period >= (cat ? 2.2 : 3.2) && profile.period <= (cat ? 3 : 4.2));
    assert.ok(profile.amplitude >= (cat ? .03 : .025) && profile.amplitude <= (cat ? .04 : .035));
    const start = (1-profile.phase)*profile.period;
    assert.equal(stationaryMotion(start,profile).scaleY,1);
    assert.ok(Math.abs(stationaryMotion(start+.4*profile.period,profile).scaleY-1-profile.amplitude)<1e-12);
    assert.equal(stationaryMotion(start+profile.period,profile).scaleY,1);
    const samples = Array.from({length:601}, (_,i) => stationaryMotion(i/60,profile));
    assert.ok(Math.max(...samples.map(s=>s.scaleY))-Math.min(...samples.map(s=>s.scaleY)) > profile.amplitude*.99);
    for (const [i,s] of samples.entries()) {
      assert.ok(s.scaleY >= 1 && s.scaleY <= 1+profile.amplitude);
      assert.equal(s.x,0); assert.equal(s.rotation,0);
      if (i) assert.ok(Math.abs(s.scaleY-samples[i-1].scaleY)<profile.amplitude*Math.PI/2/(.4*profile.period*60)+1e-12, 'smooth asymmetric breath, no jitter');
      const reduced = stationaryMotion(i/60,profile,true);
      assert.equal(reduced.x,0); assert.equal(reduced.rotation,0); assert.equal(reduced.scaleY,s.scaleY);
    }
  }
});

test('weight shifts are independent 5–12s events with .8s easing, a 2–4s hold and a smooth return', () => {
  const starts = new Set<number>();
  for (const name of ['ярик','леха','ася','иваныч','тая','саня']) {
    const event = createIdleEvent(name);
    starts.add(event.start);
    let previous = 0;
    for (let i=0;i<50;i++) {
      const {start,hold,amount}=event;
      assert.ok(start-previous>=5 && start-previous<=12);
      assert.ok(hold>=2 && hold<=4);
      assert.ok(Math.abs(amount)>=.03 && Math.abs(amount)<=.05);
      assert.equal(sampleIdleEvent(start-.001,event),0);
      assert.equal(sampleIdleEvent(start,event),0);
      assert.ok(Math.abs(sampleIdleEvent(start+.4,event)-amount/2)<1e-12);
      assert.equal(sampleIdleEvent(start+.8+hold/2,event),amount);
      assert.ok(Math.abs(sampleIdleEvent(start+1.2+hold,event)-amount/2)<1e-12);
      assert.ok(Math.abs(sampleIdleEvent(start+1.6+hold-.0001,event))<1e-8);
      assert.equal(sampleIdleEvent(start+1.6+hold,event),0);
      previous=start;
    }
  }
  assert.equal(starts.size,6);
  assert.equal(WEIGHT_SHIFT.ease,.8);
});

test('cat ear twitches have independent 6–15s deadlines, visible local angles and last under two seconds', () => {
  const events = ['коржик','масяня'].map(n=>createIdleEvent(n,CAT_EAR_TWITCH));
  assert.notEqual(events[0].start,events[1].start);
  for(const event of events) {
    let previous=0;
    for(let i=0;i<30;i++) {
      const {start,hold,amount}=event;
      assert.ok(start-previous>=6 && start-previous<=15);
      assert.ok(Math.abs(amount)>=.10 && Math.abs(amount)<=.15);
      assert.ok(hold+event.options.ease*2<2);
      assert.equal(sampleIdleEvent(start-.01,event),0);
      assert.notEqual(sampleIdleEvent(start+.6,event),0);
      sampleIdleEvent(start+hold+1.2,event);
      previous=start;
    }
  }
});

test('direction remains latched for every step and through vertical path jitter', () => {
  for (const facing of [-1, 1] as const) {
    const motion = { facing, distance: 0 };
    for (let i = 0; i < 200; i++) {
      advanceHeroMotion(motion, facing * 3, Math.sin(i));
      assert.equal(motion.facing, facing);
    }
    for (let i = 0; i < 200; i++) {
      advanceHeroMotion(motion, i % 2 ? .1 : -.1, 3);
      assert.equal(motion.facing, facing, 'vertical jitter must not turn the hero or cat');
    }
    advanceHeroMotion(motion, facing * -3, 1);
    assert.equal(motion.facing, -facing);
  }
});

test('walk phases follow travelled distance in order, pause at rest and ignore time', () => {
  const motion = { facing: 1 as const, distance: 0 };
  const phases = [walkFrameIndex(motion.distance, 4)];
  for (let i = 0; i < 8; i++) {
    advanceHeroMotion(motion, 7.5, 0);
    phases.push(walkFrameIndex(motion.distance, 4));
  }
  assert.deepEqual(phases, [0,1,2,3,0,1,2,3,0]);
  advanceHeroMotion(motion, 0, 0);
  assert.equal(motion.distance, 60);
  assert.equal(walkFrameIndex(100, 1), 0);
});
