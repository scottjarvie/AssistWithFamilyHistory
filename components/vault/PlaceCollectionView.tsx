"use client";
import { CollectionPage } from "@/components/collections/CollectionPage";
import { CollectionWorkspace, type CollectionColumn } from "@/components/collections/CollectionWorkspace";
import { MapIllustration } from "@/components/design/MapIllustration";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PlaceCollectionRow } from "@/lib/vault/collectionRows";
const columns:CollectionColumn<PlaceCollectionRow>[] = [
  {key:"name",label:"Place",sortOnly:true,render:r=>r.name,sortValue:r=>r.name},
  {key:"kind",label:"Kind",render:r=>r.kind,sortValue:r=>r.kind},
  ...(["events","citations","media"] as const).map(key=>({key,label:key[0].toUpperCase()+key.slice(1),compactLabel:key,numeric:true,render:(r:PlaceCollectionRow)=>r[key],sortValue:(r:PlaceCollectionRow)=>r[key]})),
];
export function PlaceCollectionView({places,query="",preferenceKey}:{places:PlaceCollectionRow[];query?:string;preferenceKey:string}) {
  return <CollectionPage title="Places" eyebrow="Place-centric context" description="Explore the locations that shaped migration, worship, residence, marriage, and memory.">
    <CollectionWorkspace rows={places} columns={columns} preferenceKey={preferenceKey} filters={{q:query}} noun="places" identityLabel="Place" primaryColumn="events" naturalOrderLabel="Stored order" naturalLabels={{forward:"Stored order",reverse:"Reverse stored order"}} loadMoreHref={null}
      groups={[{key:"kind",label:"Place kind",value:r=>r.kind}]} imageSlot={()=><MapIllustration/>} rowKey={r=>r.id} rowTitle={r=>r.name} rowHref={r=>`/app/places/${r.id}`} renderIdentity={r=><span className="block font-semibold [overflow-wrap:anywhere]">{r.name}</span>}
      searchControls={<form key={query} role="search" aria-label="Find places" className="mb-3 flex gap-2"><Input name="q" defaultValue={query} aria-label="Search places" placeholder="Town, county, state, parish or country" className="h-11 min-w-0 bg-card"/><Button type="submit" className="min-h-11">Search</Button></form>}
      emptyState={<p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">No places match this search. Places appear here when connected to your evidence; clear the search to browse all loaded places.</p>}/>
  </CollectionPage>;
}
