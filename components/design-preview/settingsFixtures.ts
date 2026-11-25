import {FAMILY_HISTORY_SCOPES} from "@/lib/mcp/catalog";
import type {ConnectionRow,ConnectionActivityRow} from "@/lib/mcp/connectionApi";
import type {ApiKeyRow} from "@/components/api/ApiKeyManager";
const day=86400000,now=Date.parse("2026-11-05T12:00:00Z");
const base:ConnectionRow={id:"synthetic-grant",label:"Invented research companion",observedClientName:"Invented desktop assistant",clientId:"https://client.example.test/invented",issuer:"https://identity.example.test",clientProvenance:"manual",clientMetadataUrl:null,scopes:[...FAMILY_HISTORY_SCOPES],scopeChoice:"full",boundary:{kind:"whole_workspace"},status:"active",requestedAt:now-20*day,consentedAt:now-19*day,issuedAt:now-19*day,expiresAt:null,lastUsedAt:now-day,lastToolName:"family_history_get_brief",revokedAt:null,revokedReason:null,useCount:23,consentSnapshot:JSON.stringify({shownAt:now-19*day})};
export const settingsConnections:ConnectionRow[]=[
 {...base,id:"synthetic-full"},
 {...base,id:"synthetic-chosen",label:"Invented evidence helper",scopes:FAMILY_HISTORY_SCOPES.slice(0,3),scopeChoice:"chosen",boundary:{kind:"selected_people",personIds:["synthetic-eleanor","synthetic-samuel"]},expiresAt:now+30*day,useCount:7},
 {...base,id:"synthetic-pending",label:"Invented incoming request",status:"pending",scopes:[],scopeChoice:"chosen",boundary:{kind:"queue_only"},consentedAt:null,issuedAt:null,lastUsedAt:null,lastToolName:null,useCount:0,consentSnapshot:null},
 {...base,id:"synthetic-revoked",label:"Invented former assistant",status:"revoked",scopes:FAMILY_HISTORY_SCOPES.slice(0,2),scopeChoice:"chosen",revokedAt:now-2*day,revokedReason:"Finished this research pass."},
 {...base,id:"synthetic-expired",label:"Invented timed assistant",status:"expired",expiresAt:now-day,scopes:FAMILY_HISTORY_SCOPES.slice(0,1),scopeChoice:"chosen"},
 {...base,id:"synthetic-denied",label:"Invented declined request",status:"denied",revokedAt:now-3*day,revokedReason:"I did not recognise this request.",consentedAt:null,issuedAt:null,consentSnapshot:null},
];
export const settingsActivity:ConnectionActivityRow[]=(["ok","denied","rate_limited","error"] as const).map((outcome,index)=>({id:`synthetic-activity-${index}`,at:now-index*day,tool:"family_history_get_brief",outcome,detail:null,grantId:"synthetic-full",clientId:base.clientId}));
export const settingsKeys:ApiKeyRow[]=[
 {keyId:"synthetic-key-active",label:"Invented laptop key",scopes:["context:read"],tier:"standard",status:"active",createdAt:now-5*day,lastUsedAt:now-day,expiresAt:now+30*day},
 {keyId:"synthetic-key-stale",label:"Invented old workstation",scopes:["context:read","tasks:write"],tier:"trial",status:"active",createdAt:now-70*day},
 {keyId:"synthetic-key-suspended",label:"Invented paused key",scopes:["context:read"],tier:"trusted",status:"suspended",createdAt:now-10*day,lastUsedAt:now-5*day},
 {keyId:"synthetic-key-revoked",label:"Invented retired key",scopes:["context:read"],tier:"trial",status:"revoked",createdAt:now-40*day,revokedAt:now-day},
];
