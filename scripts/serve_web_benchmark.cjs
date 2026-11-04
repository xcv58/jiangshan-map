#!/usr/bin/env node
// Optional local HTTP fixture; no directory listings or runtime dependencies.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.length !== 4) {
  console.log('Usage: node scripts/serve_web_benchmark.cjs /path/to/baseline /path/to/candidate');
  process.exit(process.argv.includes('--help') ? 0 : 1);
}
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml',
  '.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
for (const [port,folder] of [[Number(process.env.WEB_BASE_PORT || 8824),process.argv[2]],
  [Number(process.env.WEB_PORT || 8825),process.argv[3]]]) {
  const root = path.resolve(folder);
  if (!fs.existsSync(path.join(root,'index.html'))) throw Error('Missing index.html in '+root);
  http.createServer((req,res)=>{
    let file;
    try {
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      file=path.resolve(root,'.'+pathname);
      if ((file!==root && !file.startsWith(root+path.sep)) ||
          path.relative(root,file).split(path.sep).some(part=>part.startsWith('.'))) throw Error();
      if (pathname.endsWith('/')) file=path.join(file,'index.html');
    } catch { res.writeHead(400).end(); return; }
    if (req.method!=='GET' && req.method!=='HEAD') {res.writeHead(405).end();return;}
    fs.readFile(file,(error,bytes)=>{
      if(error){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream',
        'Content-Length':bytes.length,'Cache-Control':'no-cache'});
      res.end(req.method==='HEAD' ? undefined : bytes);
    });
  }).listen(port,'127.0.0.1',()=>console.log('Serving '+root+' at http://127.0.0.1:'+port+'/'));
}
