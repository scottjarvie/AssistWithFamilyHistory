import { ConvexError } from "convex/values";
import { mcpLimitText, type UsageLimitError, type FileTooLarge } from "../../convex/lib/usageLimits/core";
export type UploadAttemptRefusal = { code: "UPLOAD_ATTEMPT_CLOSED"; message: string; recovery: string; resetsAt: string; remaining?: number };
export function uploadAttemptRefusal(expiresAt: number, remaining?: number): UploadAttemptRefusal {
 const resetsAt = new Date(expiresAt).toISOString();
 const recovery = "If the bytes are visibly stored, first call family_history_begin_evidence_upload again with the same operation ID and content to adopt them. Otherwise start a new upload now with a new operation ID. If there is not enough room for both, the new upload is refused for room; retry that new operation after the earlier attempt expires and ordinary cleanup releases its hold.";
 return { code: "UPLOAD_ATTEMPT_CLOSED", message: `This upload attempt cannot be resumed by sending bytes again. ${recovery} The earlier attempt keeps its reserved room until it expires at ${resetsAt}; ordinary cleanup releases that room.`, recovery, resetsAt, ...(remaining === undefined ? {} : { remaining }) };
}
export type UploadRefusal=UploadAttemptRefusal|UsageLimitError|FileTooLarge|{code:"INVALID_AUDIO_CONTAINER"|"UNSUPPORTED_AUDIO_TYPE"|"AUDIO_HAS_VIDEO"|"AUDIO_TOO_LONG";message:string};
/** Decode directly at the function that owns the check, never from an exception string. */
export function uploadRefusalOf(error:unknown):UploadRefusal|null {
 if(!(error instanceof ConvexError))return null;
 const data=error.data as {usage?:UsageLimitError;code?:string};
 return data?.usage ?? (data?.code==="FILE_TOO_LARGE"?data as FileTooLarge:null);
}
export function mcpUploadRefusal(refusal:UploadRefusal) {
 const recovery=refusal.code==="UPLOAD_ATTEMPT_CLOSED"?refusal.recovery:refusal.code==="USAGE_LIMIT_REACHED"?"For a begin refusal, retry the same operation once the person has more room or after the stated reset. For a finish refusal, begin again with a new operation ID after cleanup.":"Use a file within the stated cap and begin with a new operation ID.";
 return {isError:true,content:[{type:"text" as const,text:refusal.code==="USAGE_LIMIT_REACHED"?mcpLimitText(refusal):refusal.message}],structuredContent:{...refusal,error:{...refusal,recovery}}};
}
