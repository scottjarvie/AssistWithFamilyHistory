#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3443}"

ROUTE_GATES=(
  "Public marketing|/"
  "Public marketing|/features"
  "Public marketing|/extension"
  "App shell|/app"
  "Intake|/app/imports"
  "Operations|/app/operations"
  "People and places|/app/people"
  "People and places|/app/places"
  "Research and story tools|/app/research"
  "Research and story tools|/app/story-writer"
  "Research and story tools|/app/source-docs"
  "Research and story tools|/app/experiments"
  "Settings|/app/settings"
  "API health|/api/capabilities"
  "API health|/api/convex/stats"
)

if [[ -n "${PERSON_ROUTE_ID:-}" ]]; then
  ROUTE_GATES+=("People and places|/app/people/${PERSON_ROUTE_ID}")
else
  echo "[People and places] Skipping person-workspace smoke route. Set PERSON_ROUTE_ID to include /app/people/<id>."
fi

echo "Running route smoke checks against ${BASE_URL}"

for entry in "${ROUTE_GATES[@]}"; do
  gate="${entry%%|*}"
  route="${entry#*|}"
  code="$(curl -s -L -o /dev/null -w "%{http_code}" "${BASE_URL}${route}")"
  if [[ "${code}" == "000" ]]; then
    echo "[${gate}] Route check failed: dev server is not reachable at ${BASE_URL}. Start it with 'pnpm dev'."
    exit 1
  fi
  if [[ "${code}" != "200" ]]; then
    echo "[${gate}] Route check failed: ${route} returned ${code}"
    exit 1
  fi
  echo "[${gate}] OK: ${route}"
done

echo "Smoke checks passed"
