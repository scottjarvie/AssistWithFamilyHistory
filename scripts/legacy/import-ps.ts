import { api } from "../convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const content = `# Person Sheet — John Strathearn Jarvie (KWCJ-4XD)

## Identity
- **Name:** John Strathearn Jarvie
- **Sex:** Male
- **Birth:** 16 Apr 1890 — Bathgate, West Lothian, Scotland, United Kingdom
- **Death:** 4 Oct 1960 — Draper, Salt Lake, Utah, United States
- **Burial:** 7 Oct 1960 — Draper, Salt Lake, Utah, United States
- **FS Person ID:** KWCJ-4XD

## Parents
- **Father:** Mathew Anderson Jarvie (2CMM-MGM)
- **Mother:** Isabella Strathearn (LVYM-C1N)

## Spouse
- **Jennie Kathryn Gill** (KWCJ-4X6)
- **Marriage:** 19 Jun 1925 — Evanston, Uinta, Wyoming, United States

## Children (from FS list)
- Ronald Mathew Jarvie (LFST-LWC) — 1926–2016
- Jack Edward Jarvie (KW8Z-KTD) — 1928–2019
- Raymond Scott Jarvie (LFST-LKJ) — 1932–2016
- Raymond Scott Jarvie (LF9P-622) — 1932–Living *(possible duplicate or living profile)*
- Gloria Fay Jarvie (LJ9X-FCJ) — 1934–2025
- Thearn Gill Jarvie (KWZR-ZHM) — 1935–2011

## Key Events (from Details/Other Info)
- **1891 Residence:** Bathgate, Linlithgowshire (West Lothian), Scotland — residence with Henry Easton at 22 High Street
- **Immigration:** 1896 (custom event)
- **1900 Residence:** Salt Lake City Ward 2, Salt Lake, Utah (custom event)
- **1930 Occupation:** Labourer, Poultry Warehouse (Draper, Utah)
- **1942 Military Draft Registration:** Draper, Utah
- **1950 Residence:** Salt Lake City, Utah

## Sources (selected from FS Sources list)
- **1891 Scotland Census** — John Jarvie, “Scotland Census, 1891” (source date 1891)  
  **Record link:** https://familysearch.org/ark:/61903/1:1:KSXR-GB6  
  **Citation (FS):** "Scotland, Census, 1891", FamilySearch (https://www.familysearch.org/ark:/61903/1:1:KSXR-GB8 : Fri Jul 26 11:52:27 UTC 2024), Entry for Matthew Jarvie and John Jarvie, 1891.
- **1896 Passenger Arrival** — John Jarvie, “New York, Passenger Arrival Lists (Ellis Island), 1892–1924”
- **1900 US Census** — John Jawie, “United States, Census, 1900”
- **1917 WWI Draft Registration** — John Jarvie, “United States World War I Draft Registration Cards, 1917–1918”
- **1920 US Census** — John Jarvis, “United States Census, 1920”
- **1920 Marriage** — John Johnson, “Utah, County Marriages, 1871–1941”
- **1930 US Census** — John H Jarvie, “United States Census, 1930”
- **1940 US Census** — John Jarvie, “United States Census, 1940”
- **1942 WWII Draft (UT)** — John Jarvie, “Utah, World War II Draft Registration Cards, 1940–1947”
- **1942 WWII Draft (US)** — John Strathearn Jarvie, “United States, World War II Draft Registration Cards, 1942”
- **1950 US Census** — John Jarvie, “United States Census, 1950”
- **1950/1955/1960 LDS Census** — “Church Census Records (Worldwide), 1914–1960”
- **1960 Death Certificate** — John Strathearn Jarvie, “Utah, Death Certificates, 1904–1966”
- **Find a Grave Index** — John Strathearn Jarvie, “Find a Grave Index”

## Notes / Conflicts
- Duplicate child record for **Raymond Scott Jarvie** (LFST-LKJ vs LF9P-622). Likely a duplicate/living profile to reconcile.
- Alternate names recorded: **John Stratheran Jarvie** (birth name), **Jack Strathearn Jarvie** (nickname).
`;

async function main() {
  const result = await client.mutation(api.documents.upsertDocument, {
    personId: "KWCJ-4XD",
    type: "PS",
    title: "Person Sheet — John Strathearn Jarvie",
    contentMarkdown: content,
  });
  console.log("Imported document:", result);
}

main().catch(console.error);
