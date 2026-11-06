'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const scenes = require('../js/history_scenes_data.js');
const {SceneSession, ScenePlayer, sourceURL} = require('../js/history_scenes.js');
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

test('the curated catalog has three distinct public post embeds and historical context',()=> {
  assert.equal(scenes.length,3);assert.equal(new Set(scenes.map(s=>s.id)).size,3);
  assert.equal(new Set(scenes.map(s=>s.postId)).size,3);
  for (const s of scenes) {
    assert.match(s.postId,/^\d{19}$/);assert.match(s.handle,/^[A-Za-z0-9_]+$/);
    assert.equal(new URL(sourceURL(s)).hostname,'x.com');
    assert(s.range[0]<=s.year && s.year<=s.range[1]);
    assert(s.coord.length===2 && s.coord.every(Number.isFinite));
    for(const key of ['title','date','place','summary','history','caveat','credit']) {
      assert(s[key].zh && s[key].en,key);
    }
    assert(s.sources.every(source=>new URL(source.url).protocol==='https:'));
  }
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
