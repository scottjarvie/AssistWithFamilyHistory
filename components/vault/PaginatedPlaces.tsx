"use client";
import { useEffect,useRef,useState } from "react";
import { loadPlaces } from "@/app/app/places/actions";
import { PlaceCollectionView } from "./PlaceCollectionView";
type Page=Awaited<ReturnType<typeof loadPlaces>>;
export function PaginatedPlaces({initial,query,vaultOwnerId,preferenceKey}:{initial:Page;query?:string;vaultOwnerId:string;preferenceKey:string}) {
 const[result,setResult]=useState(initial),[target,setTarget]=useState(50),[error,setError]=useState(false);
 const busy=useRef(false),alive=useRef(true);const searching=!result.isDone&&result.page.length<target;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!searching||error||busy.current)return;busy.current=true;
  loadPlaces({expectedOwner:vaultOwnerId,cursor:result.continueCursor,search:query}).then(next=>{busy.current=false;if(alive.current)setResult(old=>old.mediaMode!==next.mediaMode?next:({...next,page:[...new Map([...old.page,...next.page].map(p=>[p.id,p])).values()]}));}).catch(()=>{busy.current=false;if(alive.current)setError(true);});
 },[searching,error,result.continueCursor,query,vaultOwnerId]);
 return <><PlaceCollectionView places={result.page} query={query} preferenceKey={preferenceKey} total={result.total} mediaMode={result.mediaMode} onLoadMore={!result.isDone&&!searching?()=>setTarget(target+50):undefined}/>{searching&&!error&&<p role="status" className="px-4 pb-6 sm:px-8">Searching places… {result.page.length} found so far.</p>}{error&&<p role="alert" className="px-4 pb-6">Could not continue. Reload if you changed trees, or <button className="underline" onClick={()=>setError(false)}>Try again</button>.</p>}</>;
}
