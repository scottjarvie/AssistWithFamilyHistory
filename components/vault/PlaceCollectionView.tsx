"use client";
import { CollectionPage } from "@/components/collections/CollectionPage";
import { CollectionWorkspace, type CollectionColumn } from "@/components/collections/CollectionWorkspace";
import { MapIllustration } from "@/components/design/MapIllustration";
import { CollectionFilters } from "@/components/collections/CollectionFilters";
import type { PlaceCollectionRow } from "@/lib/vault/collectionRows";
const columns:CollectionColumn<PlaceCollectionRow>[] = [
  {key:"name",label:"Place",sortOnly:true,render:r=>r.name,sortValue:r=>r.name},
  {key:"kind",label:"Kind",render:r=>r.kind,sortValue:r=>r.kind},
  ...(["events","citations","media"] as const).map(key=>({key,label:key[0].toUpperCase()+key.slice(1),compactLabel:(r:PlaceCollectionRow)=>key==="media"?"media":r[key]===1?key.slice(0,-1):key,numeric:true,render:(r:PlaceCollectionRow)=>r[key],sortValue:(r:PlaceCollectionRow)=>r[key]})),
];
export function PlaceCollectionView({places,query="",preferenceKey,total,onLoadMore,mediaMode="explicit"}:{mediaMode?:"explicit"|"mentions";total?:number;onLoadMore?:()=>void;places:PlaceCollectionRow[];query?:string;preferenceKey:string}) {
  return <CollectionPage title="Places" eyebrow="Place-centric context" description="Explore the locations that shaped migration, worship, residence, marriage, and memory.">
    {total!==undefined&&<p className="mb-3 text-sm text-muted-foreground">{total} saved places · {places.length} loaded. {mediaMode==="explicit"?"Counts describe each whole place; media counts use accepted explicit Connections.":"Counts describe each whole place; media counts currently describe text mentions, not confirmed links."}</p>}
    <CollectionWorkspace rows={places} columns={columns} preferenceKey={preferenceKey} filters={{q:query}} noun="places" identityLabel="Place" primaryColumn="events" naturalOrderLabel="Stored order" naturalLabels={{forward:"Stored order",reverse:"Reverse stored order"}} loadMoreHref={null} onLoadMore={onLoadMore}
      groups={[{key:"kind",label:"Place kind",value:r=>r.kind}]} imageSlot={()=><MapIllustration/>} rowKey={r=>r.id} rowTitle={r=>r.name} rowHref={r=>`/app/places/${r.id}`} renderIdentity={r=><span className="block font-semibold [overflow-wrap:anywhere]">{r.name}</span>}
      searchControls={<CollectionFilters path="/app/places" noun="places" query={query} queryLabel="Search places" placeholder="Town, county, state, parish or country" searchLabel="Search"/>}
      emptyState={<p className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">No places match this search. Places appear here when connected to your evidence; clear the search to browse all loaded places.</p>}/>
  </CollectionPage>;
}
