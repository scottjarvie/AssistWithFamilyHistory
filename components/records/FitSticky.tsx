"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** A dossier sticks only while its complete contents fit; tall cards remain ordinary page content. */
export function FitSticky({children}:{children:ReactNode}) {
  const ref=useRef<HTMLDivElement>(null);
  const [fits,setFits]=useState(false);
  useEffect(()=>{
    const measure=()=>{if(ref.current)setFits(innerWidth>=1024&&ref.current.getBoundingClientRect().height+32<innerHeight);};
    const observer=new ResizeObserver(measure);
    if(ref.current)observer.observe(ref.current);
    const frame=requestAnimationFrame(measure);
    window.addEventListener("resize",measure);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener("resize",measure);};
  },[]);
  return <div ref={ref} style={fits?{position:"sticky",top:16}:undefined}>{children}</div>;
}
