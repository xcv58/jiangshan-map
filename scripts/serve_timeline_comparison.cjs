#!/usr/bin/env node
// Read-only LAN previews: visible/hidden footer, or two checkout roots.
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const candidateRoot=fs.realpathSync(path.resolve(__dirname,'..'));
const compareRoot=process.env.TIMELINE_COMPARE_ROOT?fs.realpathSync(process.env.TIMELINE_COMPARE_ROOT):null;
const host=process.env.LAN_HOST,visiblePort=Number(process.env.TIMELINE_VISIBLE_PORT||8794),hiddenPort=Number(process.env.TIMELINE_HIDDEN_PORT||8795);
if(net.isIP(host||'')!==4||![visiblePort,hiddenPort].every(p=>Number.isInteger(p)&&p>1024&&p<65536)||visiblePort===hiddenPort)throw Error('Set LAN_HOST to the local IPv4 address and choose two distinct ports.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
const previews=compareRoot?[[visiblePort,false,compareRoot],[hiddenPort,false,candidateRoot]]:process.env.TIMELINE_VISIBLE_ONLY==='1'?[[visiblePort,false,candidateRoot]]:[[visiblePort,false,candidateRoot],[hiddenPort,true,candidateRoot]];
for(const [port,hidden,root]of previews){
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
    let html=bytes.toString();
    if(hidden)html=html.replace('</head>','<style id="timeline-comparison-exclusion">#scrubber-dock{visibility:hidden!important}</style></head>');
    html=html.replace('</body>',`<script src="/__timeline-comparison.js" data-footer="${hidden?'hidden':'visible'}"></script></body>`);
    bytes=Buffer.from(html);
   }
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':bytes.length,'Cache-Control':'no-store'});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:400).end()}
 });
 server.on('error',error=>{console.error(error);process.exit(1)});
 const label=compareRoot?(root===compareRoot?'Baseline':'Optimized'):(hidden?'Timeline hidden':'Timeline visible');
 server.listen(port,host,()=>console.log(`${label}: http://${host}:${port}/?year=750&compareplay=1`));
}
