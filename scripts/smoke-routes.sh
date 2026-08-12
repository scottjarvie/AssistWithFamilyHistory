#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3443}"

ROUTE_GATES=(
  "Public marketing|/"
  "Public marketing|/features"
  "Public marketing|/extension"
  "Public marketing|/updates"
  "Chosen AI setup|/ai"
  "Chosen AI setup|/ai.txt"
  "App shell|/app"
  "Intake|/app/imports"
  "Operations|/app/operations"
  "People and places|/app/people"
  "People and places|/app/places"
  "Research and story tools|/app/research"
  "Research and story tools|/app/story-writer"
  "Research and story tools|/app/source-docs"
  "Research and story tools|/app/experiments"
  "Research and story tools|/app/timeline"
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

# Routes that depend on optional services (e.g. Convex) and may return 503
# "service not configured" instead of 200 when the env isn't set up. Used
# in CI where NEXT_PUBLIC_CONVEX_URL is intentionally absent.
CONVEX_OPTIONAL_ROUTES=(
  "/api/convex/stats"
)

contains() {
  local needle="$1"
  shift
  for x in "$@"; do
    [[ "$x" == "$needle" ]] && return 0
  done
  return 1
}

for entry in "${ROUTE_GATES[@]}"; do
  gate="${entry%%|*}"
  route="${entry#*|}"
  code="$(curl -s -L -o /dev/null -w "%{http_code}" "${BASE_URL}${route}")"
  if [[ "${code}" == "000" ]]; then
    echo "[${gate}] Route check failed: dev server is not reachable at ${BASE_URL}. Start it with 'pnpm dev'."
    exit 1
  fi
  if [[ "${code}" == "200" ]]; then
    echo "[${gate}] OK: ${route}"
    continue
  fi
  if [[ "${code}" == "503" ]] && contains "${route}" "${CONVEX_OPTIONAL_ROUTES[@]}"; then
    echo "[${gate}] OK (Convex not configured): ${route}"
    continue
  fi
  echo "[${gate}] Route check failed: ${route} returned ${code}"
  exit 1
done

echo "Smoke checks passed"
