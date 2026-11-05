"use client";
import {useEffect,type ReactNode} from "react";
/** Synthetic harness only: keep real production link targets in markup while routing list navigation to invented fixtures. */
export function FixtureNavigation({surface,children,theme}:{surface:string;children:ReactNode;theme?:string}) {
 useEffect(()=>{const previous=document.documentElement.classList.contains("dark");document.documentElement.classList.toggle("dark",theme==="dark");return()=>{document.documentElement.classList.toggle("dark",previous);};},[theme]);
 const routes:Record<string,string>={"/app":"home","/app/queue":"queue","/app/people":"people","/app/places":"places","/app/stories":"stories","/app/research":"research","/app/story-writer":"writing"};
 return <div onSubmitCapture={e=>{const form=e.target as HTMLFormElement;if(form.method.toLowerCase()!=="get")return;let input=form.querySelector<HTMLInputElement>('input[name="surface"]');if(!input){input=document.createElement("input");input.type="hidden";input.name="surface";form.append(input);}input.value=surface;}}
  onClickCapture={e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;const anchor=(e.target as Element).closest<HTMLAnchorElement>("a[href]");if(!anchor||anchor.target)return;const url=new URL(anchor.href);if(url.pathname==="/app/queue"&&surface.startsWith("queue"))return;const next=routes[url.pathname];if(url.origin!==location.origin||!next)return;e.preventDefault();url.pathname="/design-council-preview";url.searchParams.set("surface",next);location.assign(url.toString());}}>{children}</div>;
}
