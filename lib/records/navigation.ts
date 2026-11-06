const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(listener=>listener());
export const recordFragment=()=>window.location.hash.slice(1);
export const initialRecordFragment=()=>"";
export function subscribeRecordFragment(listener:()=>void) {
  if(!listeners.size){window.addEventListener("hashchange",notify);window.addEventListener("popstate",notify);}
  listeners.add(listener);
  return()=>{listeners.delete(listener);if(!listeners.size){window.removeEventListener("hashchange",notify);window.removeEventListener("popstate",notify);}};
}
/** Preserve Next's history state. Clicks create a back step; roving-keyboard changes replace it. */
export function navigateRecord(fragment:string,replace=false) {
  const url=new URL(window.location.href);url.hash=fragment;
  window.history[replace?"replaceState":"pushState"](window.history.state,"",url);
  notify();
}
export type RecordAlias={fragment:string;section:string;prefix?:boolean};
export function recordSectionFromFragment(fragment:string,aliases:readonly RecordAlias[]=[]) {
  if(fragment.startsWith("record-stream"))return "overview";
  const alias=aliases.find(alias=>alias.prefix?fragment.startsWith(alias.fragment):fragment===alias.fragment);
  if(alias)return alias.section;
  return fragment.startsWith("record-section-")?fragment.slice("record-section-".length):"overview";
}
