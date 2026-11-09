import type {QueueState} from "./contract";
export type QueueIdentity = {
 state: QueueState; createdByActorKind?: string; addedBy?: "person" | "ai_on_request" | "ai_suggestion";
 needsInput?: {question:string;raisedAt:number;actorId:string}; requiredAction?:string;
 pickedUpAt?:number; resultSummary?:string; updatedAt?:number; createdByActorId?:string;
};
export function queueIdentity<T extends QueueIdentity>(item:T):T {
 const state=item.state==="needs_you"?(item.resultSummary?"done":item.pickedUpAt!==undefined?"working":"waiting_for_your_ai"):item.state;
 return {...item,state,addedBy:item.addedBy??(item.createdByActorKind&&item.createdByActorKind!=="user"?"ai_on_request":"person"),needsInput:item.needsInput??(item.state==="needs_you"?{question:item.requiredAction||"How should this continue?",raisedAt:item.updatedAt??0,actorId:"legacy"}:undefined)};
}
export const queueIsOpenSuggestion=(item:{suggestionStatus?:string})=>item.suggestionStatus==="open";

/** New suggestion reads inherit selected-person reach; unlinked suggestions fail closed. */
export function suggestionWithinPeople(item:{addedBy?:string;suggestionStatus?:string;fromRecord?:{kind:string;refId:string}},personIds?:string[]){
 return personIds===undefined||(!item.suggestionStatus&&item.addedBy!=="ai_suggestion")||(item.fromRecord?.kind==="person"&&personIds.includes(item.fromRecord.refId));
}
