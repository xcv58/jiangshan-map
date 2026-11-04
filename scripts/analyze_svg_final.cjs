#!/usr/bin/env node
// Offline evidence assembly; never run alongside timed browser workloads.
'use strict';
const fs=require('node:fs'),path=require('node:path'),z=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{analyze}=require('./benchmark_frames.cjs'),{analyzeRow}=require('./analyze_frame_delivery.cjs');
const [review,out]=process.argv.slice(2);assert(review&&out,'Usage: node --expose-gc scripts/analyze_svg_final.cjs REVIEW OUTPUT');fs.mkdirSync(out,{recursive:true});
const root=path.resolve(__dirname,'..'),base=process.env.WEB_BASE_REF||'d54411d',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{cwd:root,maxBuffer:16*1024*1024}),read=f=>JSON.parse(fs.readFileSync(f));
const write=(n,v)=>{const bytes=Buffer.from(JSON.stringify(v,null,2)+'\n'),compressed=n!=='summary.json';fs.writeFileSync(path.join(out,'svg-final-'+n+(compressed?'.gz':'')),compressed?z.gzipSync(bytes,{level:9}):bytes)};
const archive=(file,name)=>fs.writeFileSync(path.join(out,'svg-final-'+name+'.gz'),z.gzipSync(fs.readFileSync(file),{level:9}));
const stats=a=>{assert(a.length);const s=[...a].sort((a,b)=>a-b),i=Math.floor(s.length/2);return {count:s.length,median:s.length%2?s[i]:(s[i-1]+s[i])/2,min:s[0],max:s.at(-1)}};
const parser=s=>s.slice(s.indexOf('function analyze(events){'),s.indexOf('\nasync function stopTrace('));
// Fixed fingerprints retain the measured implementation's integrity without
// requiring any commit from the earlier experimental branches.
assert.equal(sha(parser(fs.readFileSync('scripts/benchmark_frames.cjs','utf8'))),'f87076d0c643dccd7f1ab5831fa5b26e30e15b24073b68b40347d228a41dea43','FPS parser changed');
const referenceFiles={
 'scripts/capture_window_frames.swift':'ad647a1a7a77f483cecfa128fd0e2a3a4905c2449903923207cfbd6a1f60dd68',
 'scripts/analyze_frame_delivery.cjs':'5f4c4ac53ebcd1cd72267c9b8d74216071231ad4b73032324968c489d6cba9aa',
 'js/app.js':'c41b76fb8bc8d616187de7c537fe953fd4cd09812640bb0c7efce4e3e087c2cf',
 'css/style.css':'eed7e3eb7d52e6254ed84421b0a0e21bb850151287c3dca4d9e26bb90f9ca51e',
};
for(const [f,digest]of Object.entries(referenceFiles))assert.equal(sha(fs.readFileSync(f)),digest,'Selected implementation changed: '+f);
const verifiedScripts=new Set();
function verifyRecordedScript(file,digest){
 // Match exact historical contents in this branch. Patch application can
 // change commit IDs while preserving those contents and recorded results.
 const key=file+':'+digest;if(verifiedScripts.has(key))return;
 const matches=ref=>sha(git('show',ref+':'+file))===digest;
 const revisions=()=>git('log','--format=%H','HEAD','--',file).toString().trim().split('\n').filter(Boolean);
 assert(matches('HEAD')||revisions().some(matches),'Recorded script version missing from branch: '+file);
 verifiedScripts.add(key);
}
assert.equal(git('diff','--name-only',base,'--','ios','data','js/atlas_snapshots.js','js/atlas_boot.js','js/lore_data.js','js/map_data.js','js/china_geo_data.js','js/i18n_dict.js','js/zh_hant.js','js/atlas_quiz.js').toString().trim(),'');
function verifyAssets(input){
 assert.equal(input.environment.applicationDiff,'');
 for(const [variant,assets]of Object.entries(input.environment.assets))for(const [file,digest]of Object.entries(assets))assert.equal(sha(variant==='baseline'?git('show',base+':'+file):fs.readFileSync(file)),digest,'Measured asset mismatch: '+variant+':'+file);
}
const cohorts=[],hosts=[],captures=[];let playbackYears,traceCount=0;
for(const name of ['frames','native']){
 const file=path.join(review,name,'frames.json'),input=read(file);assert(input.complete);assert.equal(input.runs.length,18);verifyAssets(input);
 verifyRecordedScript('scripts/benchmark_frames.cjs',input.environment.harnessSHA256);
 const rows=[];
 for(const row of input.runs){
  const bytes=z.gunzipSync(fs.readFileSync(path.join(review,name,'traces',row.traceFile)));assert.equal(sha(bytes),row.traceSHA256);
  const checked=analyze(JSON.parse(bytes).traceEvents);assert.equal(checked.presentedFps,row.presentedFps);assert.deepEqual(checked.presentationTimesUs,row.presentationTimesUs);
  assert.deepEqual(row.errors,[]);assert.deepEqual(row.failed,[]);assert(row.state.focused&&row.state.visible==='visible'&&!row.state.playing&&!row.state.stageTransform&&row.state.typographyCurrent);assert.deepEqual(row.state.interruptions,[]);
  if(row.scenario==='playback'){playbackYears??=row.state.years;assert(playbackYears.length>=8);assert.deepEqual(row.state.years,playbackYears);}
  const delivery=analyzeRow(row,path.join(review,name,'traces'));
  if(row.windowCapture){const b=fs.readFileSync(row.windowCapture.file);assert.equal(sha(b),row.windowCapture.sha256);captures.push({file:row.windowCapture.file,sha256:sha(b),imageSHA256:sha(fs.readFileSync(row.windowCapture.file+'.png')),json:b.toString()});}
  rows.push({...delivery,layoutMs:checked.breakdown.Layout?.totalMs||0,paintMs:checked.breakdown.Paint?.totalMs||0,p95Ms:row.frameIntervalP95Ms,maxGapMs:row.frameIntervalMaxMs,longTasks:row.state.longTasks,droppedPct:row.droppedPct,partialPct:row.partialPct});
  hosts.push(row.hostBefore,row.hostAfter);traceCount++;if(global.gc)global.gc();
 }
 const groups=[];
 for(const scenario of ['pan','zoom','playback'])for(const variant of ['baseline','candidate']){
  const a=rows.filter(r=>r.scenario===scenario&&r.variant===variant);assert.equal(a.length,3);
  groups.push({scenario,variant,fps:stats(a.map(r=>r.chromePresentationFeedbackFps)),nativeChangedHz:a.every(r=>r.native)?stats(a.map(r=>r.native.changedSamplesPerSecond)):null,
   layoutMs:stats(a.map(r=>r.layoutMs)),paintMs:stats(a.map(r=>r.paintMs)),maxGapMs:stats(a.map(r=>r.maxGapMs)),longTasks:stats(a.map(r=>r.longTasks.length)),droppedPct:stats(a.map(r=>r.droppedPct)),partialPct:stats(a.map(r=>r.partialPct))});
 }
 archive(file,name+'.json');write(name+'-analysis.json',{complete:true,inputSHA256:sha(fs.readFileSync(file)),groups,rows});
 cohorts.push({name,sourceCommit:input.environment.candidateCommit,baseCommit:input.environment.baseCommit,target:input.target,groups});console.log('Verified',name,rows.length,'traces');
}
const memoryFile=path.join(review,'memory.json'),memory=read(memoryFile);assert(memory.complete);assert.equal(memory.runs.length,6);verifyAssets(memory);verifyRecordedScript('scripts/benchmark_startup_memory.cjs',memory.environment.harnessSHA256);
const memoryGroups=['baseline','candidate'].map(variant=>{const rows=memory.runs.filter(r=>r.variant===variant);assert.equal(rows.length,3);for(const r of rows){assert.deepEqual(r.errors,[]);assert.deepEqual(r.failed,[]);hosts.push(r.hostBefore,r.hostAfter)}return {variant,metrics:Object.fromEntries(Object.keys(rows[0].summary).map(k=>[k,stats(rows.map(r=>r.summary[k]))]))}});
archive(memoryFile,'memory.json');
const validation=read(path.join(review,'validation-checks.json')),measurement=read(path.join(review,'measure-checks.json'));assert(validation.complete&&measurement.complete);assert(validation.checks.every(r=>r.exitCode===0));
const sourceHashes=Object.fromEntries(['js/app.js','css/style.css','index.html'].map(f=>[f,sha(fs.readFileSync(f))]));assert.deepEqual(validation.sources,sourceHashes);assert.deepEqual(measurement.sources,sourceHashes);
const logs={};for(const record of [validation,measurement])for(const r of record.checks){verifyRecordedScript(r.script,r.scriptSHA256);const b=fs.readFileSync(path.join(review,r.name+'.log'));assert.equal(sha(b),r.logSHA256);logs[r.name]=b.toString();}
const artifacts={};for(const f of ['geometry.json','worker.json','scenes.json','plane/checks.json','viewport/checks.json','callouts/checks.json','features/features.json','timeline/verification.json','responsive/checks.json','lan.json']){
 const v=read(path.join(review,f));if(v.complete!==undefined)assert(v.complete);artifacts[f]=v;
}
assert(artifacts['features/features.json'].renderedContentEquivalent);assert.equal(artifacts['responsive/checks.json'].rows.length,18);
write('verification.json',{complete:true,validation,measurement,sourceHashes,artifacts,logs,rawEvidenceDirectory:path.resolve(review)});
assert(hosts.every(h=>['jellyfin','LogiPluginService'].every(n=>h.busyServices.some(s=>s.process===n))));
const host={oneMinuteLoad:stats(hosts.map(h=>h.loadAverage[0])),services:Object.fromEntries(['jellyfin','LogiPluginService'].map(n=>{const a=hosts.flatMap(h=>h.busyServices.filter(s=>s.process===n));return [n,{pids:[...new Set(a.map(s=>s.pid))],cpuPercent:stats(a.map(s=>s.cpuPercent))}]}))};
write('summary.json',{complete:true,baseCommit:git('rev-parse',base).toString().trim(),sourceHashes,cohorts,memory:memoryGroups,host,traceCount,nativeCaptureCount:captures.length,playbackYears,
 everyRun60Passed:cohorts.every(c=>c.target.passed),limitations:['Separate three-pair captured/uncaptured cohorts; do not pool or discard slow samples.','Chrome feedback and native changed-pixel frequency are different metrics; neither proves physical photon FPS or every-layer freshness.','Fresh browser profiles; OS/font caches and background load uncontrolled.','Main-page heap excludes workers; summed RSS may double-count shared pages and excludes total GPU memory.','Responsive checks emulate viewports/touch; physical-phone and Safari FPS are not established.']});
fs.writeFileSync(path.join(out,'svg-final-native-captures.json.gz'),z.gzipSync(JSON.stringify({complete:true,captures}),{level:9}));
console.log('Verified',traceCount,'traces,',captures.length,'native captures, six startup/memory runs and',validation.checks.length,'validation groups.');
