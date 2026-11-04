#!/usr/bin/env node
// Startup and memory are measured separately so process sampling cannot affect FPS.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { input, settle, hostState } = require('./benchmark_frames.cjs');
const root = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const base = process.env.WEB_BASE_REF || 'd9599470d92530e0e5b0944a890d15ec9e3297c6';
const urls = { baseline: process.env.WEB_BASE_URL || 'http://127.0.0.1:8774/', candidate: process.env.ATLAS_URL || 'http://127.0.0.1:8775/' };
const runs = Number(process.env.MEMORY_RUNS || 3);
const variants = (process.env.MEMORY_VARIANTS || 'baseline,candidate').split(',');
const output = path.resolve(process.env.MEMORY_OUTPUT || '/tmp/jiangshan-startup-memory.json');
const dataAssets = ['js/map_data.js', 'js/lore_data.js', 'js/atlas_snapshots.js', 'js/atlas_boot.js', 'js/china_geo_data.js', 'js/zh_hant.js', 'js/i18n_dict.js', 'js/atlas_quiz.js'];
const assets = ['index.html', 'css/style.css', 'js/app.js', ...dataAssets];
const median = values => { const a = [...values].sort((a, b) => a - b), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
assert(Number.isInteger(runs) && runs > 0 && variants.length && variants.every(v => v in urls));

async function memory(page, pageCdp, browserCdp, phase) {
  const processes = (await browserCdp.send('SystemInfo.getProcessInfo')).processInfo;
  assert(processes.every(p => Number.isInteger(p.id) && p.id > 0));
  const lines = execFileSync('ps', ['-o', 'pid=,rss=', '-p', processes.map(p => p.id).join(',')], { encoding: 'utf8' });
  const rss = new Map(lines.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number)));
  const byType = {};
  for (const p of processes) byType[p.type.toLowerCase()] = (byType[p.type.toLowerCase()] || 0) + (rss.get(p.id) || 0) * 1024;
  assert(byType.browser > 0 && byType.renderer > 0, 'Owned browser process RSS unavailable');
  const metrics = Object.fromEntries((await pageCdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  return { phase, elapsedMs: await page.evaluate(() => performance.now()), jsHeapUsedBytes: metrics.JSHeapUsedSize,
    jsHeapTotalBytes: metrics.JSHeapTotalSize, domNodes: metrics.Nodes,
    processRssBytes: Object.values(byType).reduce((a, b) => a + b, 0), rendererRssBytes: byType.renderer,
    gpuProcessRssBytes: byType.gpu || 0, processRssByType: byType };
}

async function sample(chromium, variant, repeat, args) {
  const hostBefore=hostState();
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    await context.route(/cloudflareinsights|vercount/, r => r.fulfill({ status: 200, body: '', contentType: 'application/javascript' }));
    const page = await context.newPage(), errors = [], failed = [];
    page.setDefaultNavigationTimeout(90000);
    page.on('pageerror', e => errors.push(e.message)); page.on('requestfailed', r => failed.push({ url: r.url(), error: r.failure() }));
    const browserCdp = await browser.newBrowserCDPSession(), pageCdp = await context.newCDPSession(page);
    await pageCdp.send('Performance.enable');
    await page.addInitScript(() => {
      const ready = () => {
        const a = window.atlasApp;
        if (a?._fullSnapshotsLoaded && a.year === 1415 && a.lastRenderedSnap === a.snapshots[a.activeSnapKey] &&
            !a.flyRaf && a._camRaf === null && a._cameraSettleTimer === null && document.fonts.status === 'loaded') {
          window.fullSceneReadyMs = performance.now(); performance.mark('full-scene-ready');
        } else requestAnimationFrame(ready);
      };
      requestAnimationFrame(ready);
    });
    await page.goto(urls[variant] + '?year=1415', { waitUntil: 'load' });
    await page.bringToFront();
    await page.waitForFunction(() => window.fullSceneReadyMs);
    await settle(page);
    const startup = await page.evaluate(() => ({ fullSceneReadyMs, fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      fontsLoaded: [...document.fonts].some(f => f.family === 'Noto Serif SC' && f.status === 'loaded'),
      fullSnapshots: Object.keys(atlasApp.snapshots).length }));
    assert(startup.fontsLoaded && startup.fullSnapshots > 180 && startup.fcpMs > 0);
    const samples = [await memory(page, pageCdp, browserCdp, 'startup')];
    let phase = 'pan', pending = null, pollError;
    const timer = setInterval(() => {
      if (pending) return;
      pending = memory(page, pageCdp, browserCdp, phase).then(s => samples.push(s)).catch(e => { pollError = e; }).finally(() => { pending = null; });
    }, 250);
    try {
      await input(page, 'pan'); await settle(page);
      phase = 'zoom'; await input(page, 'zoom'); await settle(page);
      phase = 'playback'; await page.evaluate(() => atlasApp.jumpToYear(750)); await settle(page);
      await page.locator('#act-play-speed').click(); await page.locator('#act-play-speed').click();
      assert.equal(await page.evaluate(() => atlasApp.playSpeed), 4);
      await page.locator('#act-autoplay').click(); await page.waitForTimeout(10000); await page.locator('#act-autoplay').click(); await settle(page);
    } finally { clearInterval(timer); if (pending) await pending; }
    if (pollError) throw pollError;
    samples.push(await memory(page, pageCdp, browserCdp, 'afterInteractions'));
    // Harvest after memory sampling so these diagnostic arrays do not inflate
    // the sampled heap. Entries still describe the original navigation.
    const loadTiming=await page.evaluate(()=>({
      navigation:performance.getEntriesByType('navigation').map(n=>({startTime:n.startTime,duration:n.duration,responseStart:n.responseStart,responseEnd:n.responseEnd,domContentLoadedEventEnd:n.domContentLoadedEventEnd,loadEventEnd:n.loadEventEnd})),
      resources:performance.getEntriesByType('resource').map(r=>({name:r.name,initiatorType:r.initiatorType,startTime:r.startTime,duration:r.duration,responseStart:r.responseStart,responseEnd:r.responseEnd,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize})),
    }));
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    const first = samples[0], last = samples.at(-1);
    const summary = { startupMs: startup.fullSceneReadyMs, fcpMs: startup.fcpMs,
      startupJsHeapBytes: first.jsHeapUsedBytes, startupProcessRssBytes: first.processRssBytes,
      peakJsHeapBytes: Math.max(...samples.map(s => s.jsHeapUsedBytes)), peakProcessRssBytes: Math.max(...samples.map(s => s.processRssBytes)),
      afterJsHeapBytes: last.jsHeapUsedBytes, afterProcessRssBytes: last.processRssBytes };
    return { variant, repeat, browser: browser.version(), startup, summary, samples, loadTiming, errors, failed, hostBefore, hostAfter:hostState() };
  } finally { await browser.close(); }
}

