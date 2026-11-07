'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const scenes = require('../js/history_scenes_data.js');
const {SceneSession, ScenePlayer, SceneBrowser, SceneNavigation, sourceURL, embedURL, orderScenes, filterScenes,
  timelineScenes, timelineGroups, canPinScene, scenesAtPlace, scenesForEvent} = require('../js/history_scenes.js');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const target = () => ({removed:false, remove(){ this.removed = true; }});
function youtubeHarness() {
  const instances = [];
  const context = {module:{exports:{}}, URL, URLSearchParams, setTimeout, clearTimeout,
    document:{createElement:()=>target()},
    window:{location:{origin:'http://localhost'}, YT:{Player:function(frame, options) {
      const api = {state:-1, position:37, pauses:0, destroyed:0,
        getPlayerState(){return this.state;},
        change(state){this.state=state;options.events.onStateChange({data:state});},
        pauseVideo(){this.pauses++;this.change(2);},
        destroy(){this.destroyed++;},
      };
      instances.push(api);
      queueMicrotask(()=>options.events.onReady({target:api}));
      return api;
    }}},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../js/history_scenes.js'),'utf8'),context);
  const states=[], player=new context.module.exports.ScenePlayer(()=>{},state=>states.push(state));
  const mount={...target(),children:[],append(frame){this.children.push(frame);}};
  return {instances, states, player, mount, context};
}
function browserHarness() {
  const harness=youtubeHarness(),{context}=harness,nodes=new Map(),events=new EventTarget();
  let hidden=false;
  const element=()=>Object.assign(new EventTarget(),target(),{append(){},setAttribute(){}});
  Object.assign(context.document,{
    addEventListener:events.addEventListener.bind(events),
    getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},
    createElementNS:element,
  });
  Object.defineProperty(context.document,'hidden',{get:()=>hidden});
  context.window.addEventListener=()=>{};
  context.MutationObserver=context.ResizeObserver=class{observe(){}};
  const Browser=context.module.exports.SceneBrowser;
  Browser.prototype.render=Browser.prototype.renderStatus=()=>{};
  Browser.prototype.hashScene=()=>null;
  const browser=new Browser(appFixture(),scenes);
  const music=context.document.getElementById('act-music');
  music.addEventListener('click',()=>browser.app.toggleMusic());
  return {...harness,browser,music:()=>music.dispatchEvent(new Event('click')),
    visibility(value){hidden=value;events.dispatchEvent(new Event('visibilitychange'));}};
}
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

