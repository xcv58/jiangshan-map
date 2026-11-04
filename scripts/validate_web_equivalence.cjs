#!/usr/bin/env node
// Exact boundary-output comparison against a Git revision using unchanged data.
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, {cwd:root,maxBuffer:16*1024*1024});
const base = process.env.WEB_BASE_REF || git('merge-base','origin/main','HEAD').toString().trim();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sandbox = {window:{addEventListener(){}}};
vm.createContext(sandbox);
for (const file of ['china_geo_data.js','atlas_snapshots.js','map_data.js','lore_data.js','i18n_dict.js','zh_hant.js']) {
  const source = fs.readFileSync(path.join(root,'js',file));
  assert.equal(sha(source),sha(git('show',base+':js/'+file)), 'Data changed: '+file);
  vm.runInContext(source.toString(),sandbox,{filename:file});
}
vm.runInContext(git('show',base+':js/app.js').toString(),sandbox,{filename:'baseline-app.js'});
const baselineClass = sandbox.window.HistoricalAtlasController;
vm.runInContext(fs.readFileSync(path.join(root,'js/app.js'),'utf8'),sandbox,{filename:'candidate-app.js'});
const candidateClass = sandbox.window.HistoricalAtlasController;
const make = Class => Object.assign(Object.create(Class.prototype),{
  snapshots:sandbox.window.ATLAS_SNAPSHOTS,provinces:sandbox.window.PROVINCE_OUTLINES,
  projector:new sandbox.window.MercatorProjector(1000,700,{west:66,east:142,south:14,north:55}),
});
const baseline=make(baselineClass),candidate=make(candidateClass);
candidate._hydrateSnapshots();
let anchors=0;
const rows=[];
for (const [key,snapshot] of Object.entries(candidate.snapshots)) {
  if (Array.isArray(snapshot)) continue;
  // Do not share the per-snapshot output cache between implementations.
  const before={...snapshot},after={...snapshot};
  const expected=baseline._buildRegionBoundaryPath(before),actual=candidate._buildRegionBoundaryPath(after);
  assert.equal(actual,expected,'Boundary geometry changed: '+key);
  assert.equal(candidate._buildRegionBoundaryPath(after),actual,'Output cache changed: '+key);
  assert.equal(typeof after._allowRegionAnchor,typeof before._allowRegionAnchor);
  if (before._allowRegionAnchor) {
    const points=[];
    for(let lng=66;lng<=142;lng+=9.5)for(let lat=14;lat<=55;lat+=6.8)points.push([lng,lat]);
    for(const region of snapshot.regions||[])if(region.anchor)points.push(region.anchor);
    for(const point of points){assert.equal(after._allowRegionAnchor(...point),before._allowRegionAnchor(...point),'Label-anchor classification changed: '+key);anchors++;}
  }
  rows.push({snapshot:key,bytes:Buffer.byteLength(actual),sha256:sha(actual)});
}
assert(rows.length>180);
// Upstream #237 changed these predicates. Include a thin, densely sampled
// concave border so the optimized latitude bins must cover the full 0.55° query.
const rectangle=(x0,y0,x1,y1)=>({type:'Polygon',coordinates:[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]]});
const dense=points=>{const ring=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];for(let k=0;k<20;k++)ring.push([a[0]+(b[0]-a[0])*k/20,a[1]+(b[1]-a[1])*k/20])}ring.push(ring[0]);return{type:'Polygon',coordinates:[ring]}};
const regions=(x0,x1,y)=>[{title:'north',shape:rectangle(x0,y,x1,y+1)},{title:'south',shape:rectangle(x0,y-1,x1,y)}];
const mainPolity={title:'main',role:'main',shape:rectangle(0,-20,70,30)},notched={title:'rival',role:'rival',shape:dense([[10,0],[60,0],[60,10],[40,10],[40,5],[20,5],[20,10],[10,10]])};
const rivals=[{title:'east',role:'rival',shape:rectangle(80,0,90,10)},{title:'west',role:'rival',shape:rectangle(-40,0,-30,10)}];
const synthetic=[];
for(const [name,polities,regionList,draws,anchor]of [
 ['multi-regime 0.55 midpoint exclusion',[mainPolity,notched,...rivals],regions(25,35,5.5),false,null],
 ['three-regime midpoint control',[mainPolity,notched,rivals[0]],regions(25,35,5.5),true,null],
 ['multi-regime 0.38 endpoint exclusion',[mainPolity,notched,...rivals],regions(20.3,30,7),false,null],
 ['three-regime endpoint control',[mainPolity,notched,rivals[0]],regions(20.3,30,7),true,null],
 ['rival area 50 remains eligible',[{title:'rival',role:'rival',shape:rectangle(20,5,30,10)},rivals[0]],regions(22,28,7),true,[25,8,true]],
 ['area-50 main activates area-30 rival suppression',[{title:'rival',role:'rival',shape:rectangle(0,0,6,5)},{title:'main',role:'main',shape:rectangle(10,0,20,5)}],regions(1,5,2.5),false,[3,2,false]],
]){
 const before={regions:regionList,polities},after={...before};
 const expected=baseline._buildRegionBoundaryPath(before),actual=candidate._buildRegionBoundaryPath(after);
 assert.equal(Boolean(expected),draws,'Vacuous upstream fixture: '+name);assert.equal(actual,expected,'Upstream rule/index regression: '+name);
 if(anchor){assert.equal(before._allowRegionAnchor(anchor[0],anchor[1]),anchor[2]);assert.equal(after._allowRegionAnchor(anchor[0],anchor[1]),anchor[2])}
 synthetic.push({name,draws,sha256:sha(actual)});
}
const result={baseCommit:git('rev-parse',base).toString().trim(),candidateCommit:git('rev-parse','HEAD').toString().trim(),
  applicationSHA256:sha(fs.readFileSync(path.join(root,'js/app.js'))),snapshots:rows.length,anchorComparisons:anchors,
  boundaryPathsByteIdentical:true,labelAnchorsIdentical:true,synthetic,rows};
if(process.env.WEB_EQUIVALENCE_OUTPUT){const dest=path.resolve(process.env.WEB_EQUIVALENCE_OUTPUT);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n')}
console.log(`PASS: ${rows.length} snapshot boundary paths byte-identical; ${anchors} label-anchor classifications unchanged; ${synthetic.length} upstream margin/threshold fixtures.`);
