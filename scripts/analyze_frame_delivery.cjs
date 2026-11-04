#!/usr/bin/env node
// Offline analysis only. Native capture timestamps and Chrome use the macOS
// monotonic host clock. Counts describe WindowServer content, not photons.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const percentile=(a,q)=>a.length?[...a].sort((a,b)=>a-b)[Math.ceil(a.length*q)-1]:null;
const durations=(events,start,end,name)=>events.filter(e=>e.ph==='X'&&e.name===name&&e.ts<end&&e.ts+(e.dur||0)>start)
 .map(e=>({start:Math.max(start,e.ts),end:Math.min(end,e.ts+e.dur)}));
const stats=spans=>{const a=spans.map(e=>(e.end-e.start)/1000);return {count:a.length,totalMs:a.reduce((s,x)=>s+x,0),p95Ms:percentile(a,.95),maxMs:a.length?Math.max(...a):null}};
function analyzeCapture(capture,start,end){
 assert(capture.complete&&!capture.error,'Incomplete native capture');assert(end>start);
 const rows=capture.frames.filter(f=>f.status===0&&Number.isFinite(f.displayHostUs)&&f.displayHostUs>=start&&f.displayHostUs<end);
 assert(rows.length>5,'Native capture and Chrome trace clocks do not overlap');
 const times=[...new Set(rows.filter(f=>f.pixelChanged).map(f=>f.displayHostUs))].sort((a,b)=>a-b);
 const gaps=times.slice(1).map((t,i)=>(t-times[i])/1000);
 const comparisons=rows.map(f=>f.comparisonMicros/1000);
 return {durationMs:(end-start)/1000,completeSamples:rows.length,completeSamplesPerSecond:rows.length*1e6/(end-start),
  changedSamples:times.length,changedSamplesPerSecond:times.length*1e6/(end-start),
  changedIntervalP95Ms:percentile(gaps,.95),changedIntervalMaxMs:gaps.length?Math.max(...gaps):null,
  changedGapsOver25Ms:gaps.filter(x=>x>25).length,
  comparisonTotalMs:comparisons.reduce((s,x)=>s+x,0),comparisonP95Ms:percentile(comparisons,.95),
  changedTimesUs:times.map(t=>t-start)};
}
function resolveCaptureFile(capture,captureRoot){
 const file=capture.file;
 assert(typeof file==='string'&&file.length,'Missing native capture path');
 if(!path.isAbsolute(file))return path.resolve(captureRoot,file);
 // Legacy standard-layout records contain the original machine's absolute
 // captures path. Always rebase it, even if that old copy still exists.
 const local=path.resolve(captureRoot,'captures',path.basename(file));
 if(path.basename(path.dirname(file))==='captures'||fs.existsSync(local))return local;
 return file; // Compatibility with legacy custom capture directories.
}
function analyzeRow(row,traceDir,captureRoot=path.dirname(path.resolve(traceDir))){
 const bytes=zlib.gunzipSync(fs.readFileSync(path.join(traceDir,row.traceFile)));
 assert.equal(sha(bytes),row.traceSHA256,'Wrong trace archive');
 const events=JSON.parse(bytes).traceEvents;
 const start=events.find(e=>e.name==='atlas-frames:start').ts,end=events.find(e=>e.name==='atlas-frames:end').ts;
 assert(Math.abs((end-start)/1000-row.durationMs)<.001);
 const waits=durations(events,start,end,'IOSurfaceImageBacking::WaitForCommandsToBeScheduled::Dawn');
 let native=null;
 if(row.windowCapture){const b=fs.readFileSync(resolveCaptureFile(row.windowCapture,captureRoot));assert.equal(sha(b),row.windowCapture.sha256,'Wrong native capture');native=analyzeCapture(JSON.parse(b),start,end)}
 const feedback=row.presentationTimesUs||[];
 const gaps=feedback.slice(1).map((t,i)=>({start:start+feedback[i],end:start+t})).filter(g=>g.end-g.start>25000);
 // Overlap shows association only: it does not identify GPU utilization or the
 // cause of a missed refresh. Other GPU threads may run concurrently.
 const longWaits=waits.filter(w=>w.end-w.start>=8000);
 return {scenario:row.scenario,variant:row.variant,repeat:row.repeat,windowHostUs:{start,end},chromePresentationFeedbackFps:row.presentedFps,native,
  traceFile:row.traceFile,traceSHA256:row.traceSHA256,capture:row.windowCapture,
  gpu:{dawnCommandSchedulingWait:stats(waits),swapBuffers:stats(durations(events,start,end,'SkiaOutputSurfaceImplOnGpu::SwapBuffers')),
   caBackpressure:stats(durations(events,start,end,'CALayerTreeCoordinator::ApplyBackpressure')),
   feedbackGapsOver25Ms:gaps.length,gapsOverlappingDawnWait8Ms:gaps.filter(g=>longWaits.some(w=>w.start<g.end&&w.end>g.start)).length},
  years:row.state.years,hostBefore:row.hostBefore,hostAfter:row.hostAfter};
}
function main(){
 const [file,traceDir,output]=process.argv.slice(2);assert(file&&traceDir&&output,'Usage: node --expose-gc scripts/analyze_frame_delivery.cjs measurements.json trace-dir output.json');
 const input=JSON.parse(fs.readFileSync(file));assert(input.complete);
 const rows=[];for(const row of input.rows||input.runs){rows.push(analyzeRow(row,traceDir,path.dirname(path.resolve(file))));if(global.gc)global.gc()}
 const result={complete:true,input:path.resolve(file),inputSHA256:sha(fs.readFileSync(file)),
  method:'Unchanged Chrome presentation-feedback count plus independent ScreenCaptureKit exact map-ROI pixel changes, inside the same monotonic-clock window. Native sample delivery can coalesce frames and identical content can be intentional; changed-sample frequency is a conservative observation of visible content changes, not a physical display FPS measurement. The first changed sample has one-sample boundary uncertainty. GPU event durations are clipped to the window; different named/nested events must not be summed. Scheduling waits and interval overlaps show association, not hardware saturation or causality.',rows};
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(rows.map(r=>({scenario:r.scenario,variant:r.variant,repeat:r.repeat,chrome:r.chromePresentationFeedbackFps,native:r.native?.changedSamplesPerSecond,waitMs:r.gpu.dawnCommandSchedulingWait.totalMs}))));
}
module.exports={analyzeCapture,analyzeRow,resolveCaptureFile};if(require.main===module)main();
