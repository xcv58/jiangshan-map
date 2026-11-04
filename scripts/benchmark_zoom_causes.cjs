#!/usr/bin/env node
// Visible Chrome, trusted input, presentation feedback and optional native capture.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {execFileSync,spawn} = require('node:child_process');
if(process.argv.includes('--help')){
  console.log('Serve complete checkouts, then PLAYWRIGHT_PATH=/path/to/playwright FRAME_OUTPUT=/tmp/frames.json node scripts/benchmark_frames.cjs\nFRAME_RUNS=3; FRAME_VARIANTS=baseline,candidate; FRAME_TRACE_DIR optionally saves compressed traces. Requires visible, unobscured Chrome on macOS.');
  process.exit(0);
}
const root=path.resolve(__dirname,'..');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const definition=JSON.parse(fs.readFileSync(process.env.ZOOM_VARIANTS));
const definitions=Object.fromEntries(definition.variants.map(v=>[v.name,v]));
const urls=Object.fromEntries(definition.variants.map(v=>[v.name,v.url]));
const sourceFile=(variant,file)=>{const overridden=path.join(definitions[variant].root,file);return fs.existsSync(overridden)?overridden:path.join(definition.sharedRoot,file)};
const variants=definition.variants.map(v=>v.name);
const runs=definition.repetitions;
const output=path.resolve(process.env.FRAME_OUTPUT||'/tmp/jiangshan-frames.json');
const base=process.env.WEB_BASE_REF||'ff1392c';
const traceDir=process.env.FRAME_TRACE_DIR;
const scenarios=['zoom'];
const minimumFps=process.env.FRAME_MIN_FPS === undefined ? null : Number(process.env.FRAME_MIN_FPS);
const captureBinary=process.env.FRAME_CAPTURE_BINARY;
const captureDir=process.env.FRAME_CAPTURE_DIR;
const categories='cc,benchmark,viz,blink.user_timing,devtools.timeline,disabled-by-default-devtools.timeline.frame'+(process.env.FRAME_GPU_TRACE==='1'?',gpu,toplevel':'');
const percentile=(v,q)=>[...v].sort((a,b)=>a-b)[Math.max(0,Math.ceil(v.length*q)-1)]??null;
const median=values=>{const v=[...values].sort((a,b)=>a-b),m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2};
const sleep=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
const hostState=()=>({loadAverage:os.loadavg(),busyServices:execFileSync('ps',['-axo','pid=,pcpu=,comm='],{encoding:'utf8'}).split('\n').filter(s=>/\/jellyfin$|\/LogiPluginService$/.test(s)).map(s=>{const m=s.trim().match(/^(\d+)\s+([\d.]+)\s+(.*)$/);return {pid:Number(m[1]),cpuPercent:Number(m[2]),process:path.basename(m[3])}})});
assert(Number.isInteger(runs)&&runs>0&&variants.length&&variants.every(v=>v in urls));
assert.equal(new Set(variants).size,variants.length,'Variants must be distinct');
assert(scenarios.length&&scenarios.every(s=>['pan','zoom','playback'].includes(s))&&new Set(scenarios).size===scenarios.length);
assert(minimumFps===null || (Number.isFinite(minimumFps)&&minimumFps>0&&variants.includes('candidate')),'Invalid FPS target');
assert(!captureBinary || captureDir,'Native capture requires FRAME_CAPTURE_DIR');

