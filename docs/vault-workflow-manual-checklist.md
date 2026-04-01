# Vault Workflow Manual Checklist

Use this checklist after the automated checks pass.

## Core flow

- Import a FamilySearch capture package in `/app/imports`.
- Confirm the recent import links to the correct person workspace.
- Confirm `/app/people`, `/app/places`, `/app/research`, and `/app/story-writer` render.

## Identifier resolution

- Open the same canonical person by FamilySearch ID and by local `_id`.
- Confirm both routes render the same person workspace and context-pack endpoints.

## Research operations

- Mark one missing critical research check complete from `/app/operations`.
- Open the person workspace and confirm the research check state refreshed.
- Create a follow-up research task and confirm it appears in the workspace and research ledger.

## Story outputs

- Open Story Writer for a person with evidence.
- Save a story draft and confirm the story appears in the person workspace and updates the research log.

## Provisional relatives

- Open `/app/operations` and choose a provisional relative.
- Open the merge picker, search canonical people, and merge into a valid target.
- Confirm the provisional row disappears or updates and the anchor workspace refreshes cleanly.

## Legacy derived outputs

- For a person with a stored run, open raw document, contextualized dossier, and AI analysis.
- For a vault-only person without a stored run, confirm those pages show the new explanatory empty states instead of a broken flow.
