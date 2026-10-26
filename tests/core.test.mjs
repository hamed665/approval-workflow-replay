import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sample=JSON.parse(readFileSync(new URL('../examples/input.json',import.meta.url)));

import {replay,analyze} from '../src/core.mjs';
test('valid flow completes after approval',()=>assert.deepEqual(replay(sample.steps,sample.events).states,{prepare:'completed',review:'approved',release:'completed'}));
test('cannot skip approval dependency',()=>assert.equal(analyze(sample).audit[1].reason,'STEP_NOT_READY'));
test('reviewer mismatch rejected',()=>assert.equal(analyze(sample).audit[2].reason,'REVIEWER_MISMATCH'));
test('reject blocks descendants',()=>{
  const events=[sample.events[0],{id:'reject',actor:'maintainer',step:'review',action:'reject'}];
  assert.equal(replay(sample.steps,events).states.release,'blocked');
});
test('cycle is rejected',()=>assert.throws(()=>replay([{id:'a',kind:'task',needs:['b']},{id:'b',kind:'task',needs:['a']}],[]),/cycle/));
test('unknown dependency rejected',()=>assert.throws(()=>replay([{id:'a',kind:'task',needs:['missing']}],[]),/unknown/));
test('event replay is idempotent',()=>assert.equal(replay(sample.steps,[sample.events[0],sample.events[0]]).audit.length,1));
test('changed event ID fails',()=>assert.throws(()=>replay(sample.steps,[sample.events[0],{...sample.events[0],actor:'different'}]),/mismatch/));
