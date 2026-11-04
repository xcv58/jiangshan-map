#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const urls={baseline:process.env.LAN_MAIN_URL,candidate:process.env.LAN_CANDIDATE_URL};
assert(urls.baseline&&urls.candidate,'Set LAN_MAIN_URL and LAN_CANDIDATE_URL');
const base=process.env.WEB_BASE_REF||'d54411d',root=path.resolve(__dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),rows=[];
 try{
  for(const [variant,url]of Object.entries(urls)){
   const c=await browser.newContext({viewport:{width:1280,height:720}}),p=await c.newPage(),errors=[];p.setDefaultTimeout(90000);
   await c.route(/cloudflareinsights|vercount/,r=>r.fulfill({status:200,body:''}));p.on('pageerror',e=>errors.push(e.message));
   await p.goto(url+'?year=750&compareplay=1');
   await p.waitForFunction(()=>window.timelineComparison?.started&&atlasApp.playing&&atlasApp.year>750);
   assert.equal(await p.evaluate(()=>atlasApp.playSpeed),4);
   await p.keyboard.press('Space');assert.equal(await p.evaluate(()=>atlasApp.playing),false);
   const paused=await p.evaluate(()=>atlasApp.year);await p.waitForTimeout(550);assert.equal(await p.evaluate(()=>atlasApp.year),paused);
   await p.keyboard.press('Space');await p.waitForFunction(y=>atlasApp.playing&&atlasApp.year>y,paused);
   await p.keyboard.press('Space');
   const assets={};
   for(const file of ['js/app.js','css/style.css','js/atlas_snapshots.js','js/atlas_boot.js','js/map_data.js','js/lore_data.js','js/i18n_dict.js','js/atlas_quiz.js']){
    const response=await fetch(new URL(file,url));assert(response.ok);const bytes=Buffer.from(await response.arrayBuffer());
    const expected=variant==='baseline'?execFileSync('git',['show',base+':'+file],{cwd:root,maxBuffer:16*1024*1024}):fs.readFileSync(path.join(root,file));
    assert.equal(sha(bytes),sha(expected),'Wrong LAN asset: '+variant+':'+file);assets[file]=sha(bytes);
   }
   const state=await p.evaluate(()=>({year:atlasApp.year,playing:atlasApp.playing,speed:atlasApp.playSpeed,helper:window.timelineComparison,
    footer:getComputedStyle(document.getElementById('scrubber-dock')).visibility,app:typeof atlasAPI.locate,snapshots:Object.keys(atlasApp.snapshots).length}));
   assert.equal(state.footer,'visible');assert.equal(state.app,'function');assert(!state.helper.error&&state.snapshots>180);assert.deepEqual(errors,[]);
   rows.push({variant,url,state,assets,errors});await c.close();console.log('PASS LAN preview:',variant,url);
  }
  if(process.env.LAN_PREVIEW_OUTPUT)fs.writeFileSync(process.env.LAN_PREVIEW_OUTPUT,JSON.stringify({complete:true,rows},null,2)+'\n');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
