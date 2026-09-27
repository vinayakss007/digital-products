#!/usr/bin/env bash
# Run every product test suite. Usage: ./tests/run_tests.sh
# Exits non-zero if any suite fails, so CI can gate a release on it.
set -uo pipefail
cd "$(dirname "$0")"

status=0
for suite in test_crm test_invoice test_prompt_pack e2e_crm e2e_invoice storefront.test; do
  printf '\n\033[1m── %s ──\033[0m\n' "$suite"
  if [ "$suite" = "test_prompt_pack" ]; then
    python3 "$suite.py" || status=1
  elif node "$suite.js"; then :
  else status=1
  fi
done

printf '\n\033[1m────────────────────────\033[0m\n'
if [ "$status" -eq 0 ]; then
  echo "all suites passed"
else
  echo "FAILURES — do not ship these builds"
fi
exit $status