async function captureWindow(cdp,page,variant,repeat,scenario){
  if(!captureBinary)return null;
  const processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;
  const pid=processes.find(p=>p.type==='browser')?.id;assert(pid>0,'Owned browser process unavailable');
  fs.mkdirSync(captureDir,{recursive:true});
  const file=path.join(captureDir,`${variant}-${repeat}-${scenario}.json`);
  const roi=await page.evaluate(()=>{const r=document.getElementById('viewport-frame').getBoundingClientRect();return {x:r.x+(outerWidth-innerWidth)/2+32,y:r.y+outerHeight-innerHeight+32,width:r.width-64,height:r.height-64,outerWidth,outerHeight}});
  const child=spawn(captureBinary,[String(pid),file,JSON.stringify(roi)],{stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';
  child.stderr.on('data',d=>stderr+=d);
  const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Native capture failed: '+stderr)))});
  // Attach a rejection handler while waiting for the initial ready record.
  closed.catch(()=>{});
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Native capture startup timed out: '+stderr))},10000);
    child.stdout.on('data',data=>{stdout+=data;if(stdout.includes('"ready":true')){clearTimeout(timer);resolve()}});
    child.once('error',error=>{clearTimeout(timer);reject(error)});
    child.once('close',code=>{clearTimeout(timer);if(!stdout.includes('"ready":true'))reject(Error('Native capture exited before readiness: '+code+' '+stderr))});
  });
  return {async stop(){child.stdin.end('stop\n');await closed;const bytes=fs.readFileSync(file),result=JSON.parse(bytes);assert(result.complete,result.error);return {file:path.relative(path.dirname(output),path.resolve(file)),sha256:hash(bytes),requestedCaptureHz:result.requestedCaptureHz,frames:result.frames.length}},
    abort(){child.kill('SIGTERM')}};
}

function analyze(events){
  const start=events.find(e=>e.name==='atlas-frames:start'),end=events.find(e=>e.name==='atlas-frames:end');
  assert(start&&end&&end.ts>start.ts,'Missing measurement marks');
  const pid=start.pid,inWindow=t=>t>=start.ts&&t<end.ts;
  const displayed=new Set(events.filter(e=>e.name==='Display::FrameDisplayed').map(e=>e.ts));
  assert(displayed.size,'No real display presentation feedback; refusing an FPS result');
  const open=new Map(),frames=[],states=new Map();
  for(const e of events.filter(e=>e.pid===pid&&e.name==='PipelineReporter').sort((a,b)=>a.ts-b.ts)){
    const id=JSON.stringify(e.id2||e.id);
    if(e.ph==='b')open.set(id,e);
    else if(e.ph==='e'&&open.has(id)){
      const begin=open.get(id);open.delete(id);const info=begin.args.frame_reporter;
      if(!info)continue;
      if(inWindow(e.ts)&&/^STATE_PRESENTED_/.test(info.state))frames.push(e.ts);
      if(inWindow(begin.ts)){
        const key=info.frame_source+':'+info.frame_sequence,prior=states.get(key);
        const rank={STATE_NO_UPDATE_DESIRED:0,STATE_DROPPED:1,STATE_PRESENTED_PARTIAL:2,STATE_PRESENTED_ALL:3};
        if(!prior||rank[info.state]>rank[prior])states.set(key,info.state);
      }
    }
  }
  const unique=[...new Set(frames)].sort((a,b)=>a-b);
  assert(unique.length>5,'Too few presented page frames');
  const matched=unique.filter(t=>displayed.has(t)).length;
  assert(matched/unique.length>.95,'Page presentation times do not match Chrome display feedback');
  // Multiple surfaces can be reported one microsecond apart at one display
  // refresh. Count that presentation opportunity once, including forked reports.
  const ts=unique.filter((t,i)=>i===0||t-unique[i-1]>=1000);
  assert(ts.length>5,'Too few distinct display refreshes');
  const intervals=ts.slice(1).map((t,i)=>(t-ts[i])/1000);
  const counts={};for(const s of states.values())counts[s]=(counts[s]||0)+1;
  const active=[...states.values()].filter(s=>s!=='STATE_NO_UPDATE_DESIRED');
  const durationMs=(end.ts-start.ts)/1000;
  const breakdown={};
  for(const e of events)if(e.pid===pid&&e.ph==='X'&&inWindow(e.ts)&&['Layout','UpdateLayoutTree','Paint','PrePaint','FunctionCall','FireAnimationFrame'].includes(e.name)){
    const b=breakdown[e.name]??={calls:0,totalMs:0,maxMs:0};b.calls++;b.totalMs+=(e.dur||0)/1000;b.maxMs=Math.max(b.maxMs,(e.dur||0)/1000);
  }
  return {durationMs,presentedFrames:ts.length,presentedFps:ts.length*1000/durationMs,
    frameIntervalP95Ms:percentile(intervals,.95),frameIntervalMaxMs:Math.max(...intervals),
    intervalsOver50Ms:intervals.filter(t=>t>50.5).length,
    droppedPct:100*(counts.STATE_DROPPED||0)/active.length,
    partialPct:100*(counts.STATE_PRESENTED_PARTIAL||0)/active.length,
    states:counts,osFeedbackMatches:matched,uniqueFeedbackTimestamps:unique.length,presentationTimesUs:ts.map(t=>t-start.ts),
    rendererPid:pid,breakdown};
}

