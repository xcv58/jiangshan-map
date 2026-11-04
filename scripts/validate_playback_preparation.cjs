#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:8781/';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext();context.setDefaultNavigationTimeout(90000);
    await context.route(/cloudflareinsights|vercount/, r => r.fulfill({ status: 200, body: '', contentType: 'application/javascript' }));
    const page = await context.newPage(), errors = [], failed = [], rows = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('requestfailed', r => failed.push(r.url()));
    await page.goto(url + '?year=750');
    await page.waitForFunction(() => window.atlasApp?._fullSnapshotsLoaded && !atlasApp.flyRaf);
    assert(await page.evaluate(() => !atlasApp._playbackWorker), 'A worker was created before playback');
    await page.evaluate(() => document.fonts.ready);
    const keys = await page.evaluate(() => Object.keys(atlasApp.snapshots).filter(k => !Array.isArray(atlasApp.snapshots[k])));
    assert(keys.length > 180);
    for (const key of keys) {
      const result = await page.evaluate(async key => {
        const a = atlasApp, source = a.snapshots[key];
        const before = { ...source, _skipRegionBoundaryStroke: source._skipRegionBoundaryStroke }, after = { ...before };
        a._preparedPlaybackBoundary = null;
        const expected = a._buildRegionBoundaryPath(before);
        const points = [];
        for (let lng = 66; lng <= 142; lng += 9.5) for (let lat = 14; lat <= 55; lat += 6.8) points.push([lng, lat]);
        for (const r of source.regions || []) if (r.anchor) points.push(r.anchor);
        const worker = a._createPlaybackWorker();
        if (!worker) throw Error('Real worker unavailable');
        const response = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(Error('Worker reply timeout')), 30000);
          worker.addEventListener('message', ({ data }) => { clearTimeout(timeout); resolve(data); }, { once: true });
        });
        worker.postMessage({ id: 1, projector: { bounds: a.projector.bounds, scale: a.projector.scale,
          padX: a.projector.padX, padY: a.projector.padY, northMerc: a.projector.northMerc },
          snapshot: { regions: source.regions, polities: source.polities, _skipRegionBoundaryStroke: source._skipRegionBoundaryStroke } });
        const reply = await response;
        if (reply.error || reply.path !== expected) throw Error('Worker boundary mismatch: ' + key);
        const expectedPolities = (source.polities || []).map(p => a.projector.shapeToSvgPath(p.shape && JSON.parse(JSON.stringify(p.shape))));
        if (JSON.stringify(reply.polityPaths) !== JSON.stringify(expectedPolities)) throw Error('Worker polity geometry mismatch: ' + key);
        a._preparedPlaybackBoundary = { key, snap: after, path: reply.path };
        const actual = a._buildRegionBoundaryPath(after);
        if (actual !== expected || typeof before._allowRegionAnchor !== typeof after._allowRegionAnchor) throw Error('Prepared consumption mismatch: ' + key);
        let anchorChecks = 0;
        if (before._allowRegionAnchor) for (const p of points) {
          if (before._allowRegionAnchor(...p) !== after._allowRegionAnchor(...p)) throw Error('Prepared anchor predicate changed: ' + key);
          anchorChecks++;
        }
        return { path: actual, anchorChecks, polityPaths: expectedPolities.length };
      }, key);
      rows.push({ key, sha256: crypto.createHash('sha256').update(result.path).digest('hex'), anchorChecks: result.anchorChecks, polityPaths: result.polityPaths });
    }
    await page.evaluate(() => { atlasApp.playing = false; atlasApp._stopPlaybackPreparation(); });
    assert(await page.evaluate(async () => {
      const a=atlasApp,next=a._nextPlaybackBoundary(),polities=next.snap.polities||[];
      const expected=polities.map(p=>a.projector.shapeToSvgPath(p.shape&&JSON.parse(JSON.stringify(p.shape))));
      for(const p of polities)if(p.shape)delete p.shape._svgPathSmooth;
      a.playing=true;
      const accepted=await a._preparePlaybackBoundary(next.key,next.snap);
      const warmed=polities.every((p,i)=>!p.shape||p.shape._svgPathSmooth===expected[i]);
      a.stopAutoplay();return accepted&&warmed;
    }), 'Accepted worker result did not warm the exact native polity geometry cache');
    assert(await page.evaluate(async () => {
      const a = atlasApp, next = a._nextPlaybackBoundary();
      for(const p of next.snap.polities||[])if(p.shape)delete p.shape._svgPathSmooth;
      a.playing = true;
      const pending = a._preparePlaybackBoundary(next.key, next.snap);
      a.stopAutoplay();
      return await pending === false && !a._playbackWorker && !a._playbackBoundaryJob && !a._preparedPlaybackBoundary && a._playbackPrepareTask === null && (next.snap.polities||[]).every(p=>!p.shape||p.shape._svgPathSmooth===undefined);
    }), 'Pause did not cancel the outstanding worker job');
    assert(await page.evaluate(async () => {
      const a = atlasApp, next = a._nextPlaybackBoundary(), previous = a.activeSnapKey;
      for(const p of next.snap.polities||[])if(p.shape)delete p.shape._svgPathSmooth;
      a.playing = true;
      const pending = a._preparePlaybackBoundary(next.key, next.snap);
      a.activeSnapKey = '__seeked_away__';
      const accepted = await pending;
      const discarded = !a._preparedPlaybackBoundary;
      a.activeSnapKey = previous;
      a.stopAutoplay();
      return !accepted && discarded && (next.snap.polities||[]).every(p=>!p.shape||p.shape._svgPathSmooth===undefined);
    }), 'A stale worker result survived a seek');
    await page.evaluate(() => { atlasApp.setPlaySpeed(4); atlasApp.startAutoplay(); });
    await page.waitForFunction(() => atlasApp.year > 750);
    await page.evaluate(() => atlasApp.stopAutoplay());
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => !atlasApp._playbackWorker && !atlasApp._preparedPlaybackBoundary));
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    await context.close();

    for (const mode of ['no-worker', 'worker-denied', 'no-idle']) {
      const c = await browser.newContext();c.setDefaultNavigationTimeout(90000);
      await c.route(/cloudflareinsights|vercount/, r => r.fulfill({ status: 200, body: '', contentType: 'application/javascript' }));
      await c.addInitScript(mode => {
        if (mode === 'no-worker') window.Worker = undefined;
        if (mode === 'worker-denied') window.Worker = class { constructor() { throw new DOMException('Worker blocked', 'SecurityError'); } };
        if (mode === 'no-idle') { window.requestIdleCallback = undefined; window.cancelIdleCallback = undefined; }
      }, mode);
      const p = await c.newPage(), pageErrors = [];
      p.on('pageerror', e => pageErrors.push(e.message));
      await p.goto(url + '?year=750'); await p.waitForFunction(() => window.atlasApp?._fullSnapshotsLoaded && !atlasApp.flyRaf);
      await p.evaluate(() => { atlasApp.setPlaySpeed(4); atlasApp.startAutoplay(); });
      await p.waitForFunction(() => atlasApp.year >= 755);
      await p.evaluate(() => atlasApp.stopAutoplay());
      assert(await p.evaluate(() => !atlasApp._playbackWorker && !atlasApp._playbackBoundaryJob && !atlasApp._preparedPlaybackBoundary && atlasApp.lastRenderedSnap === atlasApp.snapshots[atlasApp.activeSnapKey]));
      assert.deepEqual(pageErrors, []); await c.close();
    }
    const result = { complete: true, rows, anchorChecks: rows.reduce((n, r) => n + r.anchorChecks, 0), polityPaths:rows.reduce((n,r)=>n+r.polityPaths,0),
      checks: ['real worker boundary and polity geometry equality', 'exact arbitrary anchor predicates', 'pending cancellation', 'stale result after seek', 'play/pause/restart', 'worker unavailable', 'worker denied', 'idle callback fallback'] };
    if (process.env.PLAYBACK_PREPARATION_OUTPUT) fs.writeFileSync(process.env.PLAYBACK_PREPARATION_OUTPUT, JSON.stringify(result, null, 2) + '\n');
    console.log(`PASS: ${rows.length} worker/prepared paths, ${result.anchorChecks} anchor predicates, lifecycle and capability fallbacks.`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