(async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
  const identities = {};
  for (const v of variants) {
    identities[v] = {};
    for (const file of assets) {
      const response = await fetch(new URL(file, urls[v])); assert(response.ok, 'Missing ' + file);
      const bytes = Buffer.from(await response.arrayBuffer()), expected = v === 'baseline' ? execFileSync('git', ['show', base + ':' + file], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) : fs.readFileSync(path.join(root, file));
      identities[v][file] = hash(bytes); assert.equal(hash(bytes), hash(expected), 'Wrong served asset: ' + v + ':' + file);
    }
  }
  if (identities.baseline && identities.candidate) for (const file of dataAssets) assert.equal(identities.baseline[file], identities.candidate[file], 'Data changed: ' + file);
  const args = ['--window-position=0,0', '--disk-cache-size=33554432'];
  const result = { complete: false, environment: { measuredAt: new Date().toISOString(), baseCommit: git('rev-parse', base), candidateCommit: git('rev-parse', 'HEAD'),
    applicationDiff: git('diff', 'HEAD', '--', 'js/app.js', 'css/style.css', 'index.html'),
    harnessSHA256: hash(fs.readFileSync(__filename)), node: process.version, cpu: os.cpus()[0].model, totalMemoryBytes: os.totalmem(), loadAverage: os.loadavg(),
    swap: process.platform === 'darwin' ? execFileSync('sysctl', ['vm.swapusage'], { encoding: 'utf8' }).trim() : null,
    assets: identities, headless: false, viewport: { width: 1280, height: 720 }, dpr: 2, repetitions: runs, browserArgs: args,
    navigationTimeoutMs: 90000,
    policy: 'Fresh browser process/profile for every sample; application and browser caches cold, OS caches uncontrolled. Full snapshots/UI fonts and final camera required. Analytics fulfilled empty. Alternating pairs. Memory sampled every 250 ms in a separate workload from FPS.',
    memoryDefinition: 'Main-page V8 JS heap (excludes dedicated-worker isolates); summed RSS of this isolated Chrome browser process tree, including worker threads and GPU/renderer/utility processes (shared pages may be double-counted; not unique physical memory or total GPU memory).' }, runs: [] };
  const save = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n'); };
  for (let repeat = 0; repeat < runs; repeat++) for (const variant of repeat % 2 ? [...variants].reverse() : variants) {
    if (global.gc) global.gc();
    const row = await sample(chromium, variant, repeat, args); result.runs.push(row); save(); console.log(JSON.stringify({ variant, repeat, ...row.summary }));
  }
  for (const v of variants) for (const [file, identity] of Object.entries(identities[v])) {
    const response = await fetch(new URL(file, urls[v])); assert(response.ok);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), identity, 'Served application changed during measurement: ' + v + ':' + file);
    if (v === 'candidate') assert.equal(hash(fs.readFileSync(path.join(root, file))), identity, 'Application changed during measurement: ' + file);
  }
  result.medians = Object.fromEntries(variants.map(v => [v, Object.fromEntries(Object.keys(result.runs[0].summary).map(k => [k, median(result.runs.filter(r => r.variant === v).map(r => r.summary[k]))]))]));
  result.complete = true; save(); console.log(JSON.stringify({ complete: true, medians: result.medians, output }));
})().catch(e => { console.error(e); process.exitCode = 1; });
