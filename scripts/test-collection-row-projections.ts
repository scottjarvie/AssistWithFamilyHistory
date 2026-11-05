import {test} from "node:test";
import assert from "node:assert/strict";
import {projectPlaceRow,projectStoryRow,projectWritingCandidate,projectResearchTask,projectResearchLog} from "../lib/vault/collectionRows";
import {canonicalFilters,applyCollectionFilters} from "../lib/collections/viewFilters";
import {resolveCollectionColumns} from "../lib/collections/columnPreferences";

test("Older saved People views retain lifespan/state moved out of identity, while new explicit hides remain respected",()=>{
 const columns=[{key:"lifespan",introducedVersion:2},{key:"state",introducedVersion:2},{key:"sources"},{key:"documents"}];
 assert.deepEqual(resolveCollectionColumns(columns,["sources","removed"]),["lifespan","state","sources"]);
 assert.deepEqual(resolveCollectionColumns(columns,["sources"],2),["sources"]);
 assert.deepEqual(resolveCollectionColumns(columns),["lifespan","state","sources","documents"]);
});

test("Every new collection projects visible fields without notes, evidence internals or storage references",()=>{
 const extra={notes:"PRIVATE_note",vaultOwnerId:"PRIVATE_owner",metadata:"PRIVATE_meta",artifactPaths:"PRIVATE_path",creationProvenance:{actorKind:"chosen_ai",actorId:"PRIVATE_actor",operationId:"PRIVATE_op",method:"mcp",recordedAt:10}};
 const place=projectPlaceRow({_id:"place",fullName:"Synthetic Town",type:"city",stats:{events:2,citations:3,media:4},...extra} as unknown as Parameters<typeof projectPlaceRow>[0]);
 assert.deepEqual(place,{id:"place",name:"Synthetic Town",kind:"city",events:2,citations:3,media:4});
 const story=projectStoryRow({_id:"story",title:"Synthetic story",content:"Displayed narrative",type:"biography",status:"draft",storyWorkflow:"ready_to_review",person:{displayName:"Synthetic Person",...extra},readiness:{completionPercent:80,...extra},evidenceCount:2,placeCount:3,contextReportCount:4,publishWarnings:["PRIVATE_warning"],...extra} as unknown as Parameters<typeof projectStoryRow>[0]);
 assert.equal(story.content,"Displayed narrative");assert.equal(story.publicHref,null);assert.equal(story.warnings,1);
 const candidate=projectWritingCandidate({_id:"person",routeId:"synthetic",displayName:"Synthetic Person",lifespan:"1900 to 1980",storyWorkflow:"ready_to_draft",sourceCount:8,contextReportCount:2,completionPercent:75,...extra} as unknown as Parameters<typeof projectWritingCandidate>[0]);
 const task=projectResearchTask({_id:"task",title:"Look for a record",description:"Displayed task description",type:"record_search",priority:"high",status:"todo",aiSuggested:true,updatedAt:10,person:null,...extra} as unknown as Parameters<typeof projectResearchTask>[0]);
 const log=projectResearchLog({_id:"log",summary:"Displayed activity",activityType:"context_research",updatedAt:10,person:null,model:"Self-reported model",...extra} as unknown as Parameters<typeof projectResearchLog>[0]);
 assert.equal(log.authorKind,"chosen_ai");assert.equal(log.method,"mcp");assert.equal(log.modelHint,"Self-reported model");
 assert.doesNotMatch(JSON.stringify([place,story,candidate,task,log]),/PRIVATE_/);
});

test("Saved collection views retain every declared facet and cannot inject unrelated URL controls",()=>{
 const current={q:"original",status:"draft",workflow:"needs_context_research"};
 const saved={q:"new search",status:"review",workflow:"ready_to_review",next:"https://unrelated.invalid"};
 const url=new URL(applyCollectionFilters("https://example.invalid/app/stories?page=3&navigation=side",current,saved));
 assert.equal(url.searchParams.get("q"),"new search");assert.equal(url.searchParams.get("status"),"review");assert.equal(url.searchParams.get("workflow"),"ready_to_review");
 assert.equal(url.searchParams.get("navigation"),"side");assert.equal(url.searchParams.has("page"),false);assert.equal(url.searchParams.has("next"),false);
 assert.deepEqual(canonicalFilters({workflow:"ready",q:"name",status:""}),canonicalFilters({status:"",q:"name",workflow:"ready"}));
});
