#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3443}"

ROUTES=(
  "/"
  "/features"
  "/extension"
  "/app"
  "/app/imports"
  "/app/operations"
  "/app/people"
  "/app/places"
  "/app/research"
  "/app/story-writer"
  "/app/settings"
  "/app/source-docs"
)

echo "Running route smoke checks against ${BASE_URL}"

for route in "${ROUTES[@]}"; do
  code="$(curl -s -L -o /dev/null -w "%{http_code}" "${BASE_URL}${route}")"
  if [[ "${code}" == "000" ]]; then
    echo "Route check failed: dev server is not reachable at ${BASE_URL}. Start it with 'pnpm dev'."
    exit 1
  fi
  if [[ "${code}" != "200" ]]; then
    echo "Route check failed: ${route} returned ${code}"
    exit 1
  fi
  echo "Route OK: ${route}"
done

echo "Smoke checks passed"
