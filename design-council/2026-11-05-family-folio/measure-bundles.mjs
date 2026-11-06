/** Production entry-graph upper bounds; never a network/startup timing claim. */
import {readFileSync,writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {gzipSync} from 'node:zlib';
const all=['/app/page','/app/people/page','/app/places/page','/app/stories/page','/app/story-writer/page','/app/research/page','/app/people/[personId]/page','/app/places/[placeId]/page','/app/stories/[storyId]/page','/app/queue/page','/app/operations/page','/app/audit/page','/app/settings/ai/page','/app/settings/page','/app/api/page','/app/api/admin/page','/app/people/[personId]/raw/page','/app/people/[personId]/contextualized/page'];
const pages=process.argv.includes('--all-council')?all:['/app/page','/app/people/page'];
const destination=process.argv.slice(2).find(value=>!value.startsWith('--'))||'./production-bundles.json';
const report={measuredAt:new Date().toISOString(),buildId:readFileSync('.next/BUILD_ID','utf8').trim(),method:'Unique entryJSFiles in one successful local production build, including shared/layout/error/metadata entries. Uncompressed/per-file gzip sums are upper bounds; not actual transfer, cache behavior, execution time, startup, infrastructure cost or authenticated acceptance. Routes overlap shared files: do not sum the route rows. Dev capture payloads are excluded.',pages:[]};
const cache=new Map();
for(const page of pages){
 const sandbox={};runInNewContext(readFileSync(`.next/server/app${page}/page_client-reference-manifest.js`.replace('/page/page_','/page_'),'utf8'),sandbox);
 const manifest=sandbox.__RSC_MANIFEST[page];if(!manifest)throw Error(`Missing production entry ${page}`);
 const files=[...new Set(Object.values(manifest.entryJSFiles).flat())];let bytes=0,gzipBytes=0;
 for(const file of files){if(!cache.has(file)){const data=readFileSync('.next/'+file);cache.set(file,{bytes:data.length,gzip:gzipSync(data).length});}bytes+=cache.get(file).bytes;gzipBytes+=cache.get(file).gzip;}
 report.pages.push({page,files:files.length,uncompressedKB:Math.round(bytes/1024),gzipKB:Math.round(gzipBytes/1024)});
}
writeFileSync(new URL(destination,import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
