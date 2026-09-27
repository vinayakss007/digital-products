#!/usr/bin/env bash
# Run every product test suite. Usage: ./tests/run_tests.sh
# Exits non-zero if any suite fails, so CI can gate a release on it.
set -uo pipefail
cd "$(dirname "$0")"

COUNTS=check-count.json
# Erase the previous record first: a stale file must never be mistaken for a
# passing build. storefront.test.js reads this file, and the file is rewritten
# after every suite, so what it sees is always THIS run's results only.
rm -f "$COUNTS"
status=0
TOTAL=0
RECORDED=0
SUITES=""
write_counts() {
  printf '{\n  "note": "written by tests/run_tests.sh after each suite; the marketing claim in site/products.js must match these",\n  "total": %s,\n  "suites": {%s}\n}\n' \
    "$TOTAL" "${SUITES%,}" > "$COUNTS"
}
for suite in test_crm test_invoice test_proposals test_prompt_pack e2e_crm e2e_invoice e2e_proposals test_bundle_scripts storefront.test; do
  printf '\n\033[1m── %s ──\033[0m\n' "$suite"
  # Before the storefront is verified, stamp the counts measured so far into the
  # "N automated checks" claims on the pages. The test then checks the literal
  # number in the file, so the fix shows up as a git diff instead of a stale claim.
  if [ "$suite" = "storefront.test" ]; then python3 ../tools/sync_check_claims.py; fi
  if [ "$suite" = "test_prompt_pack" ]; then
    out=$(python3 "$suite.py" 2>&1) || status=1
  else
    out=$(node "$suite.js" 2>&1) || status=1
  fi
  printf '%s\n' "$out"
  n=$(printf '%s\n' "$out" | grep -oE '^PASS [0-9]+' | head -1 | awk '{print $2}')
  if [ -n "$n" ]; then
    TOTAL=$((TOTAL + n))
    RECORDED=$((RECORDED + 1))
    SUITES="${SUITES}\"$suite\":$n,"
    write_counts
  fi
done

# storefront.test.js runs last, so by then this file holds every product suite's
# count and the storefront can assert its own copy against real numbers.
echo "recorded $RECORDED suites, $TOTAL checks -> tests/$COUNTS"

printf '\n\033[1m────────────────────────\033[0m\n'
if [ "$status" -eq 0 ]; then
  echo "all suites passed"
else
  echo "FAILURES — do not ship these builds"
fi
exit $status
