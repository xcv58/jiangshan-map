#!/usr/bin/env node
// Sequential verification and visible-browser measurements against pinned main.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.SVG_REVIEW_DIR||path.join(root,'../jiangshan-map-svg-low-risk-review'));
fs.mkdirSync(out,{recursive:true});
const base=process.env.WEB_BASE_REF||'ae8a422',phase=process.argv.includes('--measure-only')?'measure':'validation';
const env={...process.env,WEB_BASE_REF:base,WEB_BASE_URL:process.env.WEB_BASE_URL||'http://127.0.0.1:8834/',ATLAS_URL:process.env.ATLAS_URL||'http://127.0.0.1:8835/'};
assert(env.PLAYWRIGHT_PATH,'Set PLAYWRIGHT_PATH');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const sources=()=>Object.fromEntries(['js/app.js','css/style.css','index.html'].map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
const record={complete:false,phase,baseCommit:git('rev-parse',base),sourceCommit:git('rev-parse','HEAD'),sources:sources(),checks:[]};
const file=path.join(out,phase+'-checks.json');
fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');
function verifyFrames(output,runId,native){
 const r=JSON.parse(fs.readFileSync(output));
 assert.equal(r.environment?.runId,runId,'FPS output belongs to another invocation');
 assert.equal(r.complete,true,'Incomplete FPS collection');
 assert.equal(r.environment.nativeWindowCapture,native,'Wrong FPS cohort');
 assert.equal(r.runs.length,18,'Incomplete FPS comparison');
 const expected=new Set();
 for(const variant of ['baseline','candidate'])for(const scenario of ['pan','zoom','playback'])for(let repeat=0;repeat<3;repeat++)expected.add(`${variant}:${scenario}:${repeat}`);
 for(const row of r.runs){assert(expected.delete(`${row.variant}:${row.scenario}:${row.repeat}`),'Duplicate or unexpected FPS sample');assert(Number.isFinite(row.presentedFps)&&row.presentedFps>0,'Invalid FPS sample');}
 assert.equal(expected.size,0,'Missing FPS sample');
 assert.equal(r.target.minimumFps,60,'Wrong FPS target');
 assert.equal(r.target.passed,r.runs.filter(row=>row.variant==='candidate').every(row=>row.presentedFps>=60),'FPS acceptance disagrees with samples');
 return r;
}
function run(name,script,extra={},targetFailureAllowed=false,args=[]){
 const disk=fs.statfsSync(root);assert(disk.bavail*disk.bsize>2*1024**3,'Free at least 5 GB before browser collection');
 console.log('Starting:',name);
 const runId=targetFailureAllowed?crypto.randomUUID():undefined;
 const childEnv={...env,...extra,...(runId?{FRAME_RUN_ID:runId}:{})};
 const result=spawnSync(process.execPath,['--expose-gc',script,...args],{cwd:root,env:childEnv,encoding:'utf8',maxBuffer:32*1024*1024});
 const log=(result.stdout||'')+(result.stderr||'');fs.writeFileSync(path.join(out,name+'.log'),log);
 let targetFailure=false,outputError;
 if(targetFailureAllowed&&(result.status===0||result.status===1))try{
  const r=verifyFrames(extra.FRAME_OUTPUT,runId,Boolean(childEnv.FRAME_CAPTURE_BINARY));
  targetFailure=result.status===1&&!r.target.passed;
  assert(result.status!==0||r.target.passed,'FPS target failure returned success');
 }catch(e){outputError=e.message;}
 record.checks.push({name,script,args,exitCode:result.status,targetFailure,...(runId?{runId}:{}),...(outputError?{outputError}:{}),scriptSHA256:sha(fs.readFileSync(script)),logSHA256:sha(log)});
 assert.deepEqual(sources(),record.sources,'Runtime changed during verification');
 fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');
 if(outputError||(result.status!==0&&!targetFailure))throw Error('Failed '+name+(outputError?': '+outputError:'')+'; see '+path.join(out,name+'.log'));
 console.log('Finished:',name,targetFailure?'60 FPS target not met':'passed');
}
try{
 assert.equal(git('diff','--name-only',base,'--','ios','data','js/atlas_snapshots.js','js/atlas_boot.js','js/lore_data.js','js/map_data.js','js/china_geo_data.js','js/i18n_dict.js','js/zh_hant.js','js/atlas_quiz.js'),'','Web-only/data preservation failed');
 if(phase==='validation'){
  run('assets','scripts/sync_version.js',{},false,['--check']);
  run('atlas','scripts/validate_atlas.js');
  run('geometry','scripts/validate_web_equivalence.cjs',{WEB_EQUIVALENCE_OUTPUT:path.join(out,'geometry.json')});
  run('camera','scripts/validate_camera.cjs',{CAMERA_TEST_OUTPUT:path.join(out,'camera')});
  run('callouts','scripts/validate_callout_motion.cjs',{CALLOUT_TEST_OUTPUT:path.join(out,'callouts')});
  run('features','scripts/validate_web_features.cjs',{WEB_FEATURE_OUTPUT:path.join(out,'features')});
  run('timeline','scripts/validate_timeline_rendering.cjs',{THUMB_VALIDATION_OUTPUT:path.join(out,'timeline')});
  run('responsive','scripts/validate_responsive.cjs',{RESPONSIVE_OUTPUT:path.join(out,'responsive')});
  run('frame-parser','scripts/validate_frame_metrics.cjs',{FRAME_CAPTURE_BINARY:''});
  run('native-parser','scripts/validate_frame_delivery.cjs',{FRAME_CAPTURE_BINARY:''});
  run('evidence-tooling','scripts/validate_svg_evidence.cjs');
  if(env.LAN_MAIN_URL&&env.LAN_CANDIDATE_URL)run('lan','scripts/validate_lan_preview.cjs',{LAN_PREVIEW_OUTPUT:path.join(out,'lan.json')});
 }else{
  assert.equal(git('diff','HEAD','--','js/app.js','css/style.css','index.html'),'','Commit runtime before measurement');
  const validation=JSON.parse(fs.readFileSync(path.join(out,'validation-checks.json')));assert(validation.complete,'Complete validation first');assert.deepEqual(validation.sources,record.sources,'Validated runtime changed');
  const frameEnv={FRAME_RUNS:'3',FRAME_MIN_FPS:'60',FRAME_VARIANTS:'baseline,candidate',FRAME_SCENARIOS:'pan,zoom,playback'};
  run('fps','scripts/benchmark_frames.cjs',{...frameEnv,FRAME_CAPTURE_BINARY:'',FRAME_OUTPUT:path.join(out,'frames/frames.json'),FRAME_TRACE_DIR:path.join(out,'frames/traces')},true);
  if(env.FRAME_CAPTURE_BINARY)run('native','scripts/benchmark_frames.cjs',{...frameEnv,FRAME_GPU_TRACE:'1',FRAME_OUTPUT:path.join(out,'native/frames.json'),FRAME_TRACE_DIR:path.join(out,'native/traces'),FRAME_CAPTURE_DIR:path.join(out,'native/captures')},true);
  run('memory','scripts/benchmark_startup_memory.cjs',{FRAME_CAPTURE_BINARY:'',MEMORY_RUNS:'3',MEMORY_OUTPUT:path.join(out,'memory.json')});
 }
 record.complete=true;fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');console.log('Completed',phase,out);
}catch(e){console.error(e.message);process.exitCode=1;}
