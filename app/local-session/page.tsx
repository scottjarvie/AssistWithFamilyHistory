import {LocalSessionBridge} from "@/components/LocalSessionBridge";
import {localPublicAuthEnabled} from "@/lib/localLiveAuth";
import {notFound} from "next/navigation";
export default async function LocalSessionPage({searchParams}:{searchParams:Promise<{returnTo?:string}>}){if(!localPublicAuthEnabled())notFound();const params=await searchParams;return <main><h1>Open your local vault</h1><LocalSessionBridge returnTo={params.returnTo||"/app"}/></main>;}
