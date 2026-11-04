#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const engine=process.env.WEB_TEST_ENGINE||'chromium';
assert(['chromium','webkit'].includes(engine));
const browserType=require(process.env.PLAYWRIGHT_PATH||'playwright')[engine];
const urls={baseline:process.env.WEB_BASE_URL||'http://127.0.0.1:8796/',candidate:process.env.ATLAS_URL||'http://127.0.0.1:8797/'},out=process.env.THUMB_VALIDATION_OUTPUT||'/tmp/thumb-validation';
const rest=async p=>{await p.waitForFunction(()=>!atlasApp.flyRaf&&atlasApp._camRaf===null&&atlasApp._cameraSettleTimer===null);await p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})};
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await browserType.launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})});const rows=[];try{
 for(const phone of [false,true])for(const variant of ['baseline','candidate']){
  const c=await browser.newContext(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:720}});
  await c.route(/cloudflareinsights|vercount/,r=>r.fulfill({status:200,body:'',contentType:'application/javascript'}));const p=await c.newPage(),errors=[];p.setDefaultNavigationTimeout(90000);p.on('pageerror',e=>errors.push(e.message));
  const load=async query=>{await p.goto(urls[variant]+query);await p.waitForFunction(()=>window.atlasApp?._fullSnapshotsLoaded);if(variant==='candidate')await p.waitForFunction(()=>document.getElementById('scrubber-motion'));await rest(p)};
  await load('');await p.locator('#start-guide').waitFor({state:'visible'});
  const onboarding=await p.evaluate(()=>({guide:document.getElementById('start-guide').outerHTML,gestures:document.getElementById('gesture-guide').outerHTML,hints:[...atlasApp.svg.querySelectorAll('.cap-hint-tag')].map(n=>n.outerHTML),seen:atlasApp.hasSeenTraceHint}));
  await load('?year=750');const positions=[];
  for(const year of [-403,750,885,2026]){await p.evaluate(y=>atlasApp.jumpToYear(y),year);await rest(p);const r=await p.evaluate(()=>{const h=document.getElementById('scrubber-handle').getBoundingClientRect(),track=document.getElementById('scrubber-track').getBoundingClientRect();return{year:atlasApp.year,actual:(h.x+h.width/2-track.x)/track.width,expected:atlasApp._yearToProgress(atlasApp.year),aria:document.getElementById('scrubber-track').getAttribute('aria-valuenow')}});assert(Math.abs(r.actual-r.expected)<.0003);assert.equal(r.aria,String(year));positions.push(r);await p.locator('#scrubber-dock').screenshot({path:path.join(out,`${variant}-${phone?'phone':'desktop'}-${year}.png`)})}
  await p.evaluate(()=>atlasApp.jumpToYear(750));await rest(p);
  const glide=await p.evaluate(async()=>{const a=atlasApp,track=document.getElementById('scrubber-track'),h=document.getElementById('scrubber-handle');a.playing=true;a._updateAutoplayUi();h.getBoundingClientRect();a.jumpToYear(885);if(a.flyRaf)cancelAnimationFrame(a.flyRaf);a.flyRaf=null;a._cameraTarget=null;a._stopPlaybackPreparation?.();await new Promise(r=>requestAnimationFrame(r));const animation=document.getAnimations().find(a=>['scrubber-handle','scrubber-motion'].includes(a.effect.target?.id)&&['left','transform'].includes(a.transitionProperty));if(!animation)throw Error('Missing timeline glide');animation.pause();await animation.ready;animation.currentTime=110;await new Promise(r=>requestAnimationFrame(r));const box=h.getBoundingClientRect(),rail=track.getBoundingClientRect();const result={wrapped:Boolean(document.getElementById('scrubber-motion')),property:animation.transitionProperty,duration:animation.effect.getComputedTiming().duration,progress:animation.effect.getComputedTiming().progress,position:(box.x+box.width/2-rail.x)/rail.width};return result});
  await p.locator('#scrubber-dock').screenshot({path:path.join(out,`${variant}-${phone?'phone':'desktop'}-glide.png`)});
  // This test deliberately pauses a CSS transition at 110 ms. WebKit keeps
  // that paused animation's override after autoplay stops, so release only
  // the test-created pause before testing real rail input and resize.
  await p.evaluate(()=>{for(const animation of document.getAnimations())if(animation.playState==='paused'&&['scrubber-handle','scrubber-motion'].includes(animation.effect.target?.id))animation.cancel();atlasApp.stopAutoplay()});
  assert.equal(glide.duration,220);assert.equal(glide.property,glide.wrapped?'transform':'left');
  await rest(p);const rail=await p.locator('#scrubber-track').boundingBox();await p.mouse.click(rail.x+rail.width*.61,rail.y+rail.height*.5);await rest(p);const clickedYear=await p.evaluate(()=>atlasApp.year);
  const resizes=[];for(const width of [1440,900,640,390,1280]){await p.setViewportSize({width,height:phone?844:720});await rest(p);const pose=await p.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};return{handle:rect('scrubber-handle'),track:rect('scrubber-track'),bubble:rect('scrubber-Bubble'),dock:rect('scrubber-dock')}});assert(Math.abs((pose.handle.x+pose.handle.width/2-pose.track.x)/pose.track.width-await p.evaluate(()=>atlasApp._yearToProgress(atlasApp.year)))<.0003);resizes.push({width,pose})}
  assert.deepEqual(errors,[]);rows.push({phone,variant,onboarding,positions,glide,clickedYear,resizes,errors});await c.close();console.log('PASS',variant,phone?'phone':'desktop');
 }
 fs.writeFileSync(path.join(out,'in-progress.json'),JSON.stringify({rows},null,2));
 for(const phone of [false,true]){const [a,b]=rows.filter(r=>r.phone===phone);assert.deepEqual(a.onboarding,b.onboarding);assert.equal(a.clickedYear,b.clickedYear);for(let i=0;i<a.resizes.length;i++)for(const id of ['handle','track','bubble','dock'])for(const k of ['x','y','width','height'])assert(Math.abs(a.resizes[i].pose[id][k]-b.resizes[i].pose[id][k])<.3,`Resize mismatch ${phone} ${a.resizes[i].width} ${id}.${k}: ${a.resizes[i].pose[id][k]} versus ${b.resizes[i].pose[id][k]}`);assert(Math.abs(a.glide.progress-b.glide.progress)<1e-6);assert(Math.abs(a.glide.position-b.glide.position)<.0003)}
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({complete:true,sourceHashes:Object.fromEntries(['js/app.js','css/style.css','index.html'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex')])),rows},null,2)+'\n');console.log('PASS: paused positions, unchanged .22s easing, rail input and first-visit onboarding.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
