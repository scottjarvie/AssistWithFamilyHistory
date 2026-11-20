export const personHistoryFields = {
  name: "Name",
  alternateNames: "Alternate names",
  sex: "Sex",
  living: "Living status",
  birth: "Birth details",
  death: "Death details",
  fsId: "FamilySearch identifier",
  researchStatus: "Research status",
  researchPriority: "Research priority",
  notes: "Notes",
  tags: "Tags",
} as const;

export type PersonHistoryField = keyof typeof personHistoryFields;

export type PersonHistoryPage = {
  rows: {
    at: number;
    action: "Created" | "Edited";
    actor: string;
    source: string;
    fields: PersonHistoryField[];
  }[];
  before: number | null;
};