test('the catalog has fifteen distinct X and YouTube embeds and bilingual context',()=> {
  assert.equal(scenes.length,15);assert.equal(new Set(scenes.map(s=>s.id)).size,scenes.length);
  assert.equal(new Set(scenes.map(sourceURL)).size,scenes.length);
  assert.deepEqual(Object.fromEntries(['x','youtube'].map(provider=>[provider,scenes.filter(s=>s.provider===provider).length])),{x:9,youtube:6});
  for (const s of scenes) {
    const host={x:'x.com',youtube:'www.youtube.com'}[s.provider];
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
  const firstStory=ordered.findIndex(s=>['literature','fiction'].includes(s.kind));
  assert(ordered.slice(firstStory).every(s=>['literature','fiction'].includes(s.kind)));
  for(let i=1;i<firstStory;i++)assert(ordered[i].range[0]>=ordered[i-1].range[0]);
  assert(ordered.findIndex(s=>s.id==='hongmen-banquet')<ordered.findIndex(s=>s.id==='xuanwu-gate'));
  assert.deepEqual(scenes.map(s=>s.id),original);
});
test('era and duration filters intersect without modifying the catalog',()=> {
  assert.deepEqual(filterScenes(scenes,{era:'jin-mongol',length:'long'}).map(s=>s.id),['yehuling']);
  assert.deepEqual(filterScenes(scenes,{era:'donghan',length:'long'}).map(s=>s.id),['baima-yan-liang','hulao-three-heroes','warm-wine-hua-xiong']);
  assert.deepEqual(filterScenes(scenes,{era:'xihan',length:'short'}),[]);
  assert.deepEqual(filterScenes(scenes,{era:'qin',length:'short'}).map(s=>s.id),['deer-called-horse','hongmen-banquet','hongmen-film','hongmen-yang','assassin-letter']);
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
  assert.deepEqual(scenesAtPlace(scenes,[108.94,34.27]).map(s=>s.id),['xuanwu-gate']);
  assert.deepEqual(scenesAtPlace(scenes,[108.71,34.36]).map(s=>s.id),['jing-ke','deer-called-horse']);
  for(const coord of [[112.14,32.04],[112.53,32.99]]) {
    const ids=scenesAtPlace(scenes,coord).map(s=>s.id);
    assert.deepEqual(ids,['three-visits']);
  }
  assert.deepEqual(scenesAtPlace(scenes,null),[]);
});
test('event watch buttons require both a matching year and a matching place',()=> {
  assert.deepEqual(scenesForEvent(scenes,{year:-226,coord:[116.4,39.9]}),[]);
  assert.deepEqual(scenesForEvent(scenes,{year:-207,coord:[115.031,37.221]}),[]);
  assert.deepEqual(scenesForEvent(scenes,{year:-207,coord:[108.70,34.33]}).map(s=>s.id),['deer-called-horse']);
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
    assert.equal(url.hostname,'www.youtube.com');assert.equal(url.searchParams.get('origin'),'http://192.168.8.31:8900');
    assert.equal(url.searchParams.get('enablejsapi'),'1');assert.equal(url.searchParams.get('playsinline'),'1');
  }
  assert.throws(()=>embedURL({provider:'youtube',videoId:'../../evil'},'http://localhost'));
  assert.throws(()=>sourceURL({provider:'untrusted',videoId:'https://evil.example'}));
  assert.throws(()=>embedURL({provider:'bilibili',videoId:'BV1N4fhBGEFt'},'http://localhost'));
});
test('the Hongmen scene uses the original creator post and the 206 BCE Lintong region',()=> {
  const s=scenes.find(s=>s.id==='hongmen-banquet');
  assert.equal(s.year,-206);assert.equal(s.handle,'PixelAigc');
  assert(s.coord[0]>109 && s.coord[0]<110 && s.coord[1]>34 && s.coord[1]<35);
});
test('yang’s Hongmen version shares the event context while retaining its own creator and source',()=> {
  const scene=scenes.find(s=>s.id==='hongmen-yang');
  assert.equal(sourceURL(scene),'https://x.com/xingliuyang/status/2118440392043508206');
  assert.equal(scene.duration,82);assert.equal(scene.year,-206);
  assert.match(scene.credit.en,/@xingliuyang/);
  assert.deepEqual(scenesForEvent(scenes,{year:-206,coord:[109.26,34.43]}).map(s=>s.id),['hongmen-banquet','hongmen-film','hongmen-yang']);
});
test('the three visits do not choose a precise cottage location from disputed traditions',()=> {
  const s=scenes.find(s=>s.id==='three-visits');
  assert.deepEqual(s.range,[207,208]);assert.equal(s.approximate,true);
  assert.match(s.place.en,/disputed/);assert.match(s.caveat.en,/Nanyang.*Xiangyang/);
});
test('both Wu Song clips share the literary setting and keep distinct X posts',()=> {
  const s=scenes.find(s=>s.id==='wu-song-tiger');
  const anne=scenes.find(s=>s.id==='wu-song-tiger-anne');
  assert.equal(s.kind,'literature');assert.equal(s.approximate,true);
  assert.match(s.history.en,/not a historical incident/);
  assert.match(s.caveat.en,/not to date the story/);assert.match(s.credit.en,/unverified/);
  assert.equal(anne.kind,s.kind);assert.equal(anne.year,s.year);
  assert.equal(sourceURL(anne),'https://x.com/xiaoobtc/status/2119019145752957174');
  assert.equal(anne.duration,30);assert.match(anne.credit.en,/original creator unverified/);
  assert.deepEqual(scenesAtPlace(scenes,[115.8,36.1]).map(scene=>scene.id),[s.id,anne.id]);
  assert.deepEqual(scenesForEvent(scenes,{year:1115,coord:[115.8,36.1]}),[]);
});
test('original fiction and novel duels stay out of historical pins, events and timeline markers',()=> {
  const storyIds=['assassin-letter','hulao-three-heroes','warm-wine-hua-xiong'];
  for (const id of storyIds) {
    const scene=scenes.find(s=>s.id===id);
    assert(!timelineScenes(scenes).includes(scene));
    assert.equal(canPinScene(scene,scene.year,20),false);
    assert(!scenesForEvent(scenes,{year:scene.year,coord:scene.coord}).includes(scene));
  }
  // The kind itself prevents fictional pins, even if a later entry omits approximate.
  const fiction={...scenes.find(s=>s.id==='assassin-letter'),approximate:false};
  assert.equal(canPinScene(fiction,fiction.year,20),false);
  assert.deepEqual(timelineScenes([fiction]),[]);
  assert.equal(fiction.credit.en.includes('Zhang Bocheng and Li Bixian'),true);
  assert.match(scenes.find(s=>s.id==='warm-wine-hua-xiong').history.en,/Sun Jian.*Yangren/);
});
test('Baima connects its documented event to the city and timeline without admitting fictional duels',()=> {
  const scene=scenes.find(s=>s.id==='baima-yan-liang');
  assert.equal(scene.year,200);
  assert.deepEqual(scenesForEvent(scenes,{year:200,coord:[114.53,35.61]}).map(s=>s.id),[scene.id]);
  assert.equal(canPinScene(scene,200,5),true);
  assert.deepEqual(scenesForEvent(scenes,{year:190,coord:[113.32,34.82]}),[]);
  assert.deepEqual(scenesAtPlace(scenes,[113.32,34.82]).map(s=>s.id),['hulao-three-heroes','warm-wine-hua-xiong']);
  assert(scene.sources.some(source=>source.url.endsWith('/卷36')));
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
test('switching tabs leaves YouTube playback and its owned frame unchanged',async()=> {
  const {browser,instances,mount,visibility}=browserHarness();
  await browser.player.load(scenes.find(s=>s.id==='hongmen-film'),mount,'en');
  const api=instances[0],frame=mount.children[0],sequence=browser.player.sequence;
  for(const [state,status] of [[1,'playing'],[2,'paused'],[0,'ended'],[3,'buffering'],[5,'ready']]) {
    api.change(state);
    for(const hidden of [true,false,true,false]) {
      visibility(hidden);
      assert.equal(api.state,state);assert.equal(browser.status,status);assert.equal(api.position,37);
      assert.equal(browser.player.target,mount);assert.equal(browser.player.sequence,sequence);
      assert.equal(api.pauses,0);assert.equal(api.destroyed,0);assert.equal(frame.removed,false);
    }
  }
  browser.player.stop();assert.equal(api.destroyed,1);
});
test('switching tabs preserves both pending and ready X embeds without reloading',async()=> {
  const {browser,mount,visibility}=browserHarness(),reply=deferred(),frame=target();let requests=0;
  browser.player.getWidgets=async()=>({createTweet(){requests++;return reply.promise;}});
  const loading=browser.player.load(scenes[0],mount,'en'),sequence=browser.player.sequence;
  await Promise.resolve();
  for(const hidden of [true,false]) {
    visibility(hidden);assert.equal(browser.status,'loading');assert.equal(browser.player.target,mount);
  }
  reply.resolve(frame);await loading;
  for(const hidden of [true,false,true,false]) {
    visibility(hidden);assert.equal(browser.status,'ready');assert.equal(browser.player.target,mount);
    assert.equal(browser.player.sequence,sequence);assert.equal(frame.removed,false);assert.equal(requests,1);
  }
  browser.player.stop();assert.equal(mount.removed,true);
});
test('selecting music leaves YouTube playback and its completed replay screen untouched',async()=> {
  const {browser,instances,mount,music}=browserHarness();
  await browser.player.load(scenes.find(s=>s.id==='hongmen-film'),mount,'en');
  const api=instances[0],frame=mount.children[0],sequence=browser.player.sequence;
  for(const [state,status] of [[1,'playing'],[2,'paused'],[0,'ended'],[3,'buffering'],[5,'ready']]) {
    api.change(state);browser.app.musicPlaying=false;
    for(const enabled of [true,false,true]) {
      music();assert.equal(browser.app.musicPlaying,enabled);
      assert.equal(api.state,state);assert.equal(browser.status,status);assert.equal(api.position,37);
      assert.equal(browser.player.target,mount);assert.equal(browser.player.sequence,sequence);
      assert.equal(api.pauses,0);assert.equal(api.destroyed,0);assert.equal(frame.removed,false);
    }
  }
  browser.player.stop();assert.equal(api.destroyed,1);assert.equal(frame.removed,true);
  const before=browser.status;api.change(1);assert.equal(browser.status,before,'destroyed player events are ignored');
});
test('selecting music preserves a YouTube player that is still loading',async()=> {
  const {browser,instances,mount,music}=browserHarness();browser.app.musicPlaying=false;
  const loading=browser.player.load(scenes.find(s=>s.id==='hongmen-film'),mount,'en');
  music();assert.equal(browser.app.musicPlaying,true);assert.equal(browser.status,'loading');
  await loading;
  assert.equal(browser.status,'ready');assert.equal(browser.player.target,mount);
  assert.equal(instances[0].destroyed,0);assert.equal(instances[0].pauses,0);browser.player.stop();
});
test('selecting music preserves pending and ready X embeds without reloading',async()=> {
  const {browser,mount,music}=browserHarness(),reply=deferred(),frame=target();let requests=0;
  browser.app.musicPlaying=false;
  browser.player.getWidgets=async()=>({createTweet(){requests++;return reply.promise;}});
  const loading=browser.player.load(scenes[0],mount,'en'),sequence=browser.player.sequence;
  await Promise.resolve();music();
  assert.equal(browser.app.musicPlaying,true);assert.equal(browser.status,'loading');assert.equal(browser.player.target,mount);
  reply.resolve(frame);await loading;
  for(const enabled of [false,true,false]) {
    music();assert.equal(browser.app.musicPlaying,enabled);assert.equal(browser.status,'ready');
    assert.equal(browser.player.target,mount);assert.equal(browser.player.sequence,sequence);
    assert.equal(frame.removed,false);assert.equal(requests,1);
  }
  browser.player.stop();assert.equal(mount.removed,true);
});
test('closing a pending player cancels late frames and their cleanup',async()=> {
  const pending=deferred(),states=[],mount=target();let own,disposed=0;
  const player=new ScenePlayer(()=>{},state=>states.push(state),18000,async(scene,target,lang,active,register)=>{
    own=register;return pending.promise;
  });
  const loading=player.load(scenes.find(s=>s.provider==='youtube'),mount,'en');
  player.stop();own(()=>disposed++);
  const frame=target();pending.resolve(frame);await loading;
  assert.equal(disposed,1);assert.equal(frame.removed,true);assert.equal(player.target,null);
  assert.deepEqual(states,['loading']);
});
test('YouTube state updates preserve the music selected by the user',()=> {
  const state={app:appFixture(),renderStatus(){}};
  for(const status of ['playing','buffering','paused','ended','ready']) {
    for(const enabled of [true,false]) {
      state.app.musicPlaying=enabled;
      SceneBrowser.prototype.onPlaybackState.call(state,status);
      assert.equal(state.app.musicPlaying,enabled);assert.equal(state.status,status);
    }
  }
  assert.equal(state.app.playing,false);
});
test('playback status updates never replace the owned embed with a placeholder',()=> {
  const prior=global.document;
  const nodes=new Map();
  const element=()=>({children:[],append(...children){this.children.push(...children);}});
  global.document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element};
  const frame={iframe:true},host={children:[frame],setAttribute(){},replaceChildren(...children){this.children=children;}};
  const state={scene:{provider:'youtube',title:{en:'Hongmen'}},opened:true,host,text:copy=>copy.en};
  try {
    for (const status of ['ready','playing','buffering','paused','ended','stopped']) {
      state.status=status;SceneBrowser.prototype.renderStatus.call(state);
      assert.equal(host.children[0],frame);
      assert.equal(nodes.get('history-scene-retry').hidden,false);
    }
  } finally {if(prior===undefined)delete global.document;else global.document=prior;}
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
test('switching YouTube films destroys the previous player before mounting the next',async()=> {
  let destroyed=0,xRequests=0;const states=[],frames=[];
  const player=new ScenePlayer(()=>{xRequests++;},s=>states.push(s),18000,async(scene,mount,lang,active,own)=>{
    const frame=target();frames.push(frame);own(()=>{destroyed++;frame.remove();});return frame;
  });
  const [youtube,next]=scenes.filter(s=>s.provider==='youtube');
  await player.load(youtube,target(),'en');assert.match(frames[0].title,/YouTube/);
  await player.load(next,target(),'en');assert.equal(destroyed,1);assert.equal(frames[0].removed,true);
  assert.match(frames[1].title,/Yehuling.*YouTube/);assert.equal(xRequests,0);
  player.stop();assert.equal(destroyed,2);assert.deepEqual(states,['loading','ready','loading','ready']);
});
test('a late provider cleanup cannot replace or destroy the new player',async()=> {
  const reply=deferred();let release,oldDestroyed=0,newDestroyed=0;
  const [youtube,next]=scenes.filter(s=>s.provider==='youtube');
  const player=new ScenePlayer(()=>{},()=>{},18000,async(scene,mount,lang,active,own)=>{
    if(scene===youtube){release=own;return reply.promise;}
    own(()=>{newDestroyed++;});return target();
  });
  const pending=player.load(youtube,target(),'en');
  await player.load(next,target(),'en');release(()=>{oldDestroyed++;});reply.resolve(target());await pending;
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
