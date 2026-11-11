import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeskLife, advanceDeskLife, nextOfficeWalk } from '../src/components/office/deskLife';

test('idle gestures are staggered, brief, never repeated, and cancelled by work',()=>{
  const life=createDeskLife(()=>0);
  assert.equal(life.next,20);
  assert.equal(createDeskLife(()=>1).next,60);
  assert.equal(advanceDeskLife(life,19,true,()=>0),undefined);
  assert.equal(advanceDeskLife(life,20,true,()=>0),'stretch');
  assert.equal(advanceDeskLife(life,23,true,()=>0),undefined);
  assert.equal(advanceDeskLife(life,40,true,()=>0),'cup');
  assert.equal(advanceDeskLife(life,41,false,()=>0),undefined);
  assert.equal(life.action,undefined);
  assert.equal(life.next,61);
  assert.equal(nextOfficeWalk(()=>0),180);
  assert.equal(nextOfficeWalk(()=>1),480);
});
