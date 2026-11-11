import { getVaultAccessContext } from "@/lib/vault/server";
import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient } from "@/lib/convex/server";
export async function GET() {
  try { await getVaultAccessContext(); const c=await getAuthedConvexClient();return NextResponse.json(await c.action(api.usageLimits.adminOverview,{})); }
  catch {return NextResponse.json({error:"Unavailable"},{status:403});}
}
export async function POST(request:Request) {
  try {await getVaultAccessContext();const {counterId,...edit}=await request.json();const c=await getAuthedConvexClient();
    const result=counterId ? await c.mutation(api.usageLimits.adminSetPersonLimits,{counterId,...edit}) : await c.mutation(api.usageLimits.adminSetSiteLimits,edit);
    return NextResponse.json(result);
  } catch {return NextResponse.json({error:"The settings could not be saved."},{status:400});}
}
