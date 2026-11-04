#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const out=process.env.CALLOUT_TEST_OUTPUT||'/tmp/atlas-callouts';
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch({channel:'chrome',headless:true}),rows=[];try{
 for(const phone of [false,true])for(const variant of ['baseline','candidate']){
  const c=await b.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:720},deviceScaleFactor:2});await c.route(/cloudflareinsights|vercount/,r=>r.fulfill({status:200,body:''}));const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto((variant==='baseline'?process.env.WEB_BASE_URL:process.env.ATLAS_URL)+'?year=750',{timeout:90000});await p.waitForFunction(()=>atlasApp?._fullSnapshotsLoaded&&!atlasApp.flyRaf&&atlasApp._camRaf===null&&atlasApp._cameraSettleTimer===null);await p.evaluate(()=>document.fonts.ready);
  await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  const states=[];
  for(const year of [751,753,755,763,764,885]){
   const state=await p.evaluate(async year=>{const a=atlasApp;a.jumpToYear(year);if(a.flyRaf)cancelAnimationFrame(a.flyRaf);a.flyRaf=null;a._applyCamera(true);const d=a.dynasties[a.dynastyIdx],m=d.milestones[a._activeMilestoneIndex(d)];a.openMilestoneBalloon(d,m,{isAuto:false});await document.fonts.ready;a._applyCamera(true);const capture=()=>({rect:a.milestoneBalloon.getBoundingClientRect().toJSON(),text:a.milestoneBalloon.textContent,caret:a.milestoneBalloon.dataset.caret,cx:a.milestoneBalloon.style.getPropertyValue('--caret-x'),cy:a.milestoneBalloon.style.getPropertyValue('--caret-y')});const before=capture();a.camera={...a.camera,x:a.camera.x+45,y:a.camera.y-22};a._applyCamera();clearTimeout(a._cameraSettleTimer);a._cameraSettleTimer=null;const during=capture();a._finishCameraMotion();return{year,before,during,after:capture()};},year);
   states.push(state);if(year===755)await p.screenshot({path:path.join(out,variant+'-'+(phone?'phone':'desktop')+'.png')});
  }
  assert.deepEqual(errors,[]);rows.push({phone,variant,states,errors});await c.close();
 }
 for(const phone of [false,true]){const [a,b]=rows.filter(r=>r.phone===phone);assert.deepEqual(b.states,a.states,'Callout dimensions, positions, caret or content changed')}
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({complete:true,rows},null,2)+'\n');console.log('PASS: identical callout position, size, caret and content before/during/after camera motion across six years on desktop/phone.');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
