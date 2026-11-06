/** Production bundle evidence. This is a manifest upper bound, not a network trace. */
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
const pages=['/app/page','/app/people/page'];
const report={measuredAt:new Date().toISOString(),method:'Unique entryJSFiles in the successful local production build; includes shared/layout/error/metadata entries. Uncompressed and per-file gzip sums are upper bounds, not measured transfer or startup cost. Development capture payloads are not production bundle measurements.',pages:[]};
for(const page of pages){
  const sandbox={};runInNewContext(readFileSync(`.next/server/app${page}/page_client-reference-manifest.js`.replace('/page/page_','/page_'),'utf8'),sandbox);
  const manifest=sandbox.__RSC_MANIFEST[page];
  const files=[...new Set(Object.values(manifest.entryJSFiles).flat())];
  let bytes=0,gzipBytes=0;
  for(const file of files){const data=readFileSync('.next/'+file);bytes+=data.length;gzipBytes+=gzipSync(data).length;}
  report.pages.push({page,files:files.length,uncompressedKB:Math.round(bytes/1024),gzipKB:Math.round(gzipBytes/1024)});
}
writeFileSync(new URL('./production-bundles.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
