#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {analyzeCapture}=require('./analyze_frame_delivery.cjs');
// Known content changes, duplicate timestamps, a still frame and samples outside
// the window verify that delivery callbacks are not mistaken for visible FPS.
const frames=Array.from({length:12},(_,i)=>({status:0,displayHostUs:100000+i*10000,pixelChanged:i%2===0,comparisonMicros:100}));
frames.push({...frames[2]}, {status:1,displayHostUs:125000,pixelChanged:true});
const result=analyzeCapture({complete:true,frames},110000,200000);
assert.equal(result.completeSamples,10);assert.equal(result.changedSamples,4);
assert.equal(result.changedSamplesPerSecond,4/.09);assert.equal(result.changedIntervalP95Ms,20);
assert.deepEqual(result.changedTimesUs,[10000,30000,50000,70000]);
assert.throws(()=>analyzeCapture({complete:false,frames},110000,200000),/Incomplete/);
assert.throws(()=>analyzeCapture({complete:true,frames},1e9,1e9+1e6),/clocks/);
console.log('PASS: independent capture windowing, status filtering, deduplication, still frames and clock/incomplete rejection.');
