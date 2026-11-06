/** Presentation-only indexing. Original Markdown is never rewritten for export. */
export type ReaderSource={id:string;title:string;attachedBy?:string;attachedAt?:string;webPageUrl?:string};
export type ReaderSection={offset:number;label:string;id:string};
export function sourceAnchor(prefix:string,id:string) {
 return `${prefix}-source-${Array.from(id).map(c=>c.codePointAt(0)!.toString(16)).join("-")}`;
}
export function rawSourceHeading(text:string):{id:string;title:string}|null {
 const found=/^([^:\n]+):\s+(.+?)\s+\{#([^}]+)\}$/.exec(text.trim());
 return found&&found[1].trim()===found[3]?{id:found[3],title:found[2]}:null;
}
export function namedSourceIds(markdown:string):string[] {
 const ids=new Set<string>();
 // Only the explicit source annotations written by the stored dossier format.
 for(const found of markdown.matchAll(/_\((?:confidence:\s*(?:high|medium|low),\s*)?sources:\s*([^\n]*?)\)_/g)) {
  for(const id of found[1].split(",").map(s=>s.trim()).filter(Boolean))ids.add(id);
 }
 return [...ids];
}
export function documentSections(markdown:string,prefix:string):ReaderSection[] {
 const sections:ReaderSection[]=[];let offset=0,fence:{mark:string;length:number}|null=null;
 for(const line of markdown.split(/(?<=\n)/)) {
  const opening=/^ {0,3}(`{3,}|~{3,})/.exec(line);
  if(opening) {if(!fence)fence={mark:opening[1][0],length:opening[1].length};else if(opening[1][0]===fence.mark&&opening[1].length>=fence.length&&/^ {0,3}(?:`+|~+)\s*$/.test(line.trimEnd()))fence=null;offset+=line.length;continue;}
  const heading=!fence&&/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*\r?\n?$/.exec(line);
  if(heading){const label=heading[2].replace(/[ \t]+#+[ \t]*$/,"");const source=rawSourceHeading(label);sections.push({offset,label:source?`${source.id}: ${source.title}`:label,id:source?sourceAnchor(prefix,source.id):`${prefix}-heading-${offset}`});}
  offset+=line.length;
 }
 return sections;
}
interface MarkdownNode {type:string;value?:string;depth?:number;children?:MarkdownNode[];position?:{start:{offset?:number};end:{offset?:number}};data?:{hName?:string;hProperties?:Record<string,unknown>};}
const plainText=(node:MarkdownNode):string=>node.value??node.children?.map(plainText).join("")??"";
export function readerRemarkPlugin(markdown:string,prefix:string) {
 return function readerAnnotations() {
  return function transform(tree:unknown) {
   function visit(node:MarkdownNode) {
    if(node.type==="paragraph") {
     const raw=markdown.slice(node.position?.start.offset??0,node.position?.end.offset??0);
     node.data={...node.data,hName:"div",hProperties:{...node.data?.hProperties,"data-reader-paragraph":true,"data-reader-sources":JSON.stringify(namedSourceIds(raw))}};
    }
    if(node.type==="heading") {
     const source=rawSourceHeading(plainText(node));
     if(source) {const last=node.children?.at(-1);if(last?.type==="text")last.value=last.value?.replace(/\s+\{#[^}]+\}$/,"");}
     node.data={...node.data,hName:"div",hProperties:{...node.data?.hProperties,"data-reader-heading":node.depth||2,id:source?sourceAnchor(prefix,source.id):`${prefix}-heading-${node.position?.start.offset??0}`,"data-reader-source-heading":source?.id||""}};
    }
    for(const child of node.children||[])visit(child);
   }
   visit(tree as MarkdownNode);
  };
 };
}
