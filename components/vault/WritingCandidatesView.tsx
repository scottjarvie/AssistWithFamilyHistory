"use client";
import { CollectionPage } from "@/components/collections/CollectionPage";
import { CollectionWorkspace, type CollectionColumn } from "@/components/collections/CollectionWorkspace";
import type { WritingCandidateRow } from "@/lib/vault/collectionRows";
const columns:CollectionColumn<WritingCandidateRow>[]=[
 {key:"name",label:"Name",sortOnly:true,render:r=>r.name,sortValue:r=>r.name},
 {key:"workflow",label:"Workflow",render:r=>r.workflow.replace(/_/g," "),sortValue:r=>r.workflow},
 ...(["sources","context","ready"] as const).map(key=>({key,label:key==="sources"?"Sources":key==="context"?"Context reports":"Ready",numeric:true,render:(r:WritingCandidateRow)=>key==="ready"?`${r[key]}%`:r[key],sortValue:(r:WritingCandidateRow)=>r[key]})),
];
export function WritingCandidatesView({people,preferenceKey}:{people:WritingCandidateRow[];preferenceKey:string}) {
 return <CollectionPage title="Story Writer" eyebrow="Derived outputs" description="Choose a person with enough evidence, places, and memories to draft a story from the context pack.">
  <CollectionWorkspace rows={people} columns={columns} preferenceKey={preferenceKey} filters={{}} noun="people" identityLabel="Person" primaryColumn="ready" naturalOrderLabel="Readiness order" naturalLabels={{forward:"Most ready first",reverse:"Least ready first"}} loadMoreHref={null}
   groups={[{key:"workflow",label:"Workflow",value:r=>r.workflow.replace(/_/g," ")}]} rowKey={r=>r.id} rowTitle={r=>r.name} rowHref={r=>`/app/people/${r.routeId}/story-writer`} renderIdentity={r=><><span className="block font-semibold">{r.name}</span><span className="block text-sm text-muted-foreground">{r.lifespan}</span><span className="mt-1 block text-sm">Open Story Writer →</span></>}
   searchControls={<p className="mb-3 text-sm text-muted-foreground">The first {people.length} readiness candidates are loaded. Choose a person to open their private writing session.</p>}
   emptyState={<p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">Import a FamilySearch capture first so Story Writer has a person context pack to work from.</p>}/>
 </CollectionPage>;
}