async function stopTrace(cdp,events,collect){
  const finished=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');
  const result=await finished;assert(!result.dataLossOccurred,'Trace buffer overflow');
  cdp.off('Tracing.dataCollected',collect);return events;
}
async function settle(page){
  await page.waitForFunction(()=>!atlasApp.flyRaf&&atlasApp._camRaf===null&&atlasApp._cameraSettleTimer===null);
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(250);
}
async function input(page,kind){
  const b=await page.locator('#atlas-svg').boundingBox(),x=b.x+b.width*.5,y=b.y+b.height*.45;
  await page.mouse.move(x,y);
  const steps=240,duration=4000,t=performance.now(),pending=[];let previous=0;
  if(kind==='pan')await page.mouse.down();
  for(let i=1;i<=steps;i++){
    await sleep(t+i*duration/steps-performance.now());const p=i/steps;
    // Real input arrives independently of Chromium's acknowledgement. Waiting
    // for each wheel ack serially artificially caps the input stream at 30 Hz.
    if(kind==='pan')pending.push(page.mouse.move(x+150*Math.sin(p*Math.PI*4),y+65*Math.sin(p*Math.PI*2)));
    else {const delta=-660*Math.sin(p*Math.PI)**2;pending.push(page.mouse.wheel(0,delta-previous));previous=delta;}
  }
  await Promise.all(pending);
  if(kind==='pan')await page.mouse.up();
  return {steps,targetDurationMs:duration,driverDurationMs:performance.now()-t};
}
async function sample(browser,cdp,variant,repeat,scenario){
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:2});
  let capture;
  try{
    await context.route(/cloudflareinsights|vercount/,r=>r.fulfill({status:200,body:'',contentType:'application/javascript'}));
    const page=await context.newPage(),errors=[],failed=[];
    page.setDefaultNavigationTimeout(90000);
    page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));
    await page.goto(urls[variant]+'?year='+(scenario==='playback'?750:1415),{waitUntil:'load'});
    await page.waitForFunction(()=>window.atlasApp?._fullSnapshotsLoaded&&window.DYNASTY_DATA.length===18&&window.ATLAS_LORE_DATA?.CHINESE_ERA_SPANS?.length>100);
    await page.bringToFront();await settle(page);
    assert(await page.evaluate(()=>document.visibilityState==='visible'&&document.hasFocus()),'Benchmark page must be visible and focused');
    await page.evaluate(()=>{
      window.frameChecks={years:[],longTasks:[],wheelEvents:0,wheelDelta:0,pointerMoves:0,initialCamera:{...atlasApp.camera},interruptions:[]};
      document.addEventListener('visibilitychange',()=>frameChecks.interruptions.push(document.visibilityState));
      window.addEventListener('blur',()=>frameChecks.interruptions.push('blur'));
      atlasApp.svg.addEventListener('wheel',e=>{frameChecks.wheelEvents++;frameChecks.wheelDelta+=e.deltaY},{passive:true});
      atlasApp.svg.addEventListener('pointermove',()=>frameChecks.pointerMoves++,{passive:true});
      const jump=atlasApp.jumpToYear;atlasApp.jumpToYear=function(year,...args){frameChecks.years.push(year);return jump.call(this,year,...args)};
      new PerformanceObserver(l=>frameChecks.longTasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask'});
    });
    if(scenario==='playback'){await page.locator('#act-play-speed').click();await page.locator('#act-play-speed').click();assert.equal(await page.evaluate(()=>atlasApp.playSpeed),4)}
    assert(await page.evaluate(()=>[...document.fonts].some(f=>f.family==='Noto Serif SC'&&f.status==='loaded')),'Required UI fonts did not load');
    const hostBefore=hostState();
    const events=[],collect=chunk=>{for(const event of chunk.value)events.push(event)};
    cdp.on('Tracing.dataCollected',collect);
    await cdp.send('Tracing.start',{traceConfig:{includedCategories:categories.split(','),recordMode:'recordUntilFull',traceBufferSizeInKb:65536},transferMode:'ReportEvents'});
    capture=await captureWindow(cdp,page,variant,repeat,scenario);
    await page.evaluate(()=>{frameChecks.start=performance.now();performance.mark('atlas-frames:start')});
    let driver;
    if(scenario==='playback'){
      await page.locator('#act-autoplay').click();await page.waitForTimeout(10000);await page.locator('#act-autoplay').click();driver={targetDurationMs:10000};
    }else driver=await input(page,scenario);
    await page.evaluate(()=>{frameChecks.end=performance.now();performance.mark('atlas-frames:end')});
    const windowCapture=capture?await capture.stop():undefined;capture=null;
    await settle(page);await page.waitForTimeout(180);
    const traceEvents=await stopTrace(cdp,events,collect),frames=analyze(traceEvents);
    const state=await page.evaluate(()=>({year:atlasApp.year,initialCamera:frameChecks.initialCamera,camera:{...atlasApp.camera},viewBox:atlasApp.svg.getAttribute('viewBox'),typographyCurrent:Math.abs(atlasApp.camera.w-atlasApp._lastTypographyWidth)<=.05,stageTransform:atlasApp._stageWrap?.style.transform,playing:atlasApp.playing,years:frameChecks.years,wheelEvents:frameChecks.wheelEvents,wheelDelta:frameChecks.wheelDelta,pointerMoves:frameChecks.pointerMoves,interruptions:frameChecks.interruptions,longTasks:frameChecks.longTasks.filter(t=>t.start>=frameChecks.start&&t.start<frameChecks.end),focused:document.hasFocus(),visible:document.visibilityState}));
    assert(state.typographyCurrent&&!state.stageTransform&&!state.playing&&state.focused&&state.visible==='visible');
    assert.deepEqual(state.interruptions,[],'Window lost focus/visibility during measurement');
    if(scenario==='playback')assert(state.years.length>=8,'Playback did not advance');
    else {
      for(const k of ['x','y','w','h'])assert(Math.abs(state.camera[k]-state.initialCamera[k])<.0001,'Input lost the final camera position: '+k);
      if(scenario==='zoom')assert(Math.abs(state.wheelDelta)<.0001,'Wheel deltas were lost');
    }
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
    const hostAfter=hostState();
    const raw=JSON.stringify({traceEvents});
    let traceFile;
    if(traceDir){fs.mkdirSync(traceDir,{recursive:true});traceFile=`${variant}-${repeat}-${scenario}.json.gz`;fs.writeFileSync(path.join(traceDir,traceFile),zlib.gzipSync(raw,{level:9}))}
    return {variant,repeat,scenario,...frames,driver,state,errors,failed,hostBefore,hostAfter,windowCapture,traceFile,traceSHA256:hash(raw)};
  }finally{if(capture)capture.abort();await context.close()}
}

