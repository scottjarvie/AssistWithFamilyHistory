export const auditMetricLabels = {
 people:"People", sources:"Sources", citations:"Citations", historicalContext:"Context reports",
 stories:"Stories", publishedStories:"Published stories", peopleWithoutSources:"People without sources",
 peopleWithoutContext:"People without context", peopleWithoutStories:"People without stories",
 placesWithoutContext:"Places without context", openResearchTasks:"Open research tasks",
 "workflow:needs_genealogy_evidence":"Needs genealogy evidence", "workflow:needs_context_research":"Needs context research",
 "workflow:ready_to_draft":"Ready to draft", "workflow:ready_to_review":"Ready to review", "workflow:published":"Published workflow",
} as const;
export type AuditMetric = keyof typeof auditMetricLabels;
export const auditMetrics = Object.keys(auditMetricLabels) as AuditMetric[];
export function isAuditMetric(value:string):value is AuditMetric {return Object.prototype.hasOwnProperty.call(auditMetricLabels,value);}
export type AuditRecord = {id:string;title:string;kind:string;detail:string;href:string|null;destination:string|null};
export type AuditRecordPage = {metric:AuditMetric;total:number;rows:AuditRecord[];nextOffset:number|null;denominator?:{metric:"people";total:number}};
export const auditRecordPageSize=50;
