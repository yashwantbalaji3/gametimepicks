# MLB integration checkpoint and UFC-001 handoff (2026-10-10, about 13:50Z / 9:50 AM ET)

Founder decision 4: checkpoint the MLB integration work by about noon ET and shift to UFC-001. No large MLB sprint. Nothing was merged in this checkpoint.

## UFC deadline (keep visible)

**UFC Fight Night: Allen vs. Duncan, 2026-10-10 21:00Z (5 PM ET), Meta APEX, 12 bouts.** Source: `app/public/data/ufc/schedule/latest.json` on `main`, captured 2026-10-09T18:44Z. Next card: Buckley vs. Malott, 2026-10-17 21:00Z.

## Blocker shared by every PR: main-wide `quality` failure

- **Test:** `app/src/lib/ask/ask-published.test.mjs:56`, "no published parlay candidate belongs to a sport barred…". Run 38054802554, on #1051.
- **Error:** "no candidates were checked AND none were withheld — this guard would pass vacuously".
- **Cause (data, not code):**
  - The guard reads the newest 3 optimizer snapshots: 10-08, 10-09 and 10-10.
  - Each has 0 slips and records 0 withheld.
  - This began with this morning's daily products commit. The last green run was 07:23Z.
- **Hidden until now:** it sits in phase 2 (rendered guards), which runs only after phase 1 passes. Phase 1's `projection-parity §1b` failure is what #1051 fixes.
- **Owner:** Ask/parlays and the MLB optimizer, not this MLB research session and not the NFL session. Neither of us is changing the guard.
- **A fix shape that keeps anti-vacuity:** accept an empty window only when each date carries the owner's own receipt (generatedAt plus `totalSlips === 0`). The fix and its owner are for the founder to decide.
- **Effect:** no PR can show green `quality`, so every merge condition that requires green CI is unmet. That includes #1051, #1048, #1050 and any UFC slice.

## MLB state at checkpoint

| Item | Head | State | Next |
|---|---|---|---|
| #1051 (NFL session; parity §1b test fix) | `a712611079c5ec0e99085f691cab436cebaf184c` | Conditionally approved. Every condition was checked **except green CI**: head unchanged, scope test + roadmap only, mutation probe fails when MIXED is pooled, no NFL production or settlement files, no deployment in flight. `quality` is red (above). **Not merged** | Merge at the exact head once CI is green and the head is unchanged |
| #1048 (matchup-v1 + forward shadow) | `6a4a620d830c86900f51266bf3b94b531e942d28` | Package complete (byte identity in 4 cases, fault injection 6/6, scope clean, targeted tests 32/32) | After #1051: reconcile with `main` (roadmap entries kept), re-verify, then ask for renewed exact-head approval |
| #1050 (Option A minimal) | `60900eb617453dad5345bce0a7a5ec7fea981b75` | Ready for review. It carries only the **engine-level** #1043 subset, disclosed in a table (`docs/research/mlb/OPTION-A-LIVE-PREGAME-CAPTURE.md`). Validation: equivalence 192/192; generator byte identity vs `main` in 4 cases including after first pitch; MLB tests 145/145; `tsc` clean; unit 9,246 / 9,251 (2 RLS + §1b) | Exact-head approval, after #1048 |
| #1050 with full #1043 (earlier draft) | `a0cb366a74` on `claude/mlb-option-a-live-capture-with-1043` | Preserved, unused | — |
| #1043 (official rules, pa-v3 opt-in) | `be19ba7002` | Walk-off fix verified; the modelVersion addition was investigated | After #1050, rebased (its engine part becomes a no-op) |
| #1045 / #1049 | `a4cd3b030a` / `6dc4a51182` | Gated, draft | — |
| MLB-005 | `claude/mlb-005-coherent-worlds` `55e8232074` | The extra box-score capture is **DEFERRED** (founder decision 3) and its proposal kept in `NEXT-MILESTONE-v4.md` | Resume after UFC-001 |

**Tonight's first live MLB receipts (849831, 00:00Z):** these need #1048 and then #1050 merged before about 23:15Z, so the CI blocker comes first. If that does not happen, receipts start on the next slate. **Nothing is backfilled.**

## UFC-001: "Near-term truthful operations" (roadmap: NOT_STARTED; "Use existing Saturday/U1/U2 work only after current-main refresh")

Verified against `main` at this checkpoint:

| Slice | Founder decision | On `main`? | Evidence |
|---|---|---|---|
| U2 odds join (both prices on a rescued bout; Oct 10 spellings) | Approved 2026-10-07 03:16Z | **Landed** | `fe38220e45` and `62c5a7dd19`; `resolveOutcomeNames` and `romanisedForm` present |
| U2 rest (plain model labels; athlete ids on model-vs-market rows) | Held, out of the 03:16Z scope | No | Branch `claude/handoff-ufc-u2-rest` `81290d3773`, 427 commits behind `main` |
| **U3 claims copy** | **D2 HONEST approved** (2026-10-07 03:21Z): remove "beat its baseline" / "cleared its bar", never imply a proven edge | **No. The approved-for-removal wording is still live** | `app/src/app/cage-chaos/page.tsx:4` (comment) and `:53`; `app/src/app/ufc/bout/[boutId]/page.tsx:293`; `app/src/lib/products/signature-products.ts:85` (shared: `/mr-dub`, `/goal-rush`, `/bucket-blitz`). U3's heads (`44783a4d3`, `9800747ca`) are **not on origin**; they exist only in the department bundle |
| U1 grader retirement and readiness split | D1 YES approved; must land **apart from** Product Engine 4D (both edit the UFC row in `sport-capability-registry.ts`) | No | `pipeline/ufc/grade_moneylines.py` has no `RETIRED`. Branch `claude/handoff-ufc-u1` `675fea78d7`, 427 behind |
| U4 Gall v Dumas | **D3 still open** (VOID recommended) | No | Results settlement rule |

**Recommended order (each slice its own exact-head approval, one Production integration at a time):**

1. **U3 first, rebuilt on fresh `main`.**
   - Copy only: no number, model or eligibility change. It is the only item where Production currently says something the founder has decided is not true, and it is visible on the card pages before 21:00Z.
   - Stop conditions: `uiux/claims-contract.test.mjs` or `sport-lab-cards.test.mjs` changes verdict.
   - The Ask projection must be regenerated with `npm run ask:build` on the promotion base.
   - The bundle is not reachable from this machine, so U3 must be re-made from the D2 wording on fresh `main`.
2. **U1** (after U3; never together with PE 4D).
   - Stop conditions: `publicLevel`, `projectionsReady` or `parlayReady` moves, or the registry state (not just its text) changes.
3. **U2 rest**, then **U4** after D3.

**The Oct 10 card runs on current Production code either way.** A missing price is not a loss, and nothing is graded on price.

## Not done here (by design)
- No UFC code was changed in this session.
- The parlay guard and the optimizer were not touched.
- No merge, no Vercel or workflow-permission change, no paid API call.
