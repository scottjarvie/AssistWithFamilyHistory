"use client";
import {useAuth} from "@clerk/nextjs";
import {useEffect,useState} from "react";
export function LocalSessionBridge({returnTo}: {returnTo?:string}){
 const {isLoaded,isSignedIn,getToken}=useAuth();const [error,setError]=useState("");
 useEffect(()=>{if(!isLoaded||!isSignedIn)return;
 let cancelled=false;
 const refresh=async()=>{try{
 const token=await getToken({template:"convex"});if(!token)throw Error("Your Clerk instance must provide its supported Convex token template.");
 const response=await fetch("/api/local-session",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
 if(!response.ok)throw Error("The local signed session/token handshake was refused.");
 if(!cancelled&&returnTo) window.location.replace(returnTo.startsWith("/app")&&!returnTo.startsWith("//")?returnTo:"/app");
 }catch(e){if(!cancelled)setError(e instanceof Error?e.message:"Local session unavailable");}};
 void refresh();const timer=setInterval(()=>void refresh(),30000);return()=>{cancelled=true;clearInterval(timer);};
 },[isLoaded,isSignedIn,getToken,returnTo]);
 if(!returnTo)return null;
 return <p role="status">{error || (!isLoaded ? "Loading your sign-in…" : !isSignedIn ? "Sign in to open your private vault." : "Connecting your verified session to the vault…")}</p>;
}
