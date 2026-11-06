#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {verifyIndexHtmlAssetHashes} = require('./sync_version');
const root = path.resolve(__dirname, '..');
verifyIndexHtmlAssetHashes(root);
const output = path.join(root, 'public');
fs.rmSync(output, {recursive: true, force: true});
fs.mkdirSync(output);
for (const entry of ['index.html', 'assets', 'css', 'js', 'topics', 'geojson',
  'manifest.webmanifest', 'robots.txt', 'sitemap.xml', 'llms.txt', 'LICENSE']) {
  fs.cpSync(path.join(root, entry), path.join(output, entry), {recursive: true});
}
console.log('Static web build ready in public/');
