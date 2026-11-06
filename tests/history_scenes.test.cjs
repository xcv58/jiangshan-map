'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const scenes = require('../js/history_scenes_data.js');
const {SceneSession, ScenePlayer, SceneBrowser, SceneNavigation, sourceURL, embedURL, orderScenes, filterScenes,
  timelineScenes, timelineGroups, canPinScene, scenesAtPlace, scenesForEvent} = require('../js/history_scenes.js');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const target = () => ({removed:false, remove(){ this.removed = true; }});
const appFixture = () => ({
  year:750, camera:{x:100,y:200,w:400,h:240,zoom:2.5}, aspect:0.6,
  activePerson:{profiles:[{key:'libai'}]}, activePersonEventIdx:4,
  activeCustomRoute:[{coord:[108,34],year:750}], customRouteStopIdx:1,
  activeTrace:[108.94,34.27], activeTraceLabel:'长安',
  activePolity:{key:'tang'}, eraFocus:{dynastyKey:'tang'}, activeMilestone:null,
  playing:true, musicPlaying:true, dynastyIdx:0, dynasties:[{key:'tang'}],
  projector:{toScreen:(lng,lat)=>[lng*10,lat*10]},
  _cancelCameraAnimation(){}, _commitStageTransform(){},
  stopAutoplay(){ this.playing=false; },
  toggleMusic(){ this.musicPlaying=!this.musicPlaying; },
  jumpToYear(year){ this.year=year; },
  _getViewportAspect(){ return this.aspect; },
  _applyCamera(){ this.renderedCamera={...this.camera}; },
  _renderPersonPinsOverlay(){ this.personRendered=true; },
  _renderPersonChronicleCard(){ this.personCardRendered=true; },
  _drawCustomRouteOverlay(route){ this.renderedRoute=route; },
  _renderCustomRouteCard(){ this.routeCardRendered=true; },
  _renderChroniclePane(dynasty){ this.renderedDynasty= dynasty; },
  openMilestoneBalloon(dynasty,event,options){ this.restoredEvent={dynasty,event,options}; },
});

