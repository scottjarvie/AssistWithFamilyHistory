"use client";
import { useState } from "react";
/** Policy tables accept future plan names without a code change. Values are bytes. */
export function UsagePolicyEditor({counterId,current}:{counterId?:string;current?:{planStoredBytes?:Record<string,number>;maxFileBytes?:Record<string,number>}}) {
 const [plans,setPlans]=useState(""),[caps,setCaps]=useState(""),[reason,setReason]=useState(""),[message,setMessage]=useState("");
 return <form className="space-y-4 p-6" onSubmit={async e=>{e.preventDefault();try{const limits={...(plans?{planStoredBytes:JSON.parse(plans)}:{}),...(caps?{maxFileBytes:JSON.parse(caps)}:{})};const r=await fetch("/api/usage-limits",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({counterId,limits,reason})});setMessage(r.ok?"Saved.":"Could not save policy.");}catch{setMessage("Enter a JSON table of names and byte counts.");}}}>
 <h3>Plan allowances and file caps {counterId?"for this account":"for the site"}</h3>
 <p>Current plan table</p><pre>{JSON.stringify(current?.planStoredBytes ?? {},null,2)}</pre><p>Current file caps</p><pre>{JSON.stringify(current?.maxFileBytes ?? {},null,2)}</pre><p>Enter changed keys only. Blank leaves values unchanged; null removes a key.</p>
 <label className="block">Plan table (JSON, bytes)<textarea className="block min-h-11 w-full border p-2 text-base" value={plans} onChange={e=>setPlans(e.target.value)} placeholder={'{"free": …, "pro": …}'}/></label>
 <label className="block">File caps (JSON, bytes; web, image, original)<textarea className="block min-h-11 w-full border p-2 text-base" value={caps} onChange={e=>setCaps(e.target.value)}/></label>
 <label className="block">Reason<input required className="block min-h-11 border p-2 text-base" value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <button className="min-h-11 border px-4" disabled={!reason.trim()}>Save policy tables</button><p role="status">{message}</p>
 </form>;
}
