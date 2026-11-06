export const activityKindLabels:Record<string,string>={
  imports:"Imports",tier1_bulk_import:"Bulk import",tier2_sources:"Sources",tier2_memories:"Memories",tier2_notes:"Notes",
  tier2_relationships:"Relationships",tier2_places:"Places",tier3_deep_research:"Deep research",tier3_narrative:"Narrative",
  tier3_browser_extras:"Browser research",context_research:"Context research",location_deep_research:"Location research",
  building_research:"Building research",photos_collected:"Photos",other:"Other",
};
export const activityKindLabel=(kind:string)=>activityKindLabels[kind]||kind.replace(/_/g," ");
export const activityIsAi=(kind:string|null|undefined)=>kind==="chosen_ai"||kind==="first_party_ai";
export const activityAuthorLabel=(kind:string|null|undefined)=>kind==="user"?"You":kind==="chosen_ai"?"Your AI":kind==="first_party_ai"?"Family History AI":kind==="system"?"System":"Not attributed";
export const activityOriginTitle=(method?:string|null)=>method?`Server-recorded origin via ${method}; connection display name not recorded`:"No origin was recorded";
