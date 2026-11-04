#!/usr/bin/env node
// Functional WebKit coverage only; not Safari or physical-phone FPS evidence.
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const review = path.resolve(process.env.SVG_REVIEW_DIR);
const out = path.join(review, 'webkit');
fs.mkdirSync(out, { recursive: true });
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sources = () => Object.fromEntries(['js/app.js', 'css/style.css', 'index.html'].map(f => [f, sha(fs.readFileSync(path.join(root, f)))]));
const record = { complete: false, engine: 'Playwright WebKit',
  limitation: 'Desktop and mobile viewport emulation, not actual Safari/iOS hardware or FPS measurements.',
  sourceCommit: git('rev-parse', 'HEAD'), baseCommit: git('rev-parse', process.env.WEB_BASE_REF),
  sources: sources(), checks: [] };
const output = path.join(out, 'checks.json');
if (process.env.WEBKIT_RESUME === '1') {
  const previous = JSON.parse(fs.readFileSync(output));
  assert.deepEqual(previous.sources, record.sources, 'Cannot reuse WebKit checks for changed application');
  assert.equal(previous.baseCommit, record.baseCommit);
  for (const check of previous.checks.filter(c => c.exitCode === 0)) {
    assert.equal(sha(fs.readFileSync(path.join(root, check.script))), check.scriptSHA256, 'Reused test changed');
    assert.equal(sha(fs.readFileSync(path.join(out, check.name + '.log'))), check.logSHA256, 'Reused log changed');
    record.checks.push({ ...check, reusedFromCommit: previous.sourceCommit });
  }
}
const save = () => fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n');
save();
(async () => {
  const { webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
  const browser = await webkit.launch({ headless: true });
  record.browserVersion = browser.version();
  await browser.close();
  for (const [name, script, key] of [
    ['features', 'scripts/validate_web_features.cjs', 'WEB_FEATURE_OUTPUT'],
    ['timeline', 'scripts/validate_timeline_rendering.cjs', 'THUMB_VALIDATION_OUTPUT'],
    ['responsive', 'scripts/validate_responsive.cjs', 'RESPONSIVE_OUTPUT'],
  ]) {
    if (record.checks.some(c => c.name === name && c.exitCode === 0)) {
      console.log('Reusing verified unchanged WebKit check:', name);
      continue;
    }
    console.log('Starting WebKit:', name);
    const run = spawnSync(process.execPath, ['--expose-gc', script], {
      cwd: root, env: { ...process.env, WEB_TEST_ENGINE: 'webkit', [key]: path.join(out, name) },
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    const log = (run.stdout || '') + (run.stderr || '');
    fs.writeFileSync(path.join(out, name + '.log'), log);
    record.checks.push({ name, script, scriptSHA256: sha(fs.readFileSync(path.join(root, script))),
      exitCode: run.status, logSHA256: sha(log) });
    assert.deepEqual(sources(), record.sources, 'Application source changed during WebKit checks');
    save();
    assert.equal(run.status, 0, 'WebKit ' + name + ' failed; see ' + path.join(out, name + '.log'));
    console.log('Finished WebKit:', name);
  }
  record.complete = true;
  save();
})().catch(e => { console.error(e); process.exitCode = 1; });
