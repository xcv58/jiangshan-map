#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const url = process.env.ATLAS_URL || 'http://127.0.0.1:8775/';
const output = process.env.VIEWPORT_TEST_OUTPUT;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const rows = [];
  try {
    for (const phone of [false, true]) {
      const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
      await context.route(/cloudflareinsights|vercount/, r => r.fulfill({ status: 200, body: '', contentType: 'application/javascript' }));
      const page = await context.newPage(), errors = [], failed = [];page.setDefaultNavigationTimeout(90000);
      page.on('pageerror', e => errors.push(e.message)); page.on('requestfailed', r => failed.push(r.url()));
      await page.goto(url + '?year=1415');
      await page.waitForFunction(() => window.atlasApp?._fullSnapshotsLoaded && !atlasApp.flyRaf && atlasApp._camRaf === null && atlasApp._cameraSettleTimer === null);
      await page.evaluate(() => document.fonts.ready);
      // Freeze animations only for this visual/geometry check, never for FPS.
      await page.addStyleTag({ content: '* {animation:none!important;transition:none!important}' });
      for (const year of [-403, 220, 750, 1127, 1415, 1850, 2018]) {
        await page.evaluate(year => atlasApp.jumpToYear(year), year);
        await page.waitForFunction(() => atlasApp.lastRenderedSnap === atlasApp.snapshots[atlasApp.activeSnapKey]);
        // A dynasty jump can start a camera flight and load new UI font subsets.
        // Static geometry/screenshot checks require both to settle at this year.
        await page.waitForFunction(() => !atlasApp.flyRaf && atlasApp._camRaf === null && atlasApp._cameraSettleTimer === null);
        await page.evaluate(() => document.fonts.ready);
        for (const [w, x, y] of [[1000, 0, 0], [400, 200, 170], [160, 550, 260], [100, 50, 150], [1300, -140, -90], [330, 750, 400]]) {
          await page.evaluate(({ w, x, y }) => { atlasApp.camera = { x, y, w, h: w * .7, zoom: 1000 / w }; atlasApp._applyCamera(true); }, { w, x, y });
          const check = await page.evaluate(() => {
            const a = atlasApp, viewport = a.svg.getBoundingClientRect(), nodes = [...a.svg.querySelectorAll('[data-outside-viewport]')];
            for (const n of nodes) n.removeAttribute('data-outside-viewport');
            const wronglyHidden = nodes.filter(n => {
              const r = n.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && r.right >= viewport.left && r.left <= viewport.right && r.bottom >= viewport.top && r.top <= viewport.bottom;
            }).map(n => ({ className: n.getAttribute('class'), text: n.textContent }));
            for (const n of nodes) n.setAttribute('data-outside-viewport', '');
            return { hidden: nodes.length, wronglyHidden, scaled: a._zoomScaleNodes.length };
          });
          assert.deepEqual(check.wronglyHidden, [], JSON.stringify({ phone, year, w, x, y }));
          rows.push({ phone, year, w, x, y, ...check });
          if (output && year === 750 && w === 400) {
            fs.mkdirSync(output, { recursive: true });
            const name = phone ? 'phone' : 'desktop';
            await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
            const captureState = () => page.evaluate(() => ({ camera: { ...atlasApp.camera }, viewBox: atlasApp.svg.getAttribute('viewBox'), rect: atlasApp.svg.getBoundingClientRect().toJSON() }));
            const before = await captureState();
            await page.locator('#viewport-frame').screenshot({ path: path.join(output, name + '-culled.png') });
            await page.evaluate(() => { window.cullingReferenceNodes = [...atlasApp.svg.querySelectorAll('[data-outside-viewport]')]; for (const n of cullingReferenceNodes) n.removeAttribute('data-outside-viewport'); });
            await page.locator('#viewport-frame').screenshot({ path: path.join(output, name + '-native.png') });
            assert.deepEqual(await captureState(), before, 'Camera/viewport moved during static screenshot comparison');
            await page.evaluate(() => { for (const n of cullingReferenceNodes) n.setAttribute('data-outside-viewport', ''); });
          }
        }
      }
      // Zoom/pan fast paths skip transforms only while a label is suppressed.
      // Newly revealed labels must receive the current scale before painting.
      for (const [w, x, y] of [[160, 100, 100], [145, 700, 450], [130, 300, 170], [1000, 0, 0]]) {
        await page.evaluate(({ w, x, y }) => { atlasApp.camera = { x, y, w, h: w * .7, zoom: 1000 / w }; atlasApp._applyCamera(false); }, { w, x, y });
        assert(await page.evaluate(() => atlasApp._zoomScaleNodes.every(i => !i.bounds || i.hidden || i.node.getAttribute('transform') === i.prefix + atlasApp._lastInvScale + i.suffix)), 'A revealed label retained a stale zoom transform');
      }
      const size = page.viewportSize();
      await page.setViewportSize({ width: size.width + 4, height: size.height });
      await page.waitForTimeout(120);
      assert(await page.evaluate(() => atlasApp._lastViewportWidth === window.innerWidth || !atlasApp.svg.querySelector('[data-outside-viewport]')), 'A small CSS resize left stale viewport bounds');
      // Map-only layout changes must re-evaluate letterboxing and visibility.
      await page.evaluate(() => atlasApp.toggleChroniclePane(true)); await page.waitForTimeout(350);
      await page.setViewportSize(phone ? { width: 844, height: 390 } : { width: 1100, height: 760 });
      await page.waitForTimeout(150);
      await page.evaluate(() => atlasApp.resetCamera());
      await page.waitForFunction(() => !atlasApp.flyRaf && atlasApp._camRaf === null && atlasApp._cameraSettleTimer === null);
      assert.deepEqual(errors, []); assert.deepEqual(failed, []);
      await context.close();
    }
    assert(rows.some(r => r.hidden > 50), 'The check must exercise actual culling');
    if (output) fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ complete: true, rows }, null, 2) + '\n');
    console.log(`PASS: ${rows.length} desktop/phone historical camera states; every suppressed label is outside the visible viewport, including minimum/maximum zoom and letterboxing.`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
