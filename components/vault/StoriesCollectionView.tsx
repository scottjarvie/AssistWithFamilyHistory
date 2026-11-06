"use client";
import { useState } from "react";
import { SafeLink } from "@/components/layout/SafeLink";
import { CollectionPage } from "@/components/collections/CollectionPage";
import { CollectionWorkspace, type CollectionColumn } from "@/components/collections/CollectionWorkspace";
import { Button } from "@/components/ui/button";
import { countCollectionFacets } from "@/lib/collections/facets";
import { CollectionFilters } from "@/components/collections/CollectionFilters";
import { Badge } from "@/components/ui/badge";
import type { StoryCollectionRow } from "@/lib/vault/collectionRows";
const workflows = [["needs_genealogy_evidence","Needs genealogy"],["needs_context_research","Needs context"],["ready_to_draft","Ready to draft"],["ready_to_review","Ready to review"],["published","Published"]];
const columns:CollectionColumn<StoryCollectionRow>[] = [
  {key:"title",label:"Title",sortOnly:true,render:r=>r.title,sortValue:r=>r.title},
  {key:"person",label:"Person",render:r=>r.person,sortValue:r=>r.person},
  {key:"kind",label:"Kind",render:r=>r.kind.replace(/_/g," "),sortValue:r=>r.kind},
  {key:"status",label:"Status",render:r=><Badge variant="secondary" className={r.status==="published"?"bg-primary/10 text-primary":r.status==="review"?"bg-annotation/10 text-annotation":"bg-muted text-muted-foreground"}>{r.status}</Badge>,sortValue:r=>r.status},
  ...(["sources","places","context","ready","warnings"] as const).map(key=>({key,label:key==="ready"?"Ready":key==="warnings"?"Publish warnings":key[0].toUpperCase()+key.slice(1),numeric:true,compactLabel:(r:StoryCollectionRow)=>key==="ready"?"ready":key==="context"?`${r[key]===1?"context report":"context reports"}`:key==="warnings"?`${r[key]===1?"publish warning":"publish warnings"}`:key==="sources"?(r[key]===1?"source":"sources"):(r[key]===1?"place":"places"),render:(r:StoryCollectionRow)=>key==="ready"?`${r[key]}%`:r[key],sortValue:(r:StoryCollectionRow)=>r[key]})),
];
function NarrativePreview({content}:{content:string}) {
  const [expanded,setExpanded]=useState(false);
  return <div className="mt-2"><p className={`${expanded?"":"line-clamp-4"} whitespace-pre-wrap text-sm leading-6 text-muted-foreground`}>{content}</p><button className="min-h-11 text-sm text-primary underline underline-offset-4" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?"Collapse preview":"Read full preview"}</button></div>;
}
export function StoriesCollectionView({stories,query="",status:requestedStatus="",workflow:requestedWorkflow="",preferenceKey}:{stories:StoryCollectionRow[];query?:string;status?:string;workflow?:string;preferenceKey:string}) {
  const status=["draft","review","published"].includes(requestedStatus)?requestedStatus:"";
  const workflow=workflows.some(([key])=>key===requestedWorkflow)?requestedWorkflow:"";
  const matchesQuery=(r:StoryCollectionRow)=>!query||`${r.title} ${r.person} ${r.content}`.toLowerCase().includes(query.toLowerCase());
  const facets=countCollectionFacets(stories,[{key:"status",label:"Story status",picker:false,read:r=>r.status,options:["draft","review","published"].map(value=>({value,label:value}))},{key:"workflow",label:"Story workflow",read:r=>r.workflow,options:workflows.map(([value,label])=>({value,label}))}],{status,workflow},matchesQuery);
  const visible=stories.filter(r=>(!status||r.status===status)&&(!workflow||r.workflow===workflow)&&matchesQuery(r));
  const href=(nextStatus:string)=>`/app/stories?${new URLSearchParams(Object.entries({q:query,status:nextStatus,workflow}).filter(([,v])=>v)).toString()}`;
  return <CollectionPage title="Saved stories moving from draft to public memory." eyebrow="Story Studio" description="Review ancestor narratives, check their evidence foundation, and explicitly publish the ones ready to be shared." action={<Button asChild className="min-h-11"><SafeLink href="/app/story-writer">Open Story Writer</SafeLink></Button>}>
    <CollectionWorkspace rows={visible} columns={columns} preferenceKey={preferenceKey} filters={{q:query,status,workflow}} noun="stories" identityLabel="Story" primaryColumn="sources" defaultView="list" loadMoreHref={null}
      builtInViews={[{label:"All stories",count:facets[0].count,href:href(""),active:!status},...["draft","review","published"].map(s=>({label:s[0].toUpperCase()+s.slice(1),count:facets[0].options.find(option=>option.value===s)?.count,href:href(s),active:status===s}))]}
      groups={[{key:"status",label:"Status",value:r=>r.status},{key:"workflow",label:"Research workflow",value:r=>workflows.find(([key])=>key===r.workflow)?.[1]||r.workflow}]}
      rowKey={r=>r.id} rowTitle={r=>r.title} rowHref={r=>`/app/stories/${r.id}`} renderIdentity={r=><span className="block font-semibold [overflow-wrap:anywhere]">{r.title}</span>}
      renderDetail={r=><><NarrativePreview content={r.content}/>{r.warnings>0&&<p className="my-2 text-sm text-annotation">{r.warnings} publish warning{r.warnings===1?"":"s"} before sharing.</p>}</>}
      renderActions={r=><div className="mt-2 flex flex-wrap gap-2"><Button asChild variant="outline" className="min-h-11"><SafeLink href={`/app/stories/${r.id}`}>Review story</SafeLink></Button>{r.publicHref&&<Button asChild variant="outline" className="min-h-11"><SafeLink href={r.publicHref} target="_blank" rel="noopener noreferrer">Open published story ↗</SafeLink></Button>}</div>}
      searchControls={<CollectionFilters path="/app/stories" noun="stories" query={query} queryLabel="Search stories" placeholder="Search titles, people, or story text" values={{status,workflow}} facets={facets}/>}
      emptyState={<div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">{stories.length?"No stories match this filter.":<><p className="font-medium text-foreground">No saved stories yet</p><p className="mt-2">Start with a person context pack in Story Writer. Saved drafts will appear here for review and publishing.</p></>}</div>}/>
  </CollectionPage>;
}
