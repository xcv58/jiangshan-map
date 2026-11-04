#!/usr/bin/env node
// Offline regressions for collection failures and portable native evidence.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execFileSync, spawnSync } = require('node:child_process');
const { analyzeRow, resolveCaptureFile } = require('./analyze_frame_delivery.cjs');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-evidence-'));
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
};
try {
  const repo = path.join(temp, 'repo');
  const sources = {};
  for (const file of ['js/app.js', 'css/style.css', 'index.html']) {
    write(path.join(repo, file), 'fixture\n');
    sources[file] = sha('fixture\n');
  }
  fs.mkdirSync(path.join(repo, 'scripts'));
  fs.copyFileSync(path.join(__dirname, 'check_svg_final.cjs'), path.join(repo, 'scripts/check_svg_final.cjs'));
  // Subprocess fixtures exercise the real phase runner without launching Chrome
  // or inventing performance observations for the application's report.
  write(path.join(repo, 'scripts/benchmark_frames.cjs'), `
const fs=require('node:fs'),path=require('node:path');
const native=Boolean(process.env.FRAME_CAPTURE_BINARY);
const mode=process.env[native?'FIXTURE_NATIVE_CASE':'FIXTURE_FPS_CASE'];
if(mode==='early-failure'||mode==='empty-success')process.exit(mode==='early-failure'?1:0);
const runs=[];
for(const variant of ['baseline','candidate'])for(const scenario of ['pan','zoom','playback'])for(let repeat=0;repeat<3;repeat++)runs.push({variant,scenario,repeat,presentedFps:mode==='passed'?60:59});
const result={complete:mode!=='incomplete',environment:{runId:mode==='stale'?'old':process.env.FRAME_RUN_ID,nativeWindowCapture:mode==='wrong-cohort'?!native:native},runs,target:{minimumFps:60,passed:mode==='passed'}};
if(mode==='missing-sample')runs.pop();
if(mode==='duplicate-sample')runs[1]=runs[0];
if(mode==='wrong-target')result.target.passed=true;
fs.mkdirSync(path.dirname(process.env.FRAME_OUTPUT),{recursive:true});
fs.writeFileSync(process.env.FRAME_OUTPUT,mode==='malformed'?'{':JSON.stringify(result));
process.exit(mode==='passed'||mode==='failed-target-success'?0:1);
`);
  write(path.join(repo, 'scripts/benchmark_startup_memory.cjs'), `require('node:fs').writeFileSync(process.env.MEMORY_OUTPUT,'{"complete":true}');`);
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=Evidence Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  const stale = { complete: true, environment: { runId: 'old' }, target: { minimumFps: 60, passed: false } };
  let cases = 0;
  function collection(fpsCase, nativeCase, shouldPass) {
    const out = path.join(temp, 'collection-' + cases++);
    write(path.join(out, 'validation-checks.json'), { complete: true, sources });
    write(path.join(out, 'measure-checks.json'), { complete: true });
    for (const cohort of ['frames', 'native']) write(path.join(out, cohort, 'frames.json'), stale);
    const result = spawnSync(process.execPath, ['scripts/check_svg_final.cjs', '--measure-only'], {
      cwd: repo, encoding: 'utf8', env: { ...process.env, SVG_REVIEW_DIR: out, WEB_BASE_REF: 'HEAD',
        PLAYWRIGHT_PATH: 'unused-fixture', FRAME_CAPTURE_BINARY: nativeCase ? 'fixture' : '',
        FIXTURE_FPS_CASE: fpsCase, FIXTURE_NATIVE_CASE: nativeCase || '' }
    });
    assert.equal(result.status, shouldPass ? 0 : 1, result.stdout + result.stderr);
    const record = JSON.parse(fs.readFileSync(path.join(out, 'measure-checks.json')));
    assert.equal(record.complete, shouldPass);
    assert.equal(fs.existsSync(path.join(out, 'memory.json')), shouldPass, 'Failed FPS collection must stop before memory');
    if (shouldPass) {
      const frames = record.checks.filter(c => c.runId);
      assert.equal(new Set(frames.map(c => c.runId)).size, frames.length, 'Each cohort needs a distinct run ID');
      for (const check of frames) assert.equal(check.targetFailure, (check.name === 'fps' ? fpsCase : nativeCase) !== 'passed');
    } else {
      assert.equal(record.checks.at(-1).targetFailure, false, 'Collection errors must not be target failures');
      assert(!result.stdout.includes('Finished: ' + record.checks.at(-1).name), 'Failed collection was reported as finished');
    }
    if (fpsCase === 'early-failure' || fpsCase === 'empty-success') {
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'frames/frames.json'))), stale, 'Keep existing evidence intact');
    }
  }
  for (const mode of ['early-failure', 'empty-success', 'stale', 'incomplete', 'malformed', 'wrong-cohort', 'missing-sample', 'duplicate-sample', 'wrong-target', 'failed-target-success']) collection(mode, null, false);
  collection('target-failure', 'early-failure', false);
  collection('target-failure', 'target-failure', true);
  collection('passed', 'passed', true);

  const old = path.join(temp, 'original'), moved = path.join(temp, 'relocated');
  const file = path.join(old, 'captures/sample.json');
  const capture = JSON.stringify({ complete: true, frames: Array.from({ length: 10 }, (_, i) => ({
    status: 0, displayHostUs: 100000 + i * 10000, pixelChanged: i % 2 === 0, comparisonMicros: 100
  })) });
  write(file, capture);
  fs.renameSync(old, moved);
  const events = [{ name: 'atlas-frames:start', ts: 100000 }, { name: 'atlas-frames:end', ts: 200000 }];
  const trace = Buffer.from(JSON.stringify({ traceEvents: events }));
  const traceDir = path.join(temp, 'separate-traces');
  fs.mkdirSync(traceDir);
  fs.writeFileSync(path.join(traceDir, 'sample.json.gz'), zlib.gzipSync(trace));
  const row = { scenario: 'pan', variant: 'candidate', repeat: 0, durationMs: 100, presentedFps: 60,
    traceFile: 'sample.json.gz', traceSHA256: sha(trace), state: { years: [] },
    windowCapture: { file, sha256: sha(capture) } };
  const first = analyzeRow(row, traceDir, moved);
  assert.equal(first.native.changedSamples, 5, 'Relocated legacy absolute capture must be readable');
  write(file, 'Wrong original copy');
  assert.deepEqual(analyzeRow(row, traceDir, moved), first, 'Local evidence must win even when the original path exists');
  assert.equal(resolveCaptureFile(row.windowCapture, moved), path.join(moved, 'captures/sample.json'));
  const relative = { ...row, windowCapture: { ...row.windowCapture, file: 'captures/sample.json' } };
  assert.deepEqual(analyzeRow(relative, traceDir, moved).native, first.native);
  const input = path.join(moved, 'frames.json'), output = path.join(temp, 'delivery.json');
  write(input, { complete: true, runs: [row, relative] });
  execFileSync(process.execPath, [path.join(__dirname, 'analyze_frame_delivery.cjs'), input, traceDir, output]);
  const analyzed = JSON.parse(fs.readFileSync(output));
  assert(analyzed.complete && analyzed.rows.every(r => r.native.changedSamples === 5));
  const localFile = path.join(moved, 'captures/sample.json');
  fs.unlinkSync(localFile);
  assert.throws(() => analyzeRow(row, traceDir, moved), /ENOENT/, 'A missing local capture must not silently use the old copy');
  write(localFile, 'Corrupt relocated capture');
  assert.throws(() => analyzeRow(row, traceDir, moved), /Wrong native capture/);

  // A tiny native-helper fixture verifies that new captures record paths relative
  // to the measurement file, including a non-default capture directory.
  const helper = path.join(temp, 'capture-helper');
  write(helper, `#!/usr/bin/env node
const fs=require('node:fs');
fs.writeFileSync(process.argv[3],JSON.stringify({complete:true,requestedCaptureHz:60,frames:[]}));
console.log('{"ready":true}');process.stdin.once('data',()=>process.exit(0));
`);
  fs.chmodSync(helper, 0o755);
  const newOutput = path.join(temp, 'new-cohort/frames.json'), newCaptures = path.join(temp, 'custom/captures');
  const native = execFileSync(process.execPath, ['-e', `
const {captureWindow}=require(${JSON.stringify(path.join(__dirname, 'benchmark_frames.cjs'))});
captureWindow({send:async()=>({processInfo:[{type:'browser',id:123}]})},{evaluate:async()=>({})},'candidate',0,'pan').then(c=>c.stop()).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1});
`], { encoding: 'utf8', env: { ...process.env, FRAME_OUTPUT: newOutput, FRAME_CAPTURE_DIR: newCaptures, FRAME_CAPTURE_BINARY: helper } });
  const recorded = JSON.parse(native);
  assert(!path.isAbsolute(recorded.file));
  assert.equal(resolveCaptureFile(recorded, path.dirname(newOutput)), path.join(newCaptures, 'candidate-0-pan.json'));
  console.log(`PASS: ${cases} collection cases; stale, incomplete and invalid outputs fail closed; fresh target failures continue; relocated legacy/relative native captures, CLI roots, integrity and new path recording.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
