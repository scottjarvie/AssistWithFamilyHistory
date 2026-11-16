"use server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PlaceSection, SectionPage } from "@/convex/placePages";
import { getAuthedConvexClient } from "@/lib/convex/server";
import { getVaultAccessContext } from "@/lib/vault/server";
import { projectPlaceRow } from "@/lib/vault/collectionRows";
async function context(expectedOwner:string){const {vaultOwnerId}=await getVaultAccessContext();if(vaultOwnerId!==expectedOwner)throw new Error("The active tree changed. Reload Places.");return {vaultOwnerId,client:await getAuthedConvexClient()};}
export async function loadPlaces(input:{expectedOwner:string;cursor:string|null;search?:string}) {
 const {vaultOwnerId,client}=await context(input.expectedOwner);
 const result=await client.action(api.vaultReads.getPlacesPage,{vaultOwnerId,cursor:input.cursor,search:input.search});
 return {...result,page:result.page.map(projectPlaceRow)};
}
export async function loadPlaceSection<S extends PlaceSection>(input:{expectedOwner:string;placeId:string;section:S;cursor:string|null}):Promise<SectionPage<S>> {
 const {vaultOwnerId,client}=await context(input.expectedOwner);
 return await client.action(api.vaultReads.getPlaceSection,{vaultOwnerId,placeId:input.placeId as Id<"places">,section:input.section,cursor:input.cursor}) as SectionPage<S>;
}
export async function loadPlaceMentions(input:{expectedOwner:string;placeId:string}) {
 const {vaultOwnerId,client}=await context(input.expectedOwner);
 return client.action(api.vaultReads.getPlaceMentions,{vaultOwnerId,placeId:input.placeId as Id<"places">});
}
export async function linkPlaceMedia(input:{expectedOwner:string;placeId:string;mediaId:string}) {
 const {vaultOwnerId,client}=await context(input.expectedOwner);
 return client.mutation(api.places.linkMedia,{vaultOwnerId,placeId:input.placeId as Id<"places">,mediaId:input.mediaId as Id<"media">});
}
