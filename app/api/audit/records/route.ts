import {NextRequest, NextResponse} from "next/server";
import {api} from "@/convex/_generated/api";
import {getAuthedConvexClient, getConvexRuntimeIssue, isConvexConfigured} from "@/lib/convex/server";
import {getVaultAccessContext} from "@/lib/vault/server";
import {isAuditMetric} from "@/lib/audit/contract";

const headers = {"Cache-Control":"private, no-store"};
export async function GET(request: NextRequest) {
  const metric = request.nextUrl.searchParams.get("metric") || "";
  const rawOffset = request.nextUrl.searchParams.get("offset") ?? "0";
  const offset = Number(rawOffset);
  if (!isAuditMetric(metric) || !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset)) {
    return NextResponse.json({success:false,error:"Choose a valid Audit metric and page offset."}, {status:400,headers});
  }
  if (!isConvexConfigured()) return NextResponse.json({success:false,error:"Audit records are unavailable. Connect the research vault and try again."}, {status:503,headers});
  try {
    const {vaultOwnerId} = await getVaultAccessContext();
    const client = await getAuthedConvexClient({requireAuthentication:true});
    const result = await client.action(api.vaultReads.getVaultAudit, {vaultOwnerId,metric,offset});
    // Never return the legacy audit object: it includes raw recentContext.
    return NextResponse.json({success:true,page:result.records}, {headers});
  } catch (error) {
    const issue = getConvexRuntimeIssue(error);
    return NextResponse.json({success:false,error:issue.title,details:issue.description}, {status:issue.statusCode,headers});
  }
}
