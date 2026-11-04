#!/usr/bin/env node
// Layout and trusted-control checks, separate from timed FPS collection.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const urls={baseline:process.env.WEB_BASE_URL,candidate:process.env.ATLAS_URL};
assert(urls.baseline&&urls.candidate,'Set WEB_BASE_URL and ATLAS_URL');
const out=process.env.RESPONSIVE_OUTPUT||'/tmp/atlas-responsive';fs.mkdirSync(out,{recursive:true});
const sizes=[[320,568],[390,844],[640,900],[768,1024],[900,640],[1024,768],[1280,720],[1440,900],[1920,1080]];
const rest=async p=>{await p.waitForFunction(()=>atlasApp._fullSnapshotsLoaded&&!atlasApp.flyRaf&&atlasApp._camRaf===null&&atlasApp._cameraSettleTimer===null);await p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})};
const pose=p=>p.evaluate(()=>{
 const ids=['nav-bar','viewport-frame','scrubber-dock','scrubber-track','scrubber-Bubble','act-autoplay','act-play-speed','act-step-prev','act-step-next'];
 return {width:innerWidth,height:innerHeight,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),year:atlasApp.year,camera:{...atlasApp.camera},
  boxes:Object.fromEntries(ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}]}))};
});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),rows=[];
 try{
  for(const [width,height]of sizes)for(const variant of ['baseline','candidate']){
   const context=await browser.newContext({viewport:{width,height},isMobile:width<=900,hasTouch:width<=900});
   await context.route(/cloudflareinsights|vercount/,r=>r.fulfill({status:200,body:''}));
   const p=await context.newPage(),errors=[],failed=[];p.setDefaultTimeout(90000);
   p.on('pageerror',e=>errors.push(e.stack||e.message));p.on('requestfailed',r=>failed.push(r.url()));
   await p.goto(urls[variant]+'?year=750');await rest(p);
   await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
   const initial=await pose(p);assert(initial.boxes['viewport-frame'].width>100&&initial.boxes['viewport-frame'].height>100);
   const rail=await p.locator('#scrubber-track').boundingBox();
   await p.mouse.click(rail.x+rail.width*.61,rail.y+rail.height*.5);await rest(p);const railYear=await p.evaluate(()=>atlasApp.year);
   await p.locator('#act-step-next').click();await rest(p);const nextYear=await p.evaluate(()=>atlasApp.year);assert(nextYear>railYear);
   await p.locator('#act-layers-menu').click();await p.locator('label:has(#chk-prov-names)').click();
   assert(await p.locator('#chk-prov-names').isChecked());await p.locator('label:has(#chk-prov-names)').click();
   await p.locator('#act-layers-menu').click();
   const panel=await p.locator('#act-mobile-chronicle').isVisible()?'#act-mobile-chronicle':'#act-toggle-pane';
   await p.locator(panel).click();await rest(p);const panelState=await p.evaluate(()=>({workspace:document.getElementById('workspace-body').className,expanded:document.getElementById('act-mobile-chronicle').getAttribute('aria-expanded')}));
   await p.locator(panel).click();await rest(p);
   await p.evaluate(()=>{atlasApp.jumpToYear(750);atlasApp.resetCamera()});await rest(p);
   const box=await p.locator('#atlas-svg').boundingBox(),x=box.x+box.width*.62,y=box.y+box.height*.4;
   await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+30,y+12,{steps:6});await p.mouse.up();await rest(p);
   const pan=await pose(p);assert(Math.abs(pan.camera.x-initial.camera.x)>.1);
   await p.mouse.wheel(0,-100);await rest(p);const zoom=await pose(p);assert(zoom.camera.w<pan.camera.w);
   await p.locator('#act-reset-camera').click();await rest(p);
   await p.screenshot({path:path.join(out,variant+'-'+width+'x'+height+'.png'),animations:'disabled'});
   await p.setViewportSize({width:height,height:width});await rest(p);const rotated=await pose(p);
   assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
   rows.push({variant,width,height,initial,railYear,nextYear,panelState,pan,zoom,rotated,errors,failed});
   await context.close();console.log('PASS responsive',variant,width+'x'+height);
  }
  for(const [width,height]of sizes){
   const [a,b]=rows.filter(r=>r.width===width&&r.height===height);
   assert.equal(b.railYear,a.railYear);assert.equal(b.nextYear,a.nextYear);assert.deepEqual(b.panelState,a.panelState);
   for(const state of ['initial','pan','zoom','rotated']){
    assert(b[state].overflow<=Math.max(1,a[state].overflow+.51),'New horizontal overflow');
    for(const [id,box]of Object.entries(a[state].boxes))for(const key of ['x','y','width','height'])assert(Math.abs(box[key]-b[state].boxes[id][key])<.51,`${width} ${state} ${id}.${key}`);
    for(const key of ['x','y','w','h'])assert(Math.abs(a[state].camera[key]-b[state].camera[key])<.1,`${width} ${state} camera.${key}`);
   }
  }
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({complete:true,viewports:sizes,rows},null,2)+'\n');
  console.log('PASS: nine viewport sizes, rotation, layer controls, chronology panel, timeline/year navigation, trusted pan/zoom; no new layout overflow.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
