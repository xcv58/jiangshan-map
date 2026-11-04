#!/usr/bin/env node
// Visual, input and layer invariants for the bounded translation plane.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const out=process.env.CAMERA_PLANE_OUTPUT||'/tmp/atlas-camera-plane';
const urls={baseline:process.env.WEB_BASE_URL||'http://127.0.0.1:8806/',candidate:process.env.ATLAS_URL||'http://127.0.0.1:8807/'};
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),rows=[];
 try{
  for(const phone of [false,true])for(const variant of ['baseline','candidate']){
   const c=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:720},deviceScaleFactor:2,isMobile:phone,hasTouch:phone});
   await c.route(/cloudflareinsights|vercount/,r=>r.fulfill({status:200,body:''}));const p=await c.newPage(),errors=[];
   p.on('pageerror',e=>errors.push(e.message));await p.goto(urls[variant]+'?year=750',{timeout:90000});
   await p.waitForFunction(()=>atlasApp?._fullSnapshotsLoaded&&!atlasApp.flyRaf&&atlasApp._camRaf===null&&atlasApp._cameraSettleTimer===null);await p.evaluate(()=>document.fonts.ready);
   await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
   const cdp=await c.newCDPSession(p);let layers=[];await cdp.send('DOM.enable');await cdp.send('LayerTree.enable');cdp.on('LayerTree.layerTreeDidChange',d=>layers=d.layers||[]);
   const states=[];
   if(variant==='candidate')assert.equal(await p.evaluate(()=>{atlasApp._applyCamera();return !!atlasApp._panPlaneRect}),false,'Idle camera must not allocate a pan plane');
   for(const [name,dx,dy,zoom]of [['pan-a',48,22,1],['pan-b',112,40,1],['rebase',420,-60,1],['zoom',460,-80,.8]]){
    const state=await p.evaluate(({dx,dy,zoom})=>{
     const a=atlasApp;if(!window.planeStart)planeStart={...a.camera};const before=a.svg.getAttribute('viewBox'),r=a._getUnscaledSvgRect();
     const scale=Math.min(r.width/planeStart.w,r.height/planeStart.h);
     a.camera={x:planeStart.x-dx/scale,y:planeStart.y-dy/scale,w:planeStart.w*zoom,h:planeStart.h*zoom,zoom:1000/(planeStart.w*zoom)};
     a._applyCamera();clearTimeout(a._cameraSettleTimer);a._cameraSettleTimer=null;
     const anchor=a._clientToSvgPoint(r.left+r.width*.5,r.top+r.height*.5);
     const logical=a._getUnscaledSvgRect();
     return {before,after:a.svg.getAttribute('viewBox'),camera:{...a.camera},anchor,rect:{x:logical.x,y:logical.y,width:logical.width,height:logical.height},plane:!!a._panPlaneRect,transform:a._stageWrap.style.transform,clip:a._stageWrap.style.clipPath};
    },{dx,dy,zoom});
    assert(Math.abs(state.anchor[0]-(state.camera.x+state.camera.w*.5))<1e-7);assert(Math.abs(state.anchor[1]-(state.camera.y+state.camera.h*.5))<1e-7);
    if(variant==='candidate'){
     if(name.startsWith('pan-')){assert(state.plane);assert.equal(state.before,state.after)}
     else assert(!state.plane,'Rebase and zoom use canonical SVG geometry');
    }
    const file=`${variant}-${phone?'phone':'desktop'}-${name}.png`;await p.locator('#viewport-frame').screenshot({path:path.join(out,file)});
    states.push({name,...state,file,layers:layers.map(l=>({id:l.layerId,node:l.backendNodeId,width:l.width,height:l.height,paintCount:l.paintCount,drawsContent:l.drawsContent,transform:l.transform}))});
   }
   if(variant==='candidate'){
    const scene=s=>s.layers.find(l=>l.drawsContent&&Math.abs(l.width-(s.rect.width+512))<=1&&Math.abs(l.height-(s.rect.height+512))<=1);
    const first=scene(states[0]),second=scene(states[1]);assert(first&&second,'Missing bounded scene layer');assert.equal(second.id,first.id);assert.equal(second.paintCount,first.paintCount,'Translation repainted the scene');
   }
   await p.evaluate(()=>atlasApp._finishCameraMotion());assert.equal(await p.evaluate(()=>atlasApp._stageWrap.style.transform),'');
   assert.equal(await p.evaluate(()=>atlasApp._stageWrap.style.willChange),'');assert.equal(await p.evaluate(()=>atlasApp._stageWrap.style.clipPath),'');
   assert.deepEqual(errors,[]);rows.push({phone,variant,states,errors});await c.close();
  }
  for(const phone of [false,true]){const [b,c]=rows.filter(r=>r.phone===phone);for(let i=0;i<b.states.length;i++){assert.deepEqual(c.states[i].camera,b.states[i].camera);assert.deepEqual(c.states[i].rect,b.states[i].rect)}}
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({complete:true,rows},null,2)+'\n');console.log('PASS: bounded translation, rebasing, zoom fallback, input coordinates and hint cleanup on desktop/phone.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
