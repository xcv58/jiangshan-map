#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = {};
  try {
    for (const variant of ['baseline', 'candidate']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await context.route(/cloudflareinsights|vercount/, r => r.fulfill({ status: 200, body: '', contentType: 'application/javascript' }));
      const page = await context.newPage(), errors = [], failed = [];page.setDefaultNavigationTimeout(90000);
      page.on('pageerror', e => errors.push(e.message));
      page.on('requestfailed', r => failed.push(r.url()));
      const url = variant === 'baseline' ? process.env.WEB_BASE_URL : process.env.ATLAS_URL;
      assert(url, 'Set WEB_BASE_URL and ATLAS_URL');
      await page.goto(url + '?year=750');
      await page.waitForFunction(() => window.atlasApp?._fullSnapshotsLoaded && !atlasApp.flyRaf);
      await page.evaluate(() => document.fonts.ready);
      // Deterministic DOM/geometry verification only; FPS never freezes animations.
      await page.addStyleTag({ content: '* {animation:none!important;transition:none!important}' });
      await page.evaluate(()=>{
        // Compare complete scenes with either stock or optimized baselines. A separate
        // viewport audit checks that production suppression hides only offscreen labels.
        const a=atlasApp;
        a._updateViewportLabels=function(){for(const item of this._zoomScaleNodes||[]){item.hidden=false;item.node.removeAttribute('data-outside-viewport');item.node.setAttribute('transform',item.prefix+this._lastInvScale+item.suffix)}};
        a._invalidateTypographyLayout();a._rescaleSvgTypography();
      });
      const keys = await page.evaluate(() => Object.keys(atlasApp.snapshots).filter(k => !Array.isArray(atlasApp.snapshots[k])));
      assert(keys.length > 180);
      const rows = [];
      for (const key of [...keys, ...keys.slice().reverse()]) {
        const state = await page.evaluate(key => {
          const a = atlasApp;
          a._renderPolitiesAndPrefectures(a.dynasties[a.dynastyIdx], a.snapshots[key]);
          const canonical = node => [node.tagName,
            [...node.attributes].map(v => [v.name, v.value]).sort((a, b) => a[0].localeCompare(b[0])),
            [...node.childNodes].map(n => n.nodeType === Node.ELEMENT_NODE ? canonical(n) : n.textContent)];
          return JSON.stringify([canonical(a.grpPolities), canonical(a.grpPrefectures)]);
        }, key);
        rows.push({ key, sha256: sha(state) });
      }
      if (variant === 'candidate') {
        assert(await page.evaluate(() => {
          const a = atlasApp, d = a.dynasties[a.dynastyIdx], snap = a.lastRenderedSnap;
          const before = [...a.grpPolities.querySelectorAll('path,text')];
          a._renderPolitiesAndPrefectures(d, snap);
          const after = [...a.grpPolities.querySelectorAll('path,text')];
          return before.length > 0 && before.length === after.length && before.every((n, i) => n === after[i]);
        }), 'Unchanged polity renderers were replaced');
      }
      assert.deepEqual(errors, []); assert.deepEqual(failed, []);
      results[variant] = rows;
      console.log(`PASS: ${variant} ${rows.length} native SVG snapshot renders`);
      await context.close();
    }
    assert.deepEqual(results.candidate, results.baseline, 'SVG order, geometry, attributes or captions changed');
    if (process.env.SVG_REUSE_OUTPUT) fs.writeFileSync(process.env.SVG_REUSE_OUTPUT, JSON.stringify({ complete: true, cullingDisabledForSceneEquivalence:true, results }, null, 2) + '\n');
    console.log('PASS: exact native SVG scene equivalence, forward/reverse snapshot order, and retained node identity.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