test('the catalog has twelve distinct provider embeds and bilingual context',()=> {
  assert.equal(scenes.length,12);assert.equal(new Set(scenes.map(s=>s.id)).size,scenes.length);
  assert.equal(new Set(scenes.map(sourceURL)).size,scenes.length);
  assert.deepEqual(Object.fromEntries(['x','youtube','bilibili'].map(provider=>[provider,scenes.filter(s=>s.provider===provider).length])),{x:6,youtube:2,bilibili:4});
  for (const s of scenes) {
    const host={x:'x.com',youtube:'www.youtube.com',bilibili:'www.bilibili.com'}[s.provider];
    assert.equal(new URL(sourceURL(s)).hostname,host);assert(s.era);
    assert(s.range[0]<=s.year && s.year<=s.range[1]);
    assert(s.coord.length===2 && s.coord.every(Number.isFinite));
    assert(s.duration>0 && Number.isInteger(s.duration));
    for(const key of ['title','date','place','summary','history','caveat','credit']) {
      assert(s[key].zh && s[key].en,key);
    }
    assert(s.sources.every(source=>new URL(source.url).protocol==='https:'));
  }
});
test('history is chronological while literary stories form their own group',()=> {
  const original=scenes.map(s=>s.id),ordered=orderScenes(scenes);
  const firstStory=ordered.findIndex(s=>s.kind==='literature');
  assert(ordered.slice(firstStory).every(s=>s.kind==='literature'));
  for(let i=1;i<firstStory;i++)assert(ordered[i].range[0]>=ordered[i-1].range[0]);
  assert(ordered.findIndex(s=>s.id==='hongmen-banquet')<ordered.findIndex(s=>s.id==='xuanwu-gate'));
  assert.deepEqual(scenes.map(s=>s.id),original);
});
test('era and duration filters intersect without modifying the catalog',()=> {
  assert.deepEqual(filterScenes(scenes,{era:'donghan',length:'long'}).map(s=>s.id),['peach-garden','three-visits-film']);
  assert.deepEqual(filterScenes(scenes,{era:'xihan',length:'short'}),[]);
  assert.deepEqual(filterScenes(scenes,{era:'qin',length:'short'}).map(s=>s.id),['hongmen-banquet','hongmen-film']);
  const boundary=[{...scenes[0],duration:180}];
  assert.equal(filterScenes(boundary,{length:'short'}).length,1);
  assert.equal(filterScenes(boundary,{length:'long'}).length,0);
});
test('unknown story dates stay off the event timeline and uncertain places stay off the map',()=> {
  const timeline=timelineScenes(scenes);
  assert(timeline.every(s=>s.kind!=='literature'));assert(!timeline.some(s=>s.id==='sima-guang'));
  for(const s of scenes.filter(s=>s.approximate || s.kind==='literature'))assert.equal(canPinScene(s,s.year,20),false);
  const gate=scenes.find(s=>s.id==='xuanwu-gate');
  assert.equal(canPinScene(gate,626,3.2),true);assert.equal(canPinScene(gate,625,8),false);assert.equal(canPinScene(gate,626,2),false);
});
test('a disabled map layer removes old pins without measuring layout',()=> {
  let removed=0;
  const state={browser:{opened:false},app:{challenge:null,svg:{getBoundingClientRect(){throw Error('unexpected layout read');}}},
    layer:{checked:false},scenes,pins:new Map([['old',{remove(){removed++;}}]])};
  SceneNavigation.prototype.renderMap.call(state);
  assert.equal(removed,1);assert.equal(state.pins.size,0);
});
test('city entries distinguish Xianyang from Chang’an and include both disputed cottage traditions',()=> {
  assert.deepEqual(scenesAtPlace(scenes,[108.94,34.27]).map(s=>s.id),['changan-han-crisis','xuanwu-gate']);
  assert.deepEqual(scenesAtPlace(scenes,[108.71,34.36]).map(s=>s.id),['jing-ke']);
  for(const coord of [[112.14,32.04],[112.53,32.99]]) {
    const ids=scenesAtPlace(scenes,coord).map(s=>s.id);
    assert(ids.includes('three-visits'));assert(ids.includes('three-visits-film'));assert(!ids.includes('sima-guang'));
  }
  assert.deepEqual(scenesAtPlace(scenes,null),[]);
});
test('event watch buttons require both a matching year and a matching place',()=> {
  assert.deepEqual(scenesForEvent(scenes,{year:-226,coord:[116.4,39.9]}),[]);
  assert.deepEqual(scenesForEvent(scenes,{year:626,coord:[108.94,34.27]}).map(s=>s.id),['xuanwu-gate']);
  assert.deepEqual(scenesForEvent(scenes,{year:626,coord:[116.4,39.9]}),[]);
  assert.deepEqual(scenesForEvent(scenes,{year:626}),[]);
});
test('timeline clustering preserves every eligible clip and separates the clickable groups',()=> {
  const progress=year=>(year+403)/2430,width=400;
  const groups=timelineGroups(scenes,progress,width);
  assert.deepEqual(groups.flatMap(g=>g.scenes.map(s=>s.id)).sort(),timelineScenes(scenes).map(s=>s.id).sort());
  for(let i=1;i<groups.length;i++)assert((groups[i].position-groups[i-1].position)*width>=40);
  assert.deepEqual(timelineGroups(scenes,progress,0),[]);
});
test('official player URLs disable autoplay, retain provider controls and include YouTube origin',()=> {
  for(const s of scenes.filter(s=>s.provider!=='x')) {
    const url=new URL(embedURL(s,'http://192.168.8.31:8900'));
    assert.equal(url.searchParams.get('autoplay'),'0');
    if(s.provider==='youtube') {
      assert.equal(url.hostname,'www.youtube.com');assert.equal(url.searchParams.get('origin'),'http://192.168.8.31:8900');
      assert.equal(url.searchParams.get('enablejsapi'),'1');assert.equal(url.searchParams.get('playsinline'),'1');
    } else {assert.equal(url.hostname,'player.bilibili.com');assert.equal(url.searchParams.get('bvid'),s.videoId);}
  }
  assert.throws(()=>embedURL({provider:'youtube',videoId:'../../evil'},'http://localhost'));
  assert.throws(()=>sourceURL({provider:'untrusted',videoId:'https://evil.example'}));
});
test('the Hongmen scene uses the original creator post and the 206 BCE Lintong region',()=> {
  const s=scenes.find(s=>s.id==='hongmen-banquet');
  assert.equal(s.year,-206);assert.equal(s.handle,'PixelAigc');
  assert(s.coord[0]>109 && s.coord[0]<110 && s.coord[1]>34 && s.coord[1]<35);
});
test('the three visits do not choose a precise cottage location from disputed traditions',()=> {
  const s=scenes.find(s=>s.id==='three-visits');
  assert.deepEqual(s.range,[207,208]);assert.equal(s.approximate,true);
  assert.match(s.place.en,/disputed/);assert.match(s.caveat.en,/Nanyang.*Xiangyang/);
});
test('Wu Song is a literary scene with a contextual year and no incident pin',()=> {
  const s=scenes.find(s=>s.id==='wu-song-tiger');
  assert.equal(s.kind,'literature');assert.equal(s.approximate,true);
  assert.match(s.history.en,/not a historical incident/);
  assert.match(s.caveat.en,/not to date the story/);assert.match(s.credit.en,/unverified/);
});
test('Jing Ke is anchored to 227 BCE Xianyang rather than the 226 BCE Ji campaign',()=> {
  const s=scenes.find(s=>s.id==='jing-ke');
  assert.equal(s.year,-227);assert.match(s.place.zh,/咸阳/);
  assert(s.coord[0]<110 && s.coord[1]<35);
  assert.match(s.credit.en,/unverified/);
});
test('the childhood anecdote retains uncertain dates and has no precise incident marker',()=> {
  const s=scenes.find(s=>s.id==='sima-guang');
  assert.equal(s.approximate,true);assert(s.range[1]>s.range[0]);
  assert.match(s.place.en,/uncertain/);assert.match(s.caveat.en,/not a claim/);
});
test('watching pauses playback and music while preserving the original exploration state',()=> {
  const app=appFixture(),year=app.year,camera={...app.camera};
  const person=app.activePerson,route=app.activeCustomRoute,trace=app.activeTrace,polity=app.activePolity;
  const session=new SceneSession(app);session.frame(scenes[0]);
  assert.equal(app.year,-227);assert.equal(app.playing,false);assert.equal(app.musicPlaying,false);
  assert.equal(app.activePerson,null);assert.equal(app.activePolity,null);
  session.restore();
  assert.equal(app.year,year);assert.deepEqual(app.camera,camera);
  assert.equal(app.activePerson,person);assert.equal(app.activeCustomRoute,route);
  assert.equal(app.activeTrace,trace);assert.equal(app.activePolity,polity);
  assert.equal(app.activePersonEventIdx,4);assert.equal(app.customRouteStopIdx,1);
  assert.equal(app.playing,false);assert.equal(app.musicPlaying,false);
  assert.equal(app.personRendered,true);
  assert.equal(app.personCardRendered,true);
});
test('returning to a custom route redraws its overlay and card without a camera flight',()=> {
  const app=appFixture();app.activePerson=null;app.activeTrace=null;
  const route=app.activeCustomRoute,camera={...app.camera};
  const session=new SceneSession(app);session.frame(scenes[0]);
  app.renderedRoute=null;session.restore();
  assert.equal(app.renderedRoute,route);assert.equal(app.routeCardRendered,true);
  assert.deepEqual(app.camera,camera);assert.equal(app.customRouteStopIdx,1);
});
test('returning clears modes opened while watching and forces the saved person card to rebuild',()=> {
  const app=appFixture(),person=app.activePerson,route=app.activeCustomRoute,trace=app.activeTrace,closed=[];
  app.closeGenealogyCard=()=>{closed.push('genealogy');app.activePerson=null;app.activeTrace=null;};
  app.clearCustomRoute=()=>{closed.push('route');app.activeCustomRoute=null;};
  app.closeMilestoneBalloon=()=>{closed.push('event');app.activeMilestone=null;};
  const session=new SceneSession(app);session.frame(scenes[0]);
  app.activePerson={profiles:[{key:'sushi'}]};app.activeTrace=[116.4,39.9];
  app.activeCustomRoute=[{coord:[116.4,39.9]}];app.activeMilestone={year:626};
  app._lastPersonCardKey='stale';session.restore();
  assert.deepEqual(closed,['genealogy','route','event']);
  assert.equal(app.activePerson,person);assert.equal(app.activeCustomRoute,route);assert.equal(app.activeTrace,trace);
  assert.equal(app._lastPersonCardKey,null);assert.equal(app.personCardRendered,true);
});
test('returning preserves original card visibility and sidebar layout',()=> {
  const app=appFixture(),flags=new Set(['has-active-person','has-active-genealogy']);
  const nodes={'genealogy-card':{className:'is-sheet-expanded'},'journey-card':{className:'is-hidden'},
    'viewport-frame':{classList:{contains:name=>flags.has(name),toggle(name,on){if(on)flags.add(name);else flags.delete(name);}}}};
  app._id=id=>nodes[id];app.paneCollapsed=true;app.mobileChronicleOpen=false;app._paneAutoCollapsed=true;
  app.toggleChroniclePane=value=>{app.paneCollapsed=value;};app.toggleMobileChronicle=value=>{app.mobileChronicleOpen=value;};
  const session=new SceneSession(app);session.frame(scenes[0]);
  nodes['genealogy-card'].className='is-hidden';nodes['journey-card'].className='is-custom-route';flags.clear();
  app.paneCollapsed=false;app.mobileChronicleOpen=true;app._paneAutoCollapsed=false;
  session.restore();
  assert.equal(nodes['genealogy-card'].className,'is-sheet-expanded');assert.equal(nodes['journey-card'].className,'is-hidden');
  assert.equal(app.paneCollapsed,true);assert.equal(app.mobileChronicleOpen,false);assert.equal(app._paneAutoCollapsed,true);
  assert.deepEqual([...flags].sort(),['has-active-genealogy','has-active-person']);
});
test('switching scenes never replaces the original return snapshot',()=> {
  const app=appFixture(),session=new SceneSession(app);session.capture();
  session.frame(scenes[0]);session.frame(scenes[1]);session.frame(scenes[2]);
  session.restore();assert.equal(app.year,750);assert.equal(app.camera.x,100);
});
test('returning after a viewport resize retains the original center and zoom',()=> {
  const app=appFixture(),session=new SceneSession(app);session.frame(scenes[0]);
  app.aspect=0.8;session.restore();
  assert.equal(app.camera.x+app.camera.w/2,300);
  assert.equal(app.camera.y+app.camera.h/2,320);
  assert.equal(app.camera.h,320);assert.equal(app.camera.zoom,2.5);
});
test('a manually selected event can return after watching, without resuming playback',()=> {
  const app=appFixture(),event={year:747};
  app.activeMilestone={milestone:event,siteIdx:2,isAuto:false};
  const session=new SceneSession(app);session.frame(scenes[1]);session.restore();
  assert.equal(app.restoredEvent.event,event);assert.equal(app.restoredEvent.options.siteIdx,2);
  assert.equal(app.playing,false);
});
test('a workflow takeover discards its return snapshot before a rapid reopen',async()=> {
  const prior=global.requestAnimationFrame,frames=[];
  global.requestAnimationFrame=callback=>frames.push(callback);
  try {
    const state={opened:true,request:0,player:{stop(){}},host:{replaceChildren(){}},syncCameraObserver(){},
      panel:{hidden:false},workspace:{classList:{remove(){}}},trigger:{setAttribute(){}},setHash(){},
      session:{saved:{old:true}},app:{challenge:null}};
    const close=SceneBrowser.prototype.close.call(state,false);
    assert.equal(state.session.saved,null);
    state.opened=true;state.request++;state.session.saved={new:true};frames.shift()();await close;
    assert.deepEqual(state.session.saved,{new:true});
  } finally {global.requestAnimationFrame=prior;}
});
test('constructing the player loads no third-party scripts or video',()=> {
  let requests=0;new ScenePlayer(()=>{requests++;},()=>{});
  assert.equal(requests,0);
});
test('the player uses the official post ID and retains provider cards and attribution',async()=> {
  const states=[],mount=target(),frame=target();let args;
  const player=new ScenePlayer(async()=>({createTweet(...a){args=a;return frame;}}),s=>states.push(s));
  await player.load(scenes[0],mount,'en');
  assert.equal(args[0],scenes[0].postId);assert.equal(args[1],mount);
  assert.equal(args[2].cards,'visible');assert.equal(args[2].dnt,true);
  assert.deepEqual(states,['loading','ready']);assert.match(frame.title,/Jing Ke/);
  player.stop();assert.equal(mount.removed,true);
});
test('closing while the platform script loads cannot mount a late player',async()=> {
  const script=deferred(),states=[],mount=target();let renders=0;
  const player=new ScenePlayer(()=>script.promise,s=>states.push(s));
  const pending=player.load(scenes[0],mount,'en');player.stop();
  script.resolve({createTweet(){renders++;return target();}});await pending;
  assert.equal(renders,0);assert.equal(mount.removed,true);assert.deepEqual(states,['loading']);
});
test('rapid scene switching removes late frames and only the latest result becomes ready',async()=> {
  const first=deferred(),second=deferred(),states=[],oldFrame=target(),newFrame=target();
  const widgets={createTweet(id){return id===scenes[0].postId?first.promise:second.promise;}};
  const player=new ScenePlayer(async()=>widgets,s=>states.push(s));
  const oldMount=target(),newMount=target();
  const a=player.load(scenes[0],oldMount,'en');await Promise.resolve();
  const b=player.load(scenes[1],newMount,'en');await Promise.resolve();
  second.resolve(newFrame);await b;first.resolve(oldFrame);await a;
  assert.equal(oldMount.removed,true);assert.equal(oldFrame.removed,true);
  assert.equal(newMount.removed,false);assert.deepEqual(states,['loading','loading','ready']);
  player.stop();
});
test('a failed embed can retry without leaving the old player mounted',async()=> {
  let attempts=0;const states=[];
  const player=new ScenePlayer(async()=>{
    if(++attempts===1)throw Error('blocked');
    return {createTweet:async()=>target()};
  },s=>states.push(s));
  const first=target();await player.load(scenes[0],first,'en');
  assert.equal(first.removed,true);assert.equal(player.target,null);
  await player.load(scenes[0],target(),'en');
  assert.deepEqual(states,['loading','error','loading','ready']);player.stop();
});
test('a timed-out render is removed even if the provider later returns a frame',async()=> {
  const reply=deferred(),states=[],frame=target(),mount=target();
  const player=new ScenePlayer(async()=>({createTweet:()=>reply.promise}),s=>states.push(s),5);
  await player.load(scenes[0],mount,'en');
  assert.deepEqual(states,['loading','error']);assert.equal(mount.removed,true);
  reply.resolve(frame);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(frame.removed,true);
});
test('switching from YouTube to Bilibili destroys the previous player before mounting the next',async()=> {
  let destroyed=0,xRequests=0;const states=[],frames=[];
  const player=new ScenePlayer(()=>{xRequests++;},s=>states.push(s),18000,async(scene,mount,lang,active,own)=>{
    const frame=target();frames.push(frame);own(()=>{destroyed++;frame.remove();});return frame;
  });
  const youtube=scenes.find(s=>s.provider==='youtube'),bili=scenes.find(s=>s.provider==='bilibili');
  await player.load(youtube,target(),'en');assert.match(frames[0].title,/YouTube/);
  await player.load(bili,target(),'en');assert.equal(destroyed,1);assert.equal(frames[0].removed,true);
  assert.match(frames[1].title,/Bilibili/);assert.equal(xRequests,0);
  player.stop();assert.equal(destroyed,2);assert.deepEqual(states,['loading','ready','loading','ready']);
});
test('a late provider cleanup cannot replace or destroy the new player',async()=> {
  const reply=deferred();let release,oldDestroyed=0,newDestroyed=0;
  const youtube=scenes.find(s=>s.provider==='youtube'),bili=scenes.find(s=>s.provider==='bilibili');
  const player=new ScenePlayer(()=>{},()=>{},18000,async(scene,mount,lang,active,own)=>{
    if(scene===youtube){release=own;return reply.promise;}
    own(()=>{newDestroyed++;});return target();
  });
  const pending=player.load(youtube,target(),'en');
  await player.load(bili,target(),'en');release(()=>{oldDestroyed++;});reply.resolve(target());await pending;
  assert.equal(oldDestroyed,1);assert.equal(newDestroyed,0);player.stop();assert.equal(newDestroyed,1);
});
test('provider errors after readiness stop playback and stale errors do not affect a retry',async()=> {
  const states=[],failures=[];let destroyed=0;
  const player=new ScenePlayer(()=>{},state=>states.push(state),18000,async(scene,mount,lang,active,own,fail)=>{
    failures.push(fail);own(()=>{destroyed++;});return target();
  });
  const youtube=scenes.find(s=>s.provider==='youtube');
  await player.load(youtube,target(),'en');failures[0]();
  assert.equal(player.target,null);assert.equal(destroyed,1);
  await player.load(youtube,target(),'en');failures[0]();
  assert.deepEqual(states,['loading','ready','error','loading','ready']);assert(player.target);player.stop();
});
test('a faulty provider destroy still removes its frame and clears player ownership',async()=> {
  const mount=target();
  const player=new ScenePlayer(()=>{},()=>{},18000,async(scene,mount,lang,active,own)=>{
    own(()=>{throw Error('provider destroy failed');});return target();
  });
  await player.load(scenes.find(s=>s.provider==='youtube'),mount,'en');
  player.stop();assert.equal(mount.removed,true);assert.equal(player.target,null);
});
