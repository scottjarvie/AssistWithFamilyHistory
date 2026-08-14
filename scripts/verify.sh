#!/usr/bin/env bash
# Assist With Family History — full verification.
#
# Runs typecheck, lint, test, every `check:*` contract, and the production
# build, recording each result. Designed as the single command an auditor
# (human or AI) runs to confirm the repo is healthy.
#
# Excludes:
#   - dev/start (need a running server)
#   - smoke:routes (needs dev server; documented separately in
#     docs/operations/product-health-gates.md)
#   - build:extension (artifact build; check:extension already validates
#     the checked-in artifacts against source)

set +e

steps=(
  "typecheck"
  "lint"
  "test"
  "test:process-route"
  "test:convex"
  "check:api-inventory"
  "check:capture-validation"
  "check:intake-envelope"
  "check:source-facts"
  "check:redaction-fixtures"
  "check:loose-context"
  "check:context-taxonomy"
  "check:no-raw-markdown-render"
  "check:project-philosophy"
  "tracker:verify"
  "verify:ci-state-classifier"
  "verify:vercel-ignore-build"
  "check:import-regression"
  "check:agent-quality-gates"
  "check:operations-handoff"
  "check:queue-foundation"
  "check:context-pack-contract"
  "check:privacy-ai-safety"
  "check:private-first-start"
  "check:review-gates"
  "check:story-fixtures"
  "check:story-publish"
  "check:story-capabilities"
  "check:public-story-policy"
  "check:public-beta-launch"
  "check:public-story-e2e"
  "check:story-slugs"
  "check:sitemap-shape"
  "check:extension"
  "check:familysearch-capture"
  "check:familysearch-readiness-contract"
  "check:familysearch-live-pilot"
  "check:experimental-tools"
  "check:place-era-packs"
  "check:protected-routes"
  "check:person-identifiers"
  "check:convex-visibility"
  "check:trust-boundary"
  "check:convex-client-auth"
  "check:owned-tables-parity"
  "check:safelink-suppression"
  "check:no-plain-next-link"
  "build"
)

passed=()
failed=()
start=$(date +%s)

for step in "${steps[@]}"; do
  step_start=$(date +%s)
  if pnpm -s "$step" >/tmp/dts-verify-"${step//:/_}".log 2>&1; then
    step_end=$(date +%s)
    elapsed=$((step_end - step_start))
    printf '  ✓ %-44s %3ds\n' "$step" "$elapsed"
    passed+=("$step")
  else
    step_end=$(date +%s)
    elapsed=$((step_end - step_start))
    printf '  ✗ %-44s %3ds\n' "$step" "$elapsed"
    failed+=("$step")
  fi
done

end=$(date +%s)
total=$((end - start))

echo
echo "—— summary ——"
printf '  passed: %d\n' "${#passed[@]}"
printf '  failed: %d\n' "${#failed[@]}"
printf '  total:  %ds\n' "$total"

if [ "${#failed[@]}" -gt 0 ]; then
  echo
  echo "Failed steps (logs at /tmp/dts-verify-*.log):"
  for step in "${failed[@]}"; do
    echo "  - $step  (tail:)"
    tail -5 /tmp/dts-verify-"${step//:/_}".log | sed 's/^/      /'
  done
  exit 1
fi

echo
echo "All ${#passed[@]} verification steps passed."
