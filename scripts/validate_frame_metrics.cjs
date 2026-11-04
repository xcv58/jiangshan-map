#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {analyze}=require('./benchmark_frames.cjs');
const events=[
  {name:'atlas-frames:start',pid:42,ts:0},
  {name:'atlas-frames:end',pid:42,ts:100000},
];
function report(id,sequence,state,end,pid=42){
  events.push({name:'PipelineReporter',pid,ts:end-4000,ph:'b',id2:{local:id},args:{frame_reporter:{frame_source:1,frame_sequence:sequence,state}}},
    {name:'PipelineReporter',pid,ts:end,ph:'e',id2:{local:id}});
}
for(let i=0;i<6;i++){
  const ts=10000+i*16667;
  report('frame'+i,i,'STATE_PRESENTED_ALL',ts);
  events.push({name:'Display::FrameDisplayed',pid:99,ts});
}
// A fork and a nearly simultaneous surface update must not inflate FPS.
report('fork',1,'STATE_PRESENTED_PARTIAL',26668);
events.push({name:'Display::FrameDisplayed',pid:99,ts:26668});
// Browser chrome/another renderer must not contribute page frames.
report('unrelated',999,'STATE_PRESENTED_ALL',20000,77);
events.push({name:'Display::FrameDisplayed',pid:99,ts:20000});
report('dropped',7,'STATE_DROPPED',80000);
report('idle',8,'STATE_NO_UPDATE_DESIRED',90000);
events.reverse(); // Trace chunks are not guaranteed to arrive in timestamp order.
const result=analyze(events);
assert.equal(result.presentedFrames,6);
assert.equal(result.presentedFps,60);
assert.equal(result.uniqueFeedbackTimestamps,7);
assert.equal(result.osFeedbackMatches,7);
assert(Math.abs(result.frameIntervalP95Ms-16.667)<1e-9);
assert(Math.abs(result.droppedPct-100/7)<1e-9);
assert.equal(result.states.STATE_NO_UPDATE_DESIRED,1);
assert.throws(()=>analyze(events.filter(e=>e.name!=='Display::FrameDisplayed')),/No real display/);
assert.throws(()=>analyze(events.filter(e=>e.name!=='atlas-frames:end')),/Missing measurement marks/);
const unmatched=events.map(e=>e.name==='Display::FrameDisplayed'?{...e,ts:e.ts+500}:e);
assert.throws(()=>analyze(unmatched),/do not match Chrome display/);
console.log('PASS: presentation feedback, renderer isolation, fork/surface deduplication, cadence, and fail-closed trace parsing.');
