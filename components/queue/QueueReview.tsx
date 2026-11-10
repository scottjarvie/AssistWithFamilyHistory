"use client";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {SafeLink} from "@/components/layout/SafeLink";
import type {QueueItemRecord} from "@/lib/queue/presentation";
import {toast} from "sonner";

export function QueueOrigin({item,linkOrigin=false}:{item:QueueItemRecord;linkOrigin?:boolean}){
 return <div className="mt-2 space-y-1 text-xs font-normal leading-5 text-muted-foreground">
 {item.addedBy==="ai_suggestion"?<span className="rounded border border-border bg-muted px-2 py-1">{item.suggestionStatus==="accepted"?"from AI suggestion":"AI suggestion"} · {item.aiName||"Your AI"}</span>:item.addedBy==="ai_on_request"?<span>Added by your AI</span>:null}
 {item.needsInput&&<p className="font-semibold text-primary">Needs your input · {item.needsInput.question}</p>}
 {item.archivedAt&&<p>Archived{item.suggestionStatus==="withdrawn"?" · withdrawn by AI":""}</p>}
 {item.fromRecord&&<p>{linkOrigin?<SafeLink href={`/app/queue/origin/${encodeURIComponent(item._id)}`} className="text-primary underline">From: {item.fromRecordTitle||item.fromRecord.kind.replaceAll("_"," ")}</SafeLink>:<>From: {item.fromRecordTitle||item.fromRecord.kind.replaceAll("_"," ")}</>}</p>}
 </div>;
}
export function QueueReview({item,readonlyPreview,onChanged}:{item:QueueItemRecord;readonlyPreview:boolean;onChanged:(item:QueueItemRecord)=>void}){
 const [editing,setEditing]=useState(false),[directive,setDirective]=useState(item.directive),[reason,setReason]=useState(""),[option,setOption]=useState(""),[busy,setBusy]=useState(false);
 async function run(action:string){if(readonlyPreview)return false;setBusy(true);try{const r=await fetch(`/api/queue/${item._id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({command:"review",action,expectedVersion:item.version,idempotencyKey:crypto.randomUUID(),...(action==="accept"&&editing?{directive}:{}),...(action==="accept"&&option!==""?{optionIndex:Number(option)}:{}),...(action==="dismiss"?{reason}: {})})});const p=await r.json();if(!r.ok||!p.item)throw new Error(p.details||p.error||"Could not save decision");onChanged(p.item);return true;}catch(e){toast.error(e instanceof Error?e.message:"Could not save decision");return false;}finally{setBusy(false);}}
 return <section aria-label="Queue review" className="my-4 space-y-3 [&_button]:scroll-mt-24 [&_textarea]:scroll-mt-24">
 {item.fromRecord&&<SafeLink href={`/app/queue/origin/${encodeURIComponent(item._id)}`} className="text-sm text-primary underline">From: {item.fromRecordTitle||item.fromRecord.kind.replaceAll("_"," ")}</SafeLink>}
 {item.suggestionReason&&<p className="text-sm leading-6">Why: {item.suggestionReason}</p>}
 {!!item.suggestionOptions?.length&&<fieldset><legend className="text-sm font-semibold">Options</legend>{item.suggestionOptions.map((o,i)=><label key={i} className="flex min-h-11 gap-2 text-sm"><input type="radio" name={`option-${item._id}`} value={i} checked={option===String(i)} onChange={()=>{setOption(String(i));if(editing)setDirective(`${item.directive}\nChosen option: ${o}`);}}/>{String.fromCharCode(97+i)}. {o}</label>)}</fieldset>}
 {item.suggestionEvidence?.map((e,i)=><p key={i} className="text-xs text-muted-foreground">Evidence: {e}</p>)}
 {item.dismissReason!==undefined&&<p className="whitespace-pre-wrap text-sm">Dismiss reason: {item.dismissReason||"No reason given"}</p>}
 {item.archivedAt?<div className="flex gap-2"><Button disabled={busy||readonlyPreview} variant="outline" onClick={()=>run("restore")}>Restore</Button>{item.needsInput&&<Button disabled variant="outline">Archive</Button>}</div>:item.suggestionStatus==="open"?<>
 {editing&&<label className="block text-sm">Edit before accepting<textarea aria-label="Edit suggestion wording" className="mt-2 min-h-28 w-full rounded border border-border bg-background p-3" value={directive} onChange={e=>setDirective(e.target.value)}/></label>}
 <div className="flex flex-wrap gap-2"><Button disabled={busy||readonlyPreview} onClick={()=>run("accept")}>{editing?"Accept edited wording":"Accept"}</Button><Button disabled={busy} variant="outline" onClick={async()=>{if(!editing&&!readonlyPreview&&!await run("edit"))return;if(!editing&&option!=="")setDirective(`${item.directive}\nChosen option: ${item.suggestionOptions?.[Number(option)]}`);setEditing(!editing);}}>Edit first</Button></div>
 <label className="block text-sm">Dismiss reason (optional)<textarea aria-label="Dismiss reason (optional)" className="mt-2 w-full rounded border border-border bg-background p-2" value={reason} onChange={e=>setReason(e.target.value)}/></label><Button disabled={busy||readonlyPreview} variant="outline" onClick={()=>run("dismiss")}>Dismiss</Button><p className="text-xs text-muted-foreground">Nothing runs until you accept. Your decision does not accept a family-history conclusion.</p>
 </>:<div className="flex gap-2"><Button disabled={busy||readonlyPreview} variant="outline" onClick={()=>run("archive")}>Archive</Button>{item.needsInput&&<Button disabled={busy||readonlyPreview} variant="outline" onClick={()=>run("clear_input")}>Clear Needs your input</Button>}</div>}
 </section>;
}

/** A person can archive a flagged item directly wherever its question is shown. */
export function QueueArchiveButton({item,readonlyPreview,onChanged}:{item:QueueItemRecord;readonlyPreview:boolean;onChanged:(item:QueueItemRecord)=>void}){
 const [busy,setBusy]=useState(false);
 async function archive(){if(readonlyPreview||item.archivedAt)return;setBusy(true);try{const response=await fetch(`/api/queue/${item._id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({command:"review",action:"archive",expectedVersion:item.version,idempotencyKey:crypto.randomUUID()})});const body=await response.json();if(!response.ok||!body.item)throw new Error(body.details||body.error||"Could not archive item");onChanged(body.item);}catch(error){toast.error(error instanceof Error?error.message:"Could not archive item");}finally{setBusy(false);}}
 return <Button variant="outline" className="min-h-11" disabled={busy||readonlyPreview||!!item.archivedAt} onClick={archive}>Archive</Button>;
}
