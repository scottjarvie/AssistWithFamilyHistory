import {api} from "@/convex/_generated/api";
import type {Id} from "@/convex/_generated/dataModel";
import {getVaultAccessContext} from "@/lib/vault/server";
import {getAuthedConvexClient} from "@/lib/convex/server";
import {QueueOriginRecordView} from "@/components/queue/QueueOriginRecordView";
import {notFound} from "next/navigation";
export const dynamic="force-dynamic";
export default async function QueueOriginPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,{vaultOwnerId}=await getVaultAccessContext();const client=await getAuthedConvexClient();
 const record=await client.mutation(api.queue.getQueueOrigin,{vaultOwnerId,queueItemId:id as Id<"queueItems">});if(!record)notFound();
 return <QueueOriginRecordView record={record} queueItemId={id}/>;
}
