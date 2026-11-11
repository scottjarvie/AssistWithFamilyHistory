"use client";
import { UsagePolicyEditor } from "./UsagePolicyEditor";
import { useEffect,useState } from "react";
import { UsageLimitsView, type UsageOverview, type LimitEdit } from "./UsageLimitsView";
export function UsageLimitsController() {
 const [data,setData]=useState<UsageOverview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const refresh=async()=>{const r=await fetch("/api/usage-limits");if(r.ok)setData(await r.json());};
 useEffect(()=>{void refresh();},[]);
 const save=async(edit:LimitEdit,counterId?:string)=>{setBusy(true);try{const r=await fetch("/api/usage-limits",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...edit,counterId})});if(!r.ok)throw new Error("Storage settings could not be saved.");await refresh();}catch(e){setError(String(e));}finally{setBusy(false);}};
 return <>{error&&<p role="alert">{error}</p>}{data&&<UsageLimitsView data={data} busy={busy} onSaveSite={edit=>save(edit)} onSavePerson={(id,edit)=>save(edit,id)}/>}{data&&<><UsagePolicyEditor/>{data.people.map(person=><details key={person.id}><summary className="min-h-11 p-3">Policy tables: {person.label}</summary><UsagePolicyEditor counterId={person.id}/></details>)}</>}</>;
}
