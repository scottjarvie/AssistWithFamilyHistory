import { ConvexError } from "convex/values";
import { mcpLimitText, type UsageLimitError, type FileTooLarge } from "../../convex/lib/usageLimits/core";
export type UploadRefusal=UsageLimitError|FileTooLarge;
/** Decode directly at the function that owns the check, never from an exception string. */
export function uploadRefusalOf(error:unknown):UploadRefusal|null {
 if(!(error instanceof ConvexError))return null;
 const data=error.data as {usage?:UsageLimitError;code?:string};
 return data?.usage ?? (data?.code==="FILE_TOO_LARGE"?data as FileTooLarge:null);
}
export function mcpUploadRefusal(refusal:UploadRefusal) {
 const recovery=refusal.code==="USAGE_LIMIT_REACHED"?"For a begin refusal, retry the same operation once the person has more room or after the stated reset. For a finish refusal, begin again with a new operation ID after cleanup.":"Use a file within the stated cap and begin with a new operation ID.";
 return {isError:true,content:[{type:"text" as const,text:refusal.code==="USAGE_LIMIT_REACHED"?mcpLimitText(refusal):refusal.message}],structuredContent:{...refusal,error:{...refusal,recovery}}};
}