async function main(){
  const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
  const assets={};for(const v of variants){assets[v]={};for(const file of ['index.html','css/style.css','js/app.js','js/map_data.js','js/lore_data.js','js/atlas_snapshots.js','js/atlas_quiz.js']){
    const response=await fetch(new URL(file,urls[v]));assert(response.ok);const bytes=Buffer.from(await response.arrayBuffer());assets[v][file]=hash(bytes);
    const expected=fs.readFileSync(sourceFile(v,file));assert.equal(hash(bytes),hash(expected),'Wrong served asset '+v+':'+file);
  }}
  if(assets.baseline&&assets.candidate)for(const file of ['js/map_data.js','js/lore_data.js','js/atlas_snapshots.js','js/atlas_quiz.js'])assert.equal(assets.baseline[file],assets.candidate[file]);
  const browserArgs=['--window-position=0,0','--disk-cache-size=33554432'];
  const browser=await chromium.launch({channel:'chrome',headless:false,args:browserArgs});
  const result={schemaVersion:1,environment:{runId:process.env.FRAME_RUN_ID||crypto.randomUUID(),measuredAt:new Date().toISOString(),browser:browser.version(),node:process.version,platform:os.platform(),osRelease:os.release(),cpu:os.cpus()[0].model,memoryBytes:os.totalmem(),loadAverage:os.loadavg(),swap:process.platform==='darwin'?execFileSync('sysctl',['vm.swapusage'],{encoding:'utf8'}).trim():null,headless:false,viewport:{width:1280,height:720},dpr:2,baseCommit:git('rev-parse',base),candidateCommit:git('rev-parse','HEAD'),applicationDiff:git('diff','HEAD','--','js/app.js','css/style.css','index.html'),harnessSHA256:hash(fs.readFileSync(__filename)),assets,categories,method:'Unique presented PipelineReporter end timestamps from the page renderer, cross-checked against Display::FrameDisplayed. These Chrome events share presentation feedback; agreement validates parsing, not an independent measurement of display output. Trusted input and real 4x autoplay; no renderer overrides, synthetic animation or RAF FPS proxy.'},runs:[]};
  try{
    result.complete=false;
    result.environment.repetitions=runs;
    result.environment.navigationTimeoutMs=90000;
    result.environment.scenarios=scenarios;
    const cdp=await browser.newBrowserCDPSession();
    result.environment.gpu=(await cdp.send('SystemInfo.getInfo')).gpu;
    result.environment.browserArgs=browserArgs;
    result.environment.nodeGCBetweenSamples=typeof global.gc==='function';
    result.environment.traceTransport='ReportEvents; no temporary trace file; compressed archives written only after measurement';
    result.environment.nativeWindowCapture=Boolean(captureBinary);
    if(captureBinary)result.environment.captureTool={binarySHA256:hash(fs.readFileSync(captureBinary)),sourceSHA256:hash(fs.readFileSync(path.join(__dirname,'capture_window_frames.swift'))),analysis:'ScreenCaptureKit map-ROI content changes; independent of Chrome feedback, subject to capture overhead and coalescing. Not photon measurements.'};
    result.environment.variantDefinitions=definition;
    for(let repeat=0;repeat<runs;repeat++)for(const scenario of scenarios)for(const variant of [...variants.slice(repeat%variants.length),...variants.slice(0,repeat%variants.length)]){
      if(global.gc)global.gc();
      const row=await sample(browser,cdp,variant,repeat,scenario);result.runs.push(row);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
      console.log(JSON.stringify({variant,repeat,scenario,fps:row.presentedFps,p95:row.frameIntervalP95Ms,droppedPct:row.droppedPct,partialPct:row.partialPct,layoutMs:row.breakdown.Layout?.totalMs,years:row.state.years.length}));
    }
    for(const v of variants)for(const [file,identity] of Object.entries(assets[v])){
      const response=await fetch(new URL(file,urls[v]));assert(response.ok);
      assert.equal(hash(Buffer.from(await response.arrayBuffer())),identity,'Served application changed during measurement: '+v+':'+file);
      assert.equal(hash(fs.readFileSync(sourceFile(v,file))),identity,'Variant changed during measurement: '+v+':'+file);
    }
    result.medians={};
    for(const scenario of scenarios){
      result.medians[scenario]={};
      for(const variant of variants){
        const rows=result.runs.filter(r=>r.variant===variant&&r.scenario===scenario);
        assert.equal(rows.length,runs,'Incomplete comparison');
        result.medians[scenario][variant]=Object.fromEntries(['presentedFps','frameIntervalP95Ms','intervalsOver50Ms','droppedPct','partialPct'].map(k=>[k,median(rows.map(r=>r[k]))]));
      }
    }
    if(minimumFps!==null){
      const measured=result.runs.filter(r=>r.variant==='candidate');
      result.target={minimumFps,scope:'Every candidate run, without rounding or discarding low samples',
        passed:measured.every(r=>r.presentedFps>=minimumFps),
        failures:measured.filter(r=>r.presentedFps<minimumFps).map(r=>({repeat:r.repeat,scenario:r.scenario,presentedFps:r.presentedFps})),
        minimumByScenario:Object.fromEntries(scenarios.map(s=>[s,Math.min(...measured.filter(r=>r.scenario===s).map(r=>r.presentedFps))]))};
    }
    result.complete=true;fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({complete:true,medians:result.medians,target:result.target,output}));
    if(result.target&&!result.target.passed)process.exitCode=1;
  }finally{await browser.close()}
}
module.exports={analyze,input,settle,captureWindow,hostState};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
