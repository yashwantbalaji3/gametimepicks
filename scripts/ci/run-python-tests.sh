#!/usr/bin/env bash
# Run every pipeline Python test as a module from the repo root (P258).
#
# 89 test files under pipeline/ ran NOWHERE: two UFC workflows ran their own, and pytest cannot
# collect the rest (they are script-style: package imports, prints, and a module-level sys.exit).
# Run as `python -m pipeline.x_test`, every one is a real check. Exit 1 on any failure — and on
# ZERO tests found, so a moved directory cannot turn this into a vacuous pass.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
PY="${PYTHON:-python3}"
TO=""; command -v timeout >/dev/null && TO="timeout 300"
pass=0; fail=0; failed=()
while IFS= read -r f; do
  mod="${f%.py}"; mod="${mod//\//.}"
  if out=$($TO "$PY" -m "$mod" </dev/null 2>&1); then
    pass=$((pass + 1))
  else
    fail=$((fail + 1)); failed+=("$f")
    echo "::group::FAIL $f"; printf '%s\n' "$out" | tail -40; echo "::endgroup::"
  fi
done < <(find pipeline -path pipeline/.venv -prune -o \( -name '*_test.py' -o -name 'test_*.py' \) -print | sort)
echo "python tests: pass $pass · fail $fail"
for f in ${failed[@]+"${failed[@]}"}; do echo "  FAILED: $f"; done   # empty-array safe under set -u (bash 3.2)
[ $((pass + fail)) -gt 0 ] || { echo "REFUSED: no python tests found — the runner would pass vacuously"; exit 1; }
[ "$fail" -eq 0 ]
