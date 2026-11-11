import { api } from "@/convex/_generated/api";
import { getAuthedConvexClient } from "@/lib/convex/server";
async function readStorage() {
  try {
    const client=await getAuthedConvexClient();
    return {storage:await client.action(api.usageLimits.ownerStorage,{}),failed:false};
  } catch { return {storage:null,failed:true}; }
}
export async function StorageMeter() {
  const {storage,failed}=await readStorage();
  if(failed)return <p className="p-6">Storage is temporarily unavailable.</p>;
  if(!storage)return null;
  return <section className="mx-auto max-w-3xl p-6" aria-label="Storage"><h2>Storage</h2><p>{storage.line}</p>{storage.ready && <meter className="h-2 w-full" min={0} max={storage.capBytes || 1} value={Math.min(storage.usedBytes,storage.capBytes)} aria-label={storage.line}/>}</section>;
}
