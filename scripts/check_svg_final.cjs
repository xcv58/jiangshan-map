#!/usr/bin/env node
// Sequential verification and visible-browser measurements against pinned main.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.SVG_REVIEW_DIR||path.join(root,'../jiangshan-map-svg-final-review'));
fs.mkdirSync(out,{recursive:true});
const base=process.env.WEB_BASE_REF||'d54411d',phase=process.argv.includes('--measure-only')?'measure':'validation';
const env={...process.env,WEB_BASE_REF:base,WEB_BASE_URL:process.env.WEB_BASE_URL||'http://127.0.0.1:8824/',ATLAS_URL:process.env.ATLAS_URL||'http://127.0.0.1:8825/'};
assert(env.PLAYWRIGHT_PATH,'Set PLAYWRIGHT_PATH');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const sources=()=>Object.fromEntries(['js/app.js','css/style.css','index.html'].map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
const record={complete:false,phase,baseCommit:git('rev-parse',base),sourceCommit:git('rev-parse','HEAD'),sources:sources(),checks:[]};
const file=path.join(out,phase+'-checks.json');
function run(name,script,extra={},targetFailureAllowed=false,args=[]){
 const disk=fs.statfsSync(root);assert(disk.bavail*disk.bsize>2*1024**3,'Free at least 5 GB before browser collection');
 console.log('Starting:',name);
 const result=spawnSync(process.execPath,['--expose-gc',script,...args],{cwd:root,env:{...env,...extra},encoding:'utf8',maxBuffer:32*1024*1024});
 const log=(result.stdout||'')+(result.stderr||'');fs.writeFileSync(path.join(out,name+'.log'),log);
 let targetFailure=false;
 if(targetFailureAllowed&&result.status===1&&fs.existsSync(extra.FRAME_OUTPUT)){const r=JSON.parse(fs.readFileSync(extra.FRAME_OUTPUT));targetFailure=r.complete&&r.target.minimumFps===60&&!r.target.passed;}
 record.checks.push({name,script,args,exitCode:result.status,targetFailure,scriptSHA256:sha(fs.readFileSync(script)),logSHA256:sha(log)});
 assert.deepEqual(sources(),record.sources,'Runtime changed during verification');
 fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');
 if(result.status!==0&&!targetFailure)throw Error('Failed '+name+'; see '+path.join(out,name+'.log'));
 console.log('Finished:',name,targetFailure?'60 FPS target not met':'passed');
}
try{
 assert.equal(git('diff','--name-only',base,'--','ios','data','js/atlas_snapshots.js','js/atlas_boot.js','js/lore_data.js','js/map_data.js','js/china_geo_data.js','js/i18n_dict.js','js/zh_hant.js','js/atlas_quiz.js'),'','Web-only/data preservation failed');
 if(phase==='validation'){
  run('assets','scripts/sync_version.js',{},false,['--check']);
  run('atlas','scripts/validate_atlas.js');
  run('geometry','scripts/validate_web_equivalence.cjs',{WEB_EQUIVALENCE_OUTPUT:path.join(out,'geometry.json')});
  run('worker','scripts/validate_playback_preparation.cjs',{PLAYBACK_PREPARATION_OUTPUT:path.join(out,'worker.json')});
  run('scenes','scripts/validate_svg_reuse.cjs',{SVG_REUSE_OUTPUT:path.join(out,'scenes.json')});
  run('camera','scripts/validate_camera.cjs',{CAMERA_TEST_OUTPUT:path.join(out,'camera')});
  run('plane','scripts/validate_camera_plane.cjs',{CAMERA_PLANE_OUTPUT:path.join(out,'plane')});
  run('viewport','scripts/validate_viewport_labels.cjs',{VIEWPORT_TEST_OUTPUT:path.join(out,'viewport')});
  run('callouts','scripts/validate_callout_motion.cjs',{CALLOUT_TEST_OUTPUT:path.join(out,'callouts')});
  run('features','scripts/validate_web_features.cjs',{WEB_FEATURE_OUTPUT:path.join(out,'features')});
  run('timeline','scripts/validate_timeline_rendering.cjs',{THUMB_VALIDATION_OUTPUT:path.join(out,'timeline')});
  run('responsive','scripts/validate_responsive.cjs',{RESPONSIVE_OUTPUT:path.join(out,'responsive')});
  run('frame-parser','scripts/validate_frame_metrics.cjs',{FRAME_CAPTURE_BINARY:''});
  run('native-parser','scripts/validate_frame_delivery.cjs',{FRAME_CAPTURE_BINARY:''});
  if(env.LAN_MAIN_URL&&env.LAN_CANDIDATE_URL)run('lan','scripts/validate_lan_preview.cjs',{LAN_PREVIEW_OUTPUT:path.join(out,'lan.json')});
 }else{
  assert.equal(git('diff','HEAD','--','js/app.js','css/style.css','index.html'),'','Commit runtime before measurement');
  const validation=JSON.parse(fs.readFileSync(path.join(out,'validation-checks.json')));assert(validation.complete,'Complete validation first');assert.deepEqual(validation.sources,record.sources,'Validated runtime changed');
  run('fps','scripts/benchmark_frames.cjs',{FRAME_CAPTURE_BINARY:'',FRAME_RUNS:'3',FRAME_MIN_FPS:'60',FRAME_OUTPUT:path.join(out,'frames/frames.json'),FRAME_TRACE_DIR:path.join(out,'frames/traces')},true);
  if(env.FRAME_CAPTURE_BINARY)run('native','scripts/benchmark_frames.cjs',{FRAME_RUNS:'3',FRAME_MIN_FPS:'60',FRAME_GPU_TRACE:'1',FRAME_OUTPUT:path.join(out,'native/frames.json'),FRAME_TRACE_DIR:path.join(out,'native/traces'),FRAME_CAPTURE_DIR:path.join(out,'native/captures')},true);
  run('memory','scripts/benchmark_startup_memory.cjs',{FRAME_CAPTURE_BINARY:'',MEMORY_RUNS:'3',MEMORY_OUTPUT:path.join(out,'memory.json')});
 }
 record.complete=true;fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');console.log('Completed',phase,out);
}catch(e){console.error(e.message);process.exitCode=1;}
