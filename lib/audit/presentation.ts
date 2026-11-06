import {auditMetrics, type AuditMetric} from "./contract";

export type AuditPriorityPerson = {id:string;name:string;routeId:string;workflow:string;sources:number;context:number;completion:number};
export type AuditSummary = {metrics:Record<AuditMetric,number>;priorityPeople:AuditPriorityPerson[]};
type AuditInput = {
  counts: {people:number;sources:number;citations:number;historicalContext:number;stories:number;publishedStories:number};
  gaps: {peopleWithoutSources:number;peopleWithoutContext:number;peopleWithoutStories:number;placesWithoutContext:number;openResearchTasks:number};
  storyWorkflowCounts:Record<string,number>;
  priorityPeople:{_id:unknown;displayName:string;routeId:string;storyWorkflow:string;sourceCount:number;contextReportCount:number;completionPercent:number}[];
};
/** Explicit browser boundary: no recentContext, notes or raw documents. */
export function projectAuditSummary(input:AuditInput):AuditSummary {
  const metrics=Object.fromEntries(auditMetrics.map(metric=>[metric,metric.startsWith("workflow:") ? input.storyWorkflowCounts[metric.slice(9)] || 0 : metric in input.counts ? input.counts[metric as keyof AuditInput["counts"]] : input.gaps[metric as keyof AuditInput["gaps"]]])) as Record<AuditMetric,number>;
  return {metrics,priorityPeople:input.priorityPeople.map(p=>({id:String(p._id),name:p.displayName,routeId:p.routeId,workflow:p.storyWorkflow,sources:p.sourceCount,context:p.contextReportCount,completion:p.completionPercent}))};
}
