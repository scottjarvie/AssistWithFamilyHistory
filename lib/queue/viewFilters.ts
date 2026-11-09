import {QUEUE_CONDITIONS,QUEUE_STATES} from "./contract";
import type {QueueItemRecord} from "./presentation";
export type QueueFilters={suggestions:string;archived:string;q:string;state:string;view:string;priority:string;condition:string;actor:string;item:string};
export type QueueFilterInput=Partial<Record<keyof QueueFilters,string|string[]>>;
export function normalizeQueueFilters(input:QueueFilterInput):QueueFilters {
 const value=(key:keyof QueueFilters)=>{const raw=input[key];return typeof raw==="string"?raw:Array.isArray(raw)&&typeof raw[0]==="string"?raw[0]:"";};
 const state=value("state"),priority=value("priority"),condition=value("condition"),actor=value("actor"),view=value("view");
 return {suggestions:value("suggestions")==="true"?"true":"",archived:value("archived")==="true"?"true":"",q:value("q"),state:view==="done-week"?"done":(state==="needs_you"||QUEUE_STATES.some(item=>item===state))?state:"",view:view==="done-week"?view:"",priority:["high","normal","low"].includes(priority)?priority:"",condition:QUEUE_CONDITIONS.some(item=>item===condition)?condition:"",actor:["user","chosen_ai","first_party_ai","system","ai"].includes(actor)?actor:"",item:value("item")};
}
export function startOfQueueWeekUTC(now:number){const date=new Date(now);date.setUTCHours(0,0,0,0);date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));return date.getTime();}
/** State is queried by the existing backend. Additional facets only describe loaded items. */
export function queueMatchesView(item:QueueItemRecord,filters:QueueFilters,now:number){
 const query=filters.q.trim().toLowerCase();
 const closedAt=item.completedAt??item.canceledAt,week=startOfQueueWeekUTC(now);
 return (!filters.state||(filters.state==="needs_you"?!!item.needsInput:item.state===filters.state))&&(!query||`${item.summary} ${item.directive} ${item.requestedOutcome||""}`.toLowerCase().includes(query))&&(!filters.priority||item.priority===filters.priority)&&(!filters.condition||item.condition===filters.condition)&&(!filters.actor||(filters.actor==="ai"?item.activeActorKind==="chosen_ai"||item.activeActorKind==="first_party_ai":item.activeActorKind===filters.actor))&&(filters.view!=="done-week"||(item.state==="done"&&typeof closedAt==="number"&&closedAt>=week&&closedAt<week+7*86400000));
}
