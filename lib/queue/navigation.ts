import {normalizeQueueFilters,type QueueFilterInput,type QueueFilters} from "./viewFilters";
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(listener=>listener());
const sheetHistoryKey="__awfQueueSheetFromList";
export const initialQueueSnapshot=(filters:QueueFilterInput)=>JSON.stringify(normalizeQueueFilters(filters));
const firstValues=(params:URLSearchParams)=>Object.fromEntries([...new Set(params.keys())].map(key=>[key,params.get(key)||""]));
export const queueSnapshot=()=>initialQueueSnapshot(firstValues(new URLSearchParams(window.location.search)));
export function subscribeQueueURL(listener:()=>void){if(!listeners.size)window.addEventListener("popstate",notify);listeners.add(listener);return()=>{listeners.delete(listener);if(!listeners.size)window.removeEventListener("popstate",notify);};}
/** Preserve Next's history state and unrelated keys; no draft-bearing form reload. */
export function navigateQueue(patch:Partial<QueueFilters>,replace=true){
 const url=new URL(window.location.href),before=normalizeQueueFilters(firstValues(url.searchParams)),filters=normalizeQueueFilters({...before,...patch});
 for(const [key,value] of Object.entries(filters)){if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);}
 const state={...window.history.state};
 if(!replace&&filters.item&&!before.item)state[sheetHistoryKey]=url.pathname;
 if(!filters.item)delete state[sheetHistoryKey];
 window.history[replace?"replaceState":"pushState"](state,"",url);notify();
}
/** The entry carries provenance across Back/Forward and reload, without storing records. */
export function closeQueueSelection(){
 if(window.history.state?.[sheetHistoryKey]===window.location.pathname)window.history.back();
 else navigateQueue({item:""});
}
