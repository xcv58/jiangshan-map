#!/usr/bin/env node
// Read-only LAN comparison of main and the optimized checkout.
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const candidateRoot=fs.realpathSync(path.resolve(__dirname,'..'));
if(!process.env.LAN_MAIN_ROOT)throw Error('Set LAN_MAIN_ROOT to the main checkout.');
const mainRoot=fs.realpathSync(path.resolve(process.env.LAN_MAIN_ROOT));
const host=process.env.LAN_HOST,mainPort=Number(process.env.LAN_MAIN_PORT||8826),candidatePort=Number(process.env.LAN_CANDIDATE_PORT||8827);
if(net.isIP(host||'')!==4||![mainPort,candidatePort].every(p=>Number.isInteger(p)&&p>1024&&p<65536)||mainPort===candidatePort)throw Error('Set LAN_HOST to the local IPv4 address and choose two distinct ports.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
for(const [port,root,label]of [[mainPort,mainRoot,'Main'],[candidatePort,candidateRoot,'Optimized']]){
 if(!fs.existsSync(path.join(root,'index.html')))throw Error('Missing index.html in '+root);
 const server=http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return}
  let file,allowedRoot=root;
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(pathname==='/__timeline-comparison.js'){file=path.join(candidateRoot,'scripts/fixtures/timeline-lan-preview.js');allowedRoot=candidateRoot}
   else{
    if(pathname.split('/').some(part=>part.startsWith('.')))throw Error('Hidden path');
    file=path.resolve(root,'.'+pathname);
    if(pathname.endsWith('/'))file=path.join(file,'index.html');
   }
   file=await fs.promises.realpath(file);
   if(!file.startsWith(allowedRoot+path.sep))throw Error('Outside preview');
   let bytes=await fs.promises.readFile(file);
   if(file===path.join(root,'index.html')){
    bytes=Buffer.from(bytes.toString().replace('</body>','<script src="/__timeline-comparison.js"></script></body>'));
   }
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store'});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:400).end()}
 });
 server.on('error',error=>{console.error(error);process.exit(1)});
 server.listen(port,host,()=>console.log(`${label}: http://${host}:${port}/?year=750&compareplay=1`));
}
