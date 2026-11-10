"use client";
import {useRouter} from "next/navigation";
import {useEffect,useSyncExternalStore,type ReactNode} from "react";
const subscribeHydration=()=>()=>{};
const clientHydrated=()=>true;
const serverHydrated=()=>false;
/** Synthetic harness only: keep real production link targets in markup while routing list navigation to invented fixtures. */
export function FixtureNavigation({surface,children,theme}:{surface:string;children:ReactNode;theme?:string}) {
 const router=useRouter();
 const hydrated=useSyncExternalStore(subscribeHydration,clientHydrated,serverHydrated);
 useEffect(()=>{const previous=document.documentElement.classList.contains("dark");document.documentElement.classList.toggle("dark",theme==="dark");return()=>{document.documentElement.classList.toggle("dark",previous);};},[theme]);
 const routes:Record<string,string>={"/app":"home","/app/settings/ai":"settings-ai","/app/settings":"settings-provider","/app/api":"settings-api","/app/api/admin":"settings-admin","/app/audit":"audit","/app/operations":"operations","/app/queue":"queue","/app/people":"people","/app/places":"places","/app/stories":"stories","/app/research":"research","/app/story-writer":"writing"};
 return <div data-fixture-hydrated={hydrated} onSubmitCapture={e=>{const form=e.target as HTMLFormElement;if(form.method.toLowerCase()!=="get")return;
  const action=new URL(form.action||location.href);if(routes[action.pathname])form.action="/design-council-preview";
  const current=new URL(location.href);for(const [name,value] of Object.entries({surface,theme:theme||"",fixtureOwner:current.searchParams.get("fixtureOwner")||""})){
   let input=form.querySelector<HTMLInputElement>(`input[name="${name}"]`);if(!input){input=document.createElement("input");input.type="hidden";input.name=name;form.append(input);}input.value=value;
  }
 }}
  onClickCapture={e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;const anchor=(e.target as Element).closest<HTMLAnchorElement>("a[href]");if(!anchor||anchor.target)return;const url=new URL(anchor.href);if(url.pathname==="/app/queue"&&surface.startsWith("queue"))return;const next=routes[url.pathname];if(url.origin!==location.origin||!next)return;e.preventDefault();url.pathname="/design-council-preview";url.searchParams.set("surface",next);if(next==="audit"||next.startsWith("settings-")){const current=new URL(location.href);for(const key of ["theme","fixtureOwner"]){const value=current.searchParams.get(key);if(value)url.searchParams.set(key,value);}router.push(url.pathname+url.search+url.hash);}else location.assign(url.toString());}}>{children}</div>;
}
