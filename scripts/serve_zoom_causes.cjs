#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const definition=JSON.parse(fs.readFileSync(process.env.ZOOM_VARIANTS));
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
for(const variant of definition.variants){
 http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return}
  let file;
  try{
   let relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(relative.split('/').some(p=>p.startsWith('.')))throw Error('Hidden path');
   if(relative.endsWith('/'))relative+='index.html';
   const choose=root=>{const f=path.resolve(root,'.'+relative);if(!f.startsWith(path.resolve(root)+path.sep))throw Error('Outside root');return f};
   file=choose(variant.root);if(!fs.existsSync(file))file=choose(definition.sharedRoot);
  }catch{res.writeHead(400).end();return}
  fs.readFile(file,(error,bytes)=>{if(error){res.writeHead(404).end();return}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes)});
 }).listen(variant.port,'127.0.0.1',()=>console.log(variant.name,variant.url));
}
