# Post-learning dry-run verification (June 9)

Local end-to-end check of the closed learning loop (no cloud spend, no publish).
Simulated generation for a FUTURE slate (2026-06-09) against the real June-8
legPool so the learned policy is eligible to apply.

## Results
- **Learned policy applied:** ✅ `learningPolicyApplied=true`, version 1, trained
  through 2026-06-08, no fallback reason.
- **Low cards:** max 2 legs ✅ (PR 2 static cap).
- **Edge cap:** 0 legs with edge≥15 in Low/Medium; 0 with edge≥20 anywhere ✅.
- **NBA:** 0 NBA legs ✅ (no stats provider → blocked; learned policy cannot
  enable it — NBA markets absent from the MLB artifact).
- **Leakage guard:** generating for the artifact's own settled date (2026-06-08)
  is rejected with `leakage_risk` and falls back to static policy ✅.
- **UFC:** schedule-only (unchanged). **V2:** internal (unchanged).

## Public copy safety (Phase 7)
Scanned `app/src/app` + `app/src/components` for banned certainty terms. Every
match is an honest **negation/disclaimer** ("does NOT guarantee", "Conservative
does not mean guaranteed", "never sold as a sure thing", "not a guarantee") or a
code-safe token (`safe-area-inset`, local `const safe`). **No overclaiming copy.**

## Conclusion
The loop is live and fail-closed: settlement updates the policy; generation reads
it and only tightens; every safety invariant holds. The change lands on the next
real generation (committed data unchanged by these PRs).
