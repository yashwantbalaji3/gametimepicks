# Plan 0003 — July-6 Official Settlement + Two Low-Risk Cleanups

**Maintained by:** Claude (VP) · **2026-07-06** · for **Claude Code** · operator-gated
**Main mission:** tonight's July-6 official settlement, roll-forward, gates, deploy, smoke. **Two low-risk cleanups bundled.** No product redesign, no model tuning, no LADDER_V2 money activation. Money movement + card approval stay operator-gated (ADR-0006/0007).

**Definition of done:** all authoritative gates green (money-integrity · forensic · idempotence · health · tsc · full tests · build · production smoke 9/9). Never deploy red. Report gate output — proof, not claims.

---

## 1. MAIN — July-6 official settlement + roll-forward
Once Portugal-Spain and USA-Belgium are official-final:
- Settle the July-6 WC slate from **official API-Football results only** (`settle_soccer_day.sh` dry-run → **hand-verify each leg vs the 90' score** → `--apply`). 90'-regulation policy applies (ET goals never flip 90' markets).
- Read the new canonical record; confirm money moved only through settlement.
- Write `docs/MODEL_REVIEW_2026-07-06.md` (settled-only; label any signal proven/directional/insufficient; **no weight change on this sample**).
- Roll to July-7 with `refresh_daily_products.sh --date 2026-07-07` (add `--horizon` if the auto-horizon derives short).
- Propose a fresh Bank Builder card for **operator approval** (do not auto-activate).
- Run all gates → deploy → smoke 9/9. Confirm `/ops` "Next action" is clean.
**Accept:** canonical record updated via official settlement only; model review written; July-7 slate fresh; BB proposal rendered awaiting approval; all gates green; smoke 9/9.

## 2. CLEANUP A — investigate stale `dual-lanes-latest.json` (do NOT delete)
**Context (VP verified):** the file is **live and load-bearing** — read by `app/src/lib/data-dual-bank-builder.ts`, asserted by ~6 tests (`dual-bank-builder.test.mjs`, `june16-*`, `june17-*`, `june20-same-day-only.test.mjs`), and written/settled by `pipeline/daily/{build_dual_bank_builder,enrich_dual_legs,settle_dual_bank_builder,bank_builder_v2_eligibility}.py`. It is currently dated **2026-06-15** while the live approved-card flow (`mr-dub/bank-builder-approved.json`) is **2026-07-06**.
**Task (read-first, minimal-change):**
- Determine whether any **user-facing route** renders data from `dual-lanes-latest.json` (trace `data-dual-bank-builder.ts` consumers). If a live page shows June-15 data, that's an honesty issue — flag it.
- If the dual-lane flow is **superseded** by the approved-card/Mr-Dub flow and no route surfaces it: **document why the stale file stays** (add a short note in `docs/` or a header/`_note` in the artifact) — do **not** delete (tests depend on it).
- If it **is** surfaced and should be current: refresh it **only through the proper pipeline** (`build_dual_bank_builder.py` etc.), never by hand-editing, and re-run the affected tests.
**Accept:** a one-paragraph finding (superseded+documented, or refreshed-via-pipeline); no test breakage; no hand-edited money artifacts; gates green.

## 3. CLEANUP B — README Live link → primary custom domain
`README.md` line 7: change `**Live →** [gametime-picks.vercel.app](https://gametime-picks.vercel.app/)` to the primary custom domain **`https://gametimepicks.yashwantbalaji.com`** (keep the vercel URL only if you want it as a labeled "fallback"). Copy-only; no other changes.
**Accept:** README Live link points to the custom domain; no other diff.

---

## Guardrails (all items)
No product redesign · no model/weight tuning · no LADDER_V2 money activation (preview-only) · money + card approval operator-gated · no hand-editing canonical/money artifacts · never deploy red.

## Copy-paste prompt for Claude Code
> **July-6 official settlement + two low-risk cleanups. No product redesign, no model tuning, no LADDER_V2 money activation. Money movement and card approval stay operator-gated. Report gate output; never deploy red.**
>
> **Main:** Once Portugal-Spain and USA-Belgium are official-final, settle the July-6 World Cup slate from official API-Football results only (settle_soccer_day.sh dry-run → hand-verify each leg vs the 90' score → apply; 90'-regulation policy). Read the new canonical record (money moves only through settlement). Write docs/MODEL_REVIEW_2026-07-06.md (settled-only; no weight change on this sample). Roll to July-7 with refresh_daily_products.sh. Propose a fresh Bank Builder card for my approval (do not auto-activate). Run all gates, deploy, smoke 9/9, confirm /ops next action is clean.
>
> **Cleanup A (do NOT delete):** bank-builder/dual-lanes-latest.json is dated 2026-06-15 but is live — read by app/src/lib/data-dual-bank-builder.ts, asserted by ~6 tests, written by pipeline/daily/*dual*. Trace whether any user-facing route renders it. If a live page shows the stale June-15 data, flag it as an honesty issue. If the dual-lane flow is superseded and no route surfaces it, add a short note documenting why the stale file stays (tests depend on it — don't delete). If it should be current, refresh it only via the proper pipeline (build_dual_bank_builder.py), never by hand, and re-run affected tests. Report a one-paragraph finding.
>
> **Cleanup B:** In README.md, change the "Live →" link from gametime-picks.vercel.app to the primary custom domain https://gametimepicks.yashwantbalaji.com (copy-only).
>
> Run all gates for every change. Report the gate output.
