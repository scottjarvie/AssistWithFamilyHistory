"use client";
import {createElement,useId,useMemo,useState} from "react";
import type {Components} from "react-markdown";
import {Prose} from "@/components/prose/Prose";
import {readerRemarkPlugin,sourceAnchor,type ReaderSource} from "@/lib/readers/markdown";

function safeSourceAddress(value?:string) {try {const url=new URL(value||"");return ["https:","http:"].includes(url.protocol)?url.href:undefined;}catch {return undefined;}}
function SourceNote({ids,sources,rawHref,heading=false}:{ids:string[];sources:ReaderSource[];rawHref?:string;heading?:boolean}) {
 const [open,setOpen]=useState(false),id=useId();
 return <div className="min-w-0 text-sm leading-6"><button type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)} className="flex min-h-11 max-w-full items-center gap-2 text-left text-primary xl:hidden"><span className="font-mono text-xs">{heading?"Source record":"Sources"} {ids.length}</span><span aria-hidden="true">{open?"−":"+"}</span></button><aside id={id} aria-label={heading?"Source provenance":"Sources named in this paragraph"} className={`${open?"block":"hidden xl:block"} border-l-2 border-annotation/50 pl-3 text-xs text-muted-foreground`}><p className="mb-2 font-medium uppercase tracking-wider text-annotation">{heading?"Source provenance":"Named here"}</p>{ids.map(sourceId=>{
  const source=sources.find(s=>s.id===sourceId),recordAddress=safeSourceAddress(source?.webPageUrl);
  let href:string|undefined;
  if(rawHref){const url=new URL(rawHref,"https://local.invalid");url.searchParams.set("source",sourceId);url.hash=sourceAnchor("raw-document",sourceId);href=url.pathname+url.search+url.hash;}
  return <div key={sourceId} className="mb-3 last:mb-0"><p className="break-all font-mono text-foreground">{sourceId}</p>{source?.attachedBy&&<p className="mt-1 break-words">Attached by {source.attachedBy}{source.attachedAt?` · ${source.attachedAt}`:""}</p>}{heading&&!source?.attachedBy&&<p className="mt-1">Contributor not supplied.</p>}{recordAddress&&<a href={recordAddress} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex min-h-11 items-center text-primary underline underline-offset-4">Open recorded source address<span className="sr-only"> for {sourceId}</span></a>}{href&&<a href={href} className="mt-1 inline-flex min-h-11 items-center text-primary underline underline-offset-4">Compare in raw document<span className="sr-only"> · {sourceId}</span></a>}</div>;
 })}{!heading&&<p className="mt-2">IDs are the document&apos;s references.{rawHref?" A matching raw section may be absent.":" Source details are not supplied with this document read."}</p>}</aside></div>;
}
export function FieldGuideMarkdown({markdown,prefix,sources=[],rawHref}:{markdown:string;prefix:string;sources?:ReaderSource[];rawHref?:string}) {
 const plugin=useMemo(()=>readerRemarkPlugin(markdown,prefix),[markdown,prefix]);
 const components:Components={
  div:({node,children})=>{
   const properties=node?.properties||{};const heading=Number(properties["data-reader-heading"]||properties.dataReaderHeading||0);
   const sourceHeading=String(properties["data-reader-source-heading"]||properties.dataReaderSourceHeading||"");
   const encoded=String(properties["data-reader-sources"]||properties.dataReaderSources||"[]");let ids:string[]=[];try {ids=JSON.parse(encoded);}catch { /* Unknown markup is still rendered without invented citations. */ }
   const paragraph=Boolean(properties["data-reader-paragraph"]||properties.dataReaderParagraph);
   if(!heading&&!paragraph)return <div>{children}</div>;
   const target=String(properties.id||"");
   return <div id={target||undefined} tabIndex={target?-1:undefined} data-reader-block={heading?"heading":"paragraph"} className={`grid min-w-0 scroll-mt-36 gap-x-8 xl:grid-cols-[minmax(0,1fr)_13rem] ${heading?"mb-3 mt-8":"my-4"}`}><div className="min-w-0 [overflow-wrap:anywhere]">{heading?createElement(`h${Math.min(heading+1,6)}`,{className:`${heading<=2?"font-serif text-2xl":"text-lg"} font-semibold leading-snug text-foreground`},children):<p className="text-base leading-8 text-foreground sm:text-lg sm:leading-9">{children}</p>}</div>{(ids.length>0||sourceHeading)&&<SourceNote ids={sourceHeading?[sourceHeading]:ids} sources={sources} rawHref={sourceHeading?undefined:rawHref} heading={Boolean(sourceHeading)}/>}</div>;
  },
  a:({href,children})=><a href={href} target={href?.startsWith("#")?undefined:"_blank"} rel="noreferrer noopener" className="break-words text-primary underline underline-offset-4">{children}</a>,
  // Private Markdown must never start an automatic image request to an outside host.
  img:({src,alt})=>typeof src==="string"&&src?<a href={src} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-4">Image reference: {alt||src} (opens externally)</a>:<span>Image reference: {alt||"address not supplied"}</span>,
  table:({children})=><div className="my-5 max-w-full overflow-x-auto xl:mr-[15rem]"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
  pre:({children})=><pre className="my-5 max-w-full overflow-x-auto rounded border border-border bg-muted/30 p-4 text-sm xl:mr-[15rem]">{children}</pre>,
  ul:({children})=><ul className="list-disc space-y-3 pl-5 marker:text-annotation">{children}</ul>,
  ol:({children})=><ol className="list-decimal space-y-3 pl-5 marker:text-annotation">{children}</ol>,
  hr:()=><hr className="my-8 border-border xl:mr-[15rem]"/>,
 };
 return <Prose markdown={markdown} variant="compact" components={components} remarkPlugins={[plugin]} className="min-w-0 [overflow-wrap:anywhere]"/>;
}
