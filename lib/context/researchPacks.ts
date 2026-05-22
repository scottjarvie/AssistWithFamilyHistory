export type ResearchPackType =
  | "locality_era_brief"
  | "region_era"
  | "occupation_era"
  | "religion_community"
  | "migration_corridor"
  | "building_institution"
  | "local_event"
  | "cemetery_burial";

export type ResearchPackAttachment = {
  target: "place" | "person" | "story" | "source" | "context_item";
  rule: string;
};

export type ResearchPackTemplate = {
  id: string;
  packType: ResearchPackType;
  label: string;
  firstUseful: boolean;
  purpose: string;
  appliesWhen: string[];
  requiredInputs: string[];
  researchQuestions: string[];
  outputSections: string[];
  attachmentModel: ResearchPackAttachment[];
  evidenceBoundary: string[];
  privacyNotes: string[];
  storyWriterUse: string[];
};

export const FIRST_USEFUL_RESEARCH_PACK_ID = "locality-era-brief";

export const researchPackTemplates = [
  {
    id: "locality-era-brief",
    packType: "locality_era_brief",
    label: "Locality Era Brief",
    firstUseful: true,
    purpose:
      "Explain the local setting around a sourced event, residence, church record, census entry, burial, or migration clue.",
    appliesWhen: [
      "A person has a source-backed place and an approximate event year.",
      "A story needs daily-life, economy, religion, migration, or local-institution background.",
      "The place workspace already has linked events but no historical context coverage.",
    ],
    requiredInputs: [
      "Place name or placeId",
      "Year or event date range",
      "At least one public historical source or reviewed archive reference",
      "Reason this context matters to the person or story",
    ],
    researchQuestions: [
      "What kind of place was this during the target years?",
      "Which local economy, church, migration, school, military, or civic systems shaped daily life?",
      "Which public events or disruptions would responsibly contextualize this source?",
      "Which details are sourced context, and which are narrative synthesis?",
    ],
    outputSections: [
      "Scope and time window",
      "Place summary",
      "Daily life and local institutions",
      "Migration, work, religion, or community patterns",
      "Cited sources and confidence notes",
      "Story-safe synthesis notes",
    ],
    attachmentModel: [
      {
        target: "place",
        rule: "Store as `historicalContext.placeId` when the pack describes a specific place.",
      },
      {
        target: "person",
        rule: "Expose through context packs only when the person has matching place coverage and overlapping life/event years.",
      },
      {
        target: "story",
        rule: "Use as background context; never promote pack text into a public story without story review.",
      },
      {
        target: "context_item",
        rule: "Use `contextItems` for person-specific notes, researcher conclusions, or private family memories related to the pack.",
      },
    ],
    evidenceBoundary: [
      "The pack is contextual background, not a canonical person fact.",
      "Specific claims about the person still need source citations or source-backed facts.",
      "AI synthesis must be labeled as synthesis and kept separate from quoted or paraphrased source material.",
    ],
    privacyNotes: [
      "Do not include living-person details, private notes, or unreviewed memories in public context packs.",
      "Place context may be public history, but person-specific interpretation remains private until reviewed.",
    ],
    storyWriterUse: [
      "Use the pack to add setting, constraints, and local texture.",
      "Avoid implying the person experienced every public event unless evidence supports it.",
      "Prefer phrasing like 'would have lived in a town shaped by...' when the connection is contextual.",
    ],
  },
  {
    id: "region-era-context",
    packType: "region_era",
    label: "Region And Era Context",
    firstUseful: false,
    purpose:
      "Summarize broader county, state, province, or country conditions when town-level sources are sparse.",
    appliesWhen: [
      "The exact town is unknown or has limited public records.",
      "A family movement, law, war, famine, or economic trend needs regional framing.",
    ],
    requiredInputs: ["Region name", "Date range", "Public history sources"],
    researchQuestions: [
      "Which regional patterns affected people in this place and period?",
      "Which claims are too broad to attach to one person?",
    ],
    outputSections: ["Regional summary", "Timeline of regional changes", "Limits and uncertainty", "Sources"],
    attachmentModel: [
      {
        target: "place",
        rule: "Attach to the broadest known place when no narrower place is reliable.",
      },
      {
        target: "person",
        rule: "Expose only as context coverage, never as evidence that a person participated in a regional event.",
      },
    ],
    evidenceBoundary: [
      "Regional trends explain setting; they do not prove personal experience.",
      "Do not infer migration motive without person-specific evidence.",
    ],
    privacyNotes: ["Keep recent-family location details out of public summaries unless explicitly reviewed."],
    storyWriterUse: ["Use for careful setting paragraphs and context caveats."],
  },
  {
    id: "occupation-era-context",
    packType: "occupation_era",
    label: "Occupation And Work Context",
    firstUseful: false,
    purpose:
      "Explain work, class, tools, hazards, seasonal rhythms, and economic context around a sourced occupation.",
    appliesWhen: ["A source names an occupation, employer, industry, or trade."],
    requiredInputs: ["Occupation label", "Place or region", "Date range", "Occupational source"],
    researchQuestions: [
      "What did this work typically involve in this place and time?",
      "What social status, hazards, or migration patterns were associated with it?",
    ],
    outputSections: ["Work description", "Economic context", "Risks and rhythms", "Sources"],
    attachmentModel: [
      {
        target: "place",
        rule: "Attach work context to the place or region where the occupation appears when available.",
      },
      {
        target: "source",
        rule: "Connect to the source-backed occupation fact or event that motivated the pack.",
      },
      {
        target: "story",
        rule: "Use only as context unless the source directly describes the person's duties.",
      },
    ],
    evidenceBoundary: [
      "A general occupational description is not proof of the person's exact duties.",
      "Keep source-backed occupation facts separate from context synthesis.",
    ],
    privacyNotes: ["Modern employer or living-person work details require private review."],
    storyWriterUse: ["Use to make occupational references concrete without overclaiming."],
  },
  {
    id: "religion-community-context",
    packType: "religion_community",
    label: "Religion And Community Context",
    firstUseful: false,
    purpose:
      "Explain church, congregation, parish, faith community, record practice, and local religious culture.",
    appliesWhen: ["A baptism, marriage, burial, membership, or cemetery source points to a religious community."],
    requiredInputs: ["Community name or denomination", "Place", "Date range", "Religious or cemetery source"],
    researchQuestions: [
      "What role did this community play in local life?",
      "What records did it create and what are their limits?",
    ],
    outputSections: ["Community summary", "Record practice", "Local role", "Sources"],
    attachmentModel: [
      {
        target: "place",
        rule: "Attach to the place that hosts the church, parish, cemetery, or community.",
      },
      {
        target: "person",
        rule: "Expose to a person only when the person has a related source or event.",
      },
    ],
    evidenceBoundary: [
      "Do not infer belief or participation beyond the source.",
      "Separate church context from person-level religious identity claims.",
    ],
    privacyNotes: ["Religious affiliation can be sensitive for living or recent people."],
    storyWriterUse: ["Use to explain what a religious record may reveal and what it cannot prove."],
  },
  {
    id: "migration-corridor-context",
    packType: "migration_corridor",
    label: "Migration Corridor Context",
    firstUseful: false,
    purpose:
      "Explain likely routes, transport, laws, push-pull factors, and record sets around a migration path.",
    appliesWhen: ["Events show a move between places or a source mentions immigration, emigration, or naturalization."],
    requiredInputs: ["Origin", "Destination", "Approximate date range", "Migration-related source"],
    researchQuestions: [
      "Which routes and constraints were plausible during this period?",
      "Which motives are supported, and which are only historical background?",
    ],
    outputSections: ["Route context", "Transport and law", "Push-pull factors", "Record suggestions", "Sources"],
    attachmentModel: [
      {
        target: "person",
        rule: "Attach through context pack only when both places or migration events are linked to the person.",
      },
      {
        target: "story",
        rule: "Use with explicit uncertainty language unless a route is sourced.",
      },
    ],
    evidenceBoundary: [
      "Do not turn a plausible route into a claimed route without evidence.",
      "Distinguish historical causes from the family's documented motive.",
    ],
    privacyNotes: ["Recent immigration or displacement details can be sensitive and should stay private until reviewed."],
    storyWriterUse: ["Use to frame movement while naming the evidence limits."],
  },
  {
    id: "building-institution-context",
    packType: "building_institution",
    label: "Building Or Institution Context",
    firstUseful: false,
    purpose:
      "Explain a named house, school, hospital, church, workplace, ship, cemetery, or public institution.",
    appliesWhen: ["A source or memory names a building, institution, vessel, cemetery, or address."],
    requiredInputs: ["Institution name", "Place", "Date range", "Source or memory reference"],
    researchQuestions: [
      "What was this institution during the target years?",
      "How directly is the person connected to it?",
    ],
    outputSections: ["Institution summary", "Timeline", "Person connection", "Sources"],
    attachmentModel: [
      {
        target: "context_item",
        rule: "Use `contextItems` first when the note comes from a private memory or family document.",
      },
      {
        target: "place",
        rule: "Attach public, reviewed institution context to the relevant place.",
      },
    ],
    evidenceBoundary: [
      "Institution history is background unless a source places the person there.",
      "Private building details stay in contextItems until reviewed.",
    ],
    privacyNotes: ["Homes, schools, hospitals, and recent addresses can expose private family details."],
    storyWriterUse: ["Use only reviewed details for story enrichment."],
  },
  {
    id: "local-event-context",
    packType: "local_event",
    label: "Local Event Context",
    firstUseful: false,
    purpose:
      "Explain a public event, disaster, law, conflict, epidemic, or local milestone near a person's time and place.",
    appliesWhen: ["A source date/place overlaps a known local event that may shape context."],
    requiredInputs: ["Event name", "Place", "Date range", "Public source"],
    researchQuestions: [
      "Was the event local and relevant enough to mention?",
      "Is there evidence the person was affected?",
    ],
    outputSections: ["Event summary", "Local impact", "Evidence limits", "Sources"],
    attachmentModel: [
      {
        target: "place",
        rule: "Attach to the place/time when the event is public historical context.",
      },
      {
        target: "story",
        rule: "Mention only with careful language unless person impact is sourced.",
      },
    ],
    evidenceBoundary: [
      "A person being nearby is not proof of direct impact.",
      "Use source-backed events for personal involvement claims.",
    ],
    privacyNotes: ["Recent traumatic events require careful review before public story use."],
    storyWriterUse: ["Use to clarify setting, not to dramatize unsupported impact."],
  },
  {
    id: "cemetery-burial-context",
    packType: "cemetery_burial",
    label: "Cemetery And Burial Context",
    firstUseful: false,
    purpose:
      "Explain a cemetery, burial ground, plot context, monument, inscription, or local burial practice.",
    appliesWhen: ["A burial, cemetery, FindAGrave, memory, or grave marker source is present."],
    requiredInputs: ["Cemetery or burial place", "Date range", "Burial or marker source"],
    researchQuestions: [
      "What does the burial place reveal about community, religion, class, or family grouping?",
      "Which marker details are source-backed and which are contextual?",
    ],
    outputSections: ["Cemetery summary", "Burial practice", "Family grouping clues", "Sources"],
    attachmentModel: [
      {
        target: "place",
        rule: "Attach public cemetery context to the cemetery place or burial locality.",
      },
      {
        target: "source",
        rule: "Keep marker inscriptions and plot claims tied to the original source.",
      },
    ],
    evidenceBoundary: [
      "Marker text is evidence; cemetery history is context.",
      "Do not infer family relationships from proximity alone without supporting evidence.",
    ],
    privacyNotes: ["Recent grave locations and living-family memorial notes may require family review."],
    storyWriterUse: ["Use to interpret burial context with evidence limits visible."],
  },
] satisfies ResearchPackTemplate[];

export function getResearchPackTemplate(id: string) {
  return researchPackTemplates.find((template) => template.id === id) ?? null;
}
