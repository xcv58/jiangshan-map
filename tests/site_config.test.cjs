'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const site = require('../js/site_config');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function controller() {
  const context = {window: {addEventListener() {}}, document: {}, URLSearchParams,
    location: {search: '?year=750'}};
  vm.createContext(context);
  vm.runInContext(read('js/site_config.js'), context);
  vm.runInContext(read('js/app.js'), context);
  const app = Object.create(context.window.HistoricalAtlasController.prototype);
  const nodes = new Map();
  app._id = id => {
    if (!nodes.has(id)) nodes.set(id, {setAttribute(key, value) {this[key] = value;}});
    return nodes.get(id);
  };
  app.locale = 'zh';
  return {app, context, nodes};
}

test('browser and build tools share the immutable fork identity', () => {
  const {context} = controller();
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.ATLAS_SITE)), site);
  assert(Object.isFrozen(context.window.ATLAS_SITE));
  const html = read('index.html');
  assert(html.indexOf('src="js/site_config.js?') < html.indexOf('src="js/app.js?'));
  assert(html.includes(`id="lnk-canonical" href="${site.baseUrl}"`));
  assert.equal(JSON.parse(read('manifest.webmanifest')).short_name, site.name);
});

test('year and person metadata stay on the fork after locale and context changes', () => {
  const {app, context, nodes} = controller();
  app._syncDocumentSeoMeta();
  assert(context.document.title.includes(site.name));
  assert.equal(nodes.get('lnk-canonical').href, site.baseUrl);
  app.locale = 'en';
  app.year = 750;
  app.dynastyIdx = 0;
  app.dynasties = [{}];
  app._bootDone = true;
  app.dynastyName = () => 'Tang';
  app.formatSpan = () => '618–907';
  app.dynastySeat = () => "Chang’an";
  app.dynastySummary = () => 'Tang dynasty';
  app._syncDocumentSeoMeta();
  assert(context.document.title.includes(site.nameEn));
  assert.equal(nodes.get('lnk-canonical').href, `${site.baseUrl}?year=750&lang=en`);
  app.activePerson = {profile: {key: 'libai', en: 'Li Bai', zh: '李白'}, events: [{}, {}]};
  app._syncDocumentSeoMeta();
  assert(context.document.title.includes('Li Bai'));
  assert.equal(nodes.get('og-url').content, `${site.baseUrl}?person=libai&lang=en`);
  app.locale = 'zh-tw';
  app._syncDocumentSeoMeta();
  assert(context.document.title.includes(site.name));
  assert.equal(nodes.get('lnk-canonical').href, `${site.baseUrl}?person=libai`);
});

test('all sitemap URLs are local to the fork and unique', () => {
  const urls = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert(urls.length > 35);
  assert.equal(new Set(urls).size, urls.length);
  for (const url of urls) assert.equal(new URL(url).origin, new URL(site.baseUrl).origin);
  assert(read('robots.txt').includes(`Sitemap: ${site.baseUrl}sitemap.xml`));
  assert(read('README.md').includes(site.upstream));
  assert(read('topics/index.html').includes('https://deanchen.me/jiangshan-map/'));
});
