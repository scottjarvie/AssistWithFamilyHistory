"use client";
import {useState,type ComponentProps} from "react";

/** Defer an unopened section's images and controls, then preserve its drafts after the first visit. */
export function VisitedRecordPanel({active,children,...props}:ComponentProps<"section">&{active:boolean}) {
  const [opened,setOpened]=useState(active);
  if(active&&!opened)setOpened(true);
  return <section {...props} hidden={!active}>{active||opened?children:null}</section>;
}
