import test from 'node:test';
import assert from 'node:assert/strict';
import { SCOREBOARD_RECT, TROPHY_RECT, BUG_HUNTER_TOOLTIP } from '../src/components/office/officeScoreboard';
import type { Rect } from '../src/components/office/officeAnnotations';
const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

test('LED and cup fit the free brick strip above the board without touching painted fixtures',()=>{
  // Background rendered_rect starts at y=32. Board top is y=70,
  // the electrical cabinet ends at x=222, and the window starts at x=373.
  const fixtures=[{x:225,y:70,width:132,height:92},{x:373,y:32,width:249,height:177},{x:96,y:56,width:126,height:169},{x:643,y:76,width:84,height:202}];
  for(const object of [SCOREBOARD_RECT,TROPHY_RECT]){
    assert.ok(object.x>=222&&object.x+object.width<373);
    assert.ok(object.y>=32&&object.y+object.height<=70);
    for(const fixture of fixtures)assert.ok(!overlaps(object,fixture));
  }
  assert.ok(!overlaps(SCOREBOARD_RECT,TROPHY_RECT));
  assert.equal(BUG_HUNTER_TOOLTIP,'Охотница за багами · найдено в JH: вагон 🚃');
});
