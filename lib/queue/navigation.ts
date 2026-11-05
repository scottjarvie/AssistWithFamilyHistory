import {normalizeQueueFilters,type QueueFilterInput,type QueueFilters} from "./viewFilters";
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(listener=>listener());
export const initialQueueSnapshot=(filters:QueueFilterInput)=>JSON.stringify(normalizeQueueFilters(filters));
export const queueSnapshot=()=>initialQueueSnapshot(Object.fromEntries(new URLSearchParams(window.location.search)));
export function subscribeQueueURL(listener:()=>void){if(!listeners.size)window.addEventListener("popstate",notify);listeners.add(listener);return()=>{listeners.delete(listener);if(!listeners.size)window.removeEventListener("popstate",notify);};}
/** Preserve Next's history state and unrelated query keys; never reload an unfinished Queue form. */
export function navigateQueue(patch:Partial<QueueFilters>,replace=true){const url=new URL(window.location.href),filters=normalizeQueueFilters({...Object.fromEntries(url.searchParams),...patch});for(const [key,value] of Object.entries(filters)){if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);}window.history[replace?"replaceState":"pushState"](window.history.state,"",url);notify();}
