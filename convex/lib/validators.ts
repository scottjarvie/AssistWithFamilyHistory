import { v } from "convex/values";

const genealogyDateFields = {
  original: v.string(), // User-entered, e.g. "1 Jan 1900"
  formal: v.optional(v.string()), // GEDCOM X format, e.g. "+1900-01-01"
  year: v.optional(v.number()),
  month: v.optional(v.number()),
  day: v.optional(v.number()),
};

const genealogyDateValidator = v.object({
  ...genealogyDateFields,
  approximate: v.optional(v.boolean()),
});

export const eventDateValidator = v.object({
  ...genealogyDateValidator.fields,
  range: v.optional(v.boolean()),
});

export const eventEndDateValidator = v.object(genealogyDateFields);

export const placeRefValidator = v.object({
  original: v.string(),
  placeId: v.optional(v.id("places")),
});

export const factValidator = v.object({
  date: v.optional(genealogyDateValidator),
  place: v.optional(placeRefValidator),
  description: v.optional(v.string()),
});

export const relationshipFactValidator = v.object({
  type: v.string(), // "Marriage", "Divorce", "Annulment", etc.
  ...factValidator.fields,
});

export const sourceFactFields = {
  personId: v.id("persons"),
  sourceId: v.id("sources"),
  citationId: v.id("citations"),
  importKey: v.string(),
  factType: v.union(
    v.literal("name"),
    v.literal("sex"),
    v.literal("birth"),
    v.literal("death"),
    v.literal("marriage"),
    v.literal("census_residence"),
    v.literal("residence"),
    v.literal("occupation"),
    v.literal("other")
  ),
  label: v.string(),
  value: v.string(),
  date: v.optional(v.string()),
  place: v.optional(v.string()),
  confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
  status: v.union(
    v.literal("candidate"),
    v.literal("accepted"),
    v.literal("conflict"),
    v.literal("rejected")
  ),
  conflictReason: v.optional(v.string()),
};
