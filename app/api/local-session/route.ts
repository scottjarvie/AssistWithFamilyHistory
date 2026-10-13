import {NextRequest,NextResponse} from "next/server";
import {localPublicAuthEnabled,localSandboxEnabled,LOCAL_SANDBOX_ORIGINS,LOCAL_LIVE_ORIGINS,verifyLocalSession,verifyLocalConvexToken,LOCAL_CONVEX_COOKIE} from "@/lib/localLiveAuth";
export async function POST(request:NextRequest){
 if(!localPublicAuthEnabled()) return new NextResponse("Unavailable",{status:404});
 const origin=request.headers.get("origin");
 const allowed=localSandboxEnabled()?LOCAL_SANDBOX_ORIGINS:LOCAL_LIVE_ORIGINS;
 if(!allowed.some(value=>value===origin && new URL(value).host===request.headers.get("host")))return new NextResponse("Origin rejected",{status:403});
 const length=Number(request.headers.get("content-length"));
 if(length>16384)return new NextResponse("Body too large",{status:413});
 const body=await request.text();if(body.length>16384)return new NextResponse("Body too large",{status:413});
 let token:unknown;try{token=JSON.parse(body).token;}catch{return new NextResponse("Invalid body",{status:400});}
 const session=await verifyLocalSession(request.cookies.get("__session")?.value);
 const verified=await verifyLocalConvexToken(typeof token==="string"?token:undefined,session);
 if(!verified)return new NextResponse("Signed session/token required",{status:401});
 const response=NextResponse.json({ready:true},{headers:{"Cache-Control":"private, no-store"}});
 response.cookies.set(LOCAL_CONVEX_COOKIE,verified.token,{httpOnly:true,secure:origin?.startsWith("https:")??false,sameSite:"strict",path:"/",maxAge:Math.min(300,Math.max(1,verified.expiresAt-Math.floor(Date.now()/1000)))});
 return response;
}
