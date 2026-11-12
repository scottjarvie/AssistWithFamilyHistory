import { createHmac, timingSafeEqual } from "node:crypto";
const TTL_MS = 5 * 60_000;
function signature(value:string) {
  const key=process.env.CLERK_SECRET_KEY;
  if(!key) throw new Error("Playback signing is unavailable.");
  return createHmac("sha256",key).update(`media-playback:${value}`).digest("base64url");
}
export function mintPlaybackCapability(owner:string,mediaId:string,now=Date.now()) {
  const value=Buffer.from(JSON.stringify({owner,mediaId,expiresAt:now+TTL_MS})).toString("base64url");
  return `${value}.${signature(value)}`;
}
export function permitsPlayback(token:string,owner:string,mediaId:string,now=Date.now()) {
  try {
    const [value,mac,...extra]=token.split(".");
    if(extra.length || !value || !mac) return false;
    const expected=Buffer.from(signature(value));const supplied=Buffer.from(mac);
    if(expected.length!==supplied.length || !timingSafeEqual(expected,supplied)) return false;
    const data=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));
    return data.owner===owner && data.mediaId===mediaId && data.expiresAt>now && data.expiresAt<=now+TTL_MS;
  } catch {return false;}
}
