# FamilySearch Provider API Readiness And Migration Boundary

Last updated: 2026-05-21

## Current Boundary

FamilySearch provider API access is pending. Current live work remains browser-mediated, user-visible, and started by the user through the Chrome extension.

Do not add product code, agent prompts, queues, or docs that imply FamilySearch API credentials are available today.

## What The API May Eventually Replace

An approved FamilySearch provider API could eventually replace or supplement these browser-capture responsibilities:

| Current browser capture responsibility | Future API capability area | Parity requirement |
| --- | --- | --- |
| Read person header identity from the page | Person read | Must provide FamilySearch person ID, preferred name, lifespan, and enough identity context to prevent wrong-person imports. |
| Read attached source list | Source list read | Must preserve source IDs, titles, URLs or provider references, citation text, indexed facts, and source ordering/dedupe keys. |
| Expand source details visible on page | Source/citation metadata read | Must preserve original evidence text and support warning states when details are unavailable. |
| Capture memories page | Memory read | Must preserve memory ID, title, description, media links, contributor/privacy signals, related people, and place mentions. |
| Extract related people from indexed fields | Relationship read or source-indexed fields | Must distinguish source evidence from canonical relationship claims. |
| Extract place mentions | Place read or indexed fields | Must preserve original names and provider place IDs when available. |
| Emit diagnostics | Provider request/audit metadata | Must record request time, provider response shape/version, partial failures, rate-limit status, and warnings. |

## What Must Stay Reviewed

Even with approved API credentials, these actions remain human-reviewed or trusted-operator only:

- Broad collection queue approval and stop conditions.
- Merging uncertain relationships into the canonical graph.
- Promoting provisional relatives.
- Publishing memory images or private source text.
- Importing living/private person data.
- Resolving provider/local conflicts.
- Bulk import retry behavior after provider errors or rate limits.

## Capability Planning

Future scopes should be split. Do not create one broad "FamilySearch access" capability.

| Scope concept | Allowed behavior | Not allowed |
| --- | --- | --- |
| `familysearch_person_read` | Read one approved person record by ID | Tree traversal or relationship expansion by default |
| `familysearch_sources_read` | Read source list and selected source metadata for an approved person | Broad source crawling |
| `familysearch_memories_read` | Read memory metadata for an approved person | Republishing media or contributor data |
| `capture_validate` | Convert provider/browser payload to preview report | Vault merge |
| `capture_merge` | Merge an already reviewed package | Provider browsing or API collection |
| `trusted_bulk_intake` | Run an approved small queue with pacing and audit logs | Unbounded capture or unattended crawling |

## API Contract Shape

Future API ingestion should still normalize into the same internal capture package contract, or into a provider-neutral envelope that can produce the same fields.

Minimum adapter output:

- Provider name and request provenance.
- Subject person identity.
- Source list with stable source keys.
- Citation/evidence text with URLs or provider references.
- Indexed facts as source-backed evidence, not unreviewed conclusions.
- Memories and media metadata with privacy signals.
- Related people and places as evidence-backed mentions.
- Diagnostics for partial responses, rate limits, denied permissions, and schema drift.

## Security And Abuse Risks

Provider API work is blocked until these risks have explicit handling:

- Credential misuse or storage outside approved secrets handling.
- Unattended collection beyond an approved person queue.
- Rate-limit bypass or retry storms.
- Private or living person data entering public story flows.
- Merge poisoning from bad provider payloads or wrong-person IDs.
- Provenance loss when provider data is converted into local facts.
- Agents confusing provider read permission with merge or publish permission.

## Migration Plan

1. Keep browser extension capture as the active path.
2. Finish capture-to-vault regression coverage against the storage map.
3. Introduce a provider-neutral intake envelope without adding a second provider.
4. Add adapter fixtures for "browser capture" and "approved API response" that produce equivalent preview reports.
5. Add provider API code only after credentials, terms, queue limits, and secrets handling are approved.
6. Keep merge review separate from provider read.

## Verification

Run after changing API capability docs:

```bash
pnpm check:familysearch-readiness-contract
pnpm check:api-inventory
pnpm check:familysearch-capture
```
