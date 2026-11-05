import type {Metadata} from "next";
import {api} from "@/convex/_generated/api";
import {AuditWorkspace} from "@/components/audit/AuditWorkspace";
import {VaultStateCard} from "@/components/vault/VaultStateCard";
import {getAuthedConvexClient,getConvexRuntimeIssue,getConvexUnavailableState,isConvexConfigured} from "@/lib/convex/server";
import {createPageMetadata} from "@/lib/seo";
import {getVaultAccessContext} from "@/lib/vault/server";
import {projectAuditSummary} from "@/lib/audit/presentation";
export const metadata:Metadata=createPageMetadata({title:"Vault Audit",description:"Audit research vault coverage and story readiness gaps.",path:"/app/audit"});
export const dynamic="force-dynamic";
export default async function VaultAuditPage({searchParams}:{searchParams:Promise<{view?:string;q?:string}>}) {
  if(!isConvexConfigured()) {const issue=getConvexUnavailableState("Vault Audit","The audit needs the canonical Convex research vault.");return <div className="p-6 sm:p-8"><VaultStateCard title={issue.title} description={issue.description}/></div>;}
  const {vaultOwnerId}=await getVaultAccessContext();
  const client=await getAuthedConvexClient();
  let audit;
  try {audit=await client.action(api.vaultReads.getVaultAudit,{vaultOwnerId});}
  catch(error){const issue=getConvexRuntimeIssue(error);return <div className="p-6 sm:p-8"><VaultStateCard title={issue.title} description={issue.description}/></div>;}
  const params=await searchParams;
  return <AuditWorkspace key={vaultOwnerId} summary={projectAuditSummary(audit)} preferenceKey={`awf.collection.audit.${vaultOwnerId}`} initialView={params.view} initialQuery={params.q}/>;
}
