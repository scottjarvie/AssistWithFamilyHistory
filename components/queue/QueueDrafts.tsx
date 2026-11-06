"use client";
import {createContext,useContext,useState,type ReactNode} from "react";
const Drafts=createContext<{values:Record<string,string>;change:(key:string,value:string)=>void}|null>(null);
const ReadonlyPreview=createContext(false);
/** Private, in-memory drafts. Parent is keyed by owner; nothing is stored after navigation/sign-out. */
export function QueueDrafts({children,readonlyPreview=false}:{children:ReactNode;readonlyPreview?:boolean}){
 const [values,setValues]=useState<Record<string,string>>({});
 return <ReadonlyPreview.Provider value={readonlyPreview}><Drafts.Provider value={{values,change:(key,value)=>setValues(previous=>({...previous,[key]:value}))}}>{children}</Drafts.Provider></ReadonlyPreview.Provider>;
}
export function useQueueDraft(key:string,initial="") {
 const drafts=useContext(Drafts);const [local,setLocal]=useState(initial);
 return [drafts?(drafts.values[key]??initial):local,(value:string)=>drafts?drafts.change(key,value):setLocal(value)] as const;
}
export const useQueuePreview=()=>useContext(ReadonlyPreview);
