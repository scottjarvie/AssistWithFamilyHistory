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
export function recordSectionFromFragment(fragment:string) {
  if(fragment.startsWith("record-stream")||fragment==="record-context")return "overview";
  if(fragment.startsWith("record-source-facts"))return "sources";
  return fragment.startsWith("record-section-")?fragment.slice("record-section-".length):"overview";
}
