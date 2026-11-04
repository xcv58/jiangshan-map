#!/usr/bin/env node
'use strict';
// Offline only: do not run while collecting performance samples.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { analyze } = require('./benchmark_frames.cjs');
const { analyzeRow } = require('./analyze_frame_delivery.cjs');
const root = path.resolve(process.argv[2] || '');
assert(process.argv[2], 'Usage: node --expose-gc scripts/analyze_zoom_causes.cjs raw-directory');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
const median = a => {
  a = [...a].sort((x, y) => x - y);
  return a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const stats = a => ({ n: a.length, median: median(a), min: Math.min(...a), max: Math.max(...a) });
const experiments = {};
for (const [name, relative, expected] of [
  ['componentReversions', '', 36],
  ['compositorControls', 'compositor-control', 36],
  ['sameOriginNative', 'compositor-control/native-confirmation', 18],
]) {
  const dir = path.join(root, relative);
  const file = path.join(dir, 'frames.json');
  const input = read(file);
  assert(input.complete);
  assert.equal(input.runs.length, expected);
  const definition = input.environment.variantDefinitions;
  assert(definition);
  const variants = definition.variants.map(v => v.name);
  const assets = input.environment.assets;
  for (const variant of definition.variants) {
    for (const [file, hash] of Object.entries(assets[variant.name])) {
      const override = path.join(variant.root, file);
      const source = fs.existsSync(override) ? override : path.join(definition.sharedRoot, file);
      assert.equal(sha(fs.readFileSync(source)), hash, 'Source changed: ' + source);
      if (!['index.html', 'css/style.css', 'js/app.js'].includes(file))
        assert.equal(hash, assets[variants[0]][file], 'Different data: ' + file);
    }
  }
  const nativeRows = [];
  const rows = [];
  for (const row of input.runs) {
    const bytes = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'traces', row.traceFile)));
    assert.equal(sha(bytes), row.traceSHA256);
    const parsed = analyze(JSON.parse(bytes).traceEvents);
    for (const key of ['presentedFps', 'presentedFrames', 'durationMs', 'frameIntervalP95Ms'])
      assert.equal(parsed[key], row[key], 'Parser mismatch: ' + row.traceFile + ' ' + key);
    assert.equal(row.scenario, 'zoom');
    assert.equal(row.errors.length, 0);
    assert.equal(row.failed.length, 0);
    assert.equal(row.state.interruptions.length, 0);
    assert(row.state.focused && row.state.visible === 'visible');
    assert(row.state.typographyCurrent && !row.state.stageTransform);
    assert.equal(row.state.year, 1415);
    assert.equal(row.state.viewBox, '350.0 215.0 500.0 420.0');
    assert(Math.abs(row.state.wheelDelta) < .01);
    for (const host of [row.hostBefore, row.hostAfter]) {
      assert(host.busyServices.some(p => p.process === 'jellyfin' && p.pid === 12908));
      assert(host.busyServices.some(p => p.process === 'LogiPluginService' && p.pid === 81073));
    }
    let native = null;
    if (name === 'sameOriginNative') {
      native = analyzeRow(row, path.join(dir, 'traces'), dir);
      nativeRows.push(native);
    }
    rows.push({ variant: row.variant, repeat: row.repeat, presentedFps: row.presentedFps,
      frameIntervalP95Ms: row.frameIntervalP95Ms,
      nativeChangedHz: native?.native.changedSamplesPerSecond ?? null });
    if (global.gc) global.gc();
  }
  const summary = {};
  for (const variant of variants) {
    const samples = rows.filter(r => r.variant === variant);
    assert.equal(samples.length, 6);
    summary[variant] = { presentedFps: stats(samples.map(r => r.presentedFps)),
      frameIntervalP95Ms: stats(samples.map(r => r.frameIntervalP95Ms)) };
    if (nativeRows.length) {
      const samples = nativeRows.filter(r => r.variant === variant);
      summary[variant].nativeChangedHz = stats(samples.map(r => r.native.changedSamplesPerSecond));
      summary[variant].nativeCompleteSampleHz = stats(samples.map(r => r.native.completeSamplesPerSecond));
      summary[variant].dawnWaitMaxMs = Math.max(...samples.map(r => r.gpu.dawnCommandSchedulingWait.maxMs));
      summary[variant].swapMaxMs = Math.max(...samples.map(r => r.gpu.swapBuffers.maxMs));
      summary[variant].gapsOverlappingDawnWait8Ms = samples.reduce((n, r) => n + r.gpu.gapsOverlappingDawnWait8Ms, 0);
    }
  }
  experiments[name] = { input: file, inputSHA256: sha(fs.readFileSync(file)),
    traceDigestsAndPresentationReparseVerified: true, assetsAndSharedDataVerified: true,
    backgroundServicePIDsVerified: true, environment: {
      browser: input.environment.browser, cpu: input.environment.cpu,
      viewport: input.environment.viewport, dpr: input.environment.dpr,
      measuredAt: input.environment.measuredAt }, summary, rows };
}
const output = path.join(root, 'cause-summary.json');
fs.writeFileSync(output, JSON.stringify({ complete: true, experiments,
  caution: 'Zoom diagnosis only; native changed-pixel Hz is not physical display FPS. Retain every sample, including the 40.98 FPS intervention run. No PR source changes or universal 58/60 FPS claim.' }, null, 2) + '\n');
console.log(JSON.stringify({ output, verifiedTraces: 90, verifiedNativeCaptures: 18,
  summaries: Object.fromEntries(Object.entries(experiments).map(([k,v]) => [k,v.summary])) }));
