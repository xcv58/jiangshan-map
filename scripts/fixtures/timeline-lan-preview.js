'use strict';
// Preview-only startup helper, identical on both origins. No permanent app edits.
(() => {
 const comparison=window.timelineComparison={footerHidden:document.currentScript.dataset.footer==='hidden',automatic:new URLSearchParams(location.search).get('compareplay')==='1',ready:false,started:false};
 if(!comparison.automatic){comparison.ready=true;return}
 const until=async predicate=>{
  const deadline=performance.now()+90000;
  while(!predicate()){
   if(performance.now()>deadline)throw Error('Timeline comparison startup timed out');
   await new Promise(resolve=>setTimeout(resolve,50));
  }
 };
 (async()=>{
  await until(()=>window.atlasApp?._fullSnapshotsLoaded);
  const a=window.atlasApp;
  await document.fonts.ready;
  const settled=()=>!a.flyRaf&&a._camRaf==null&&a._cameraSettleTimer==null;
  await until(settled);
  if(a.playing)a.stopAutoplay();
  if(a.year!==750){a.jumpToYear(750);await until(settled)}
  a.setPlaySpeed(4);
  comparison.ready=true;
  a.startAutoplay();
  comparison.started=true;
  comparison.startedAt=performance.now();
 })().catch(error=>{comparison.error=String(error);console.error(error)});
})();
