# Handoff: 2026-10-02, Session 8 — Protected Money Ledger · NFL Family Gate · Friends-Beta Foundation

Point-in-time record. Current truth lives in the repo, Production and these canonical docs:
- `docs/MR_DUB_MONEY_LEDGER.md`
- `docs/NFL_FAMILY_PRODUCT_GATE.md`
- `docs/PRODUCT_ENGINE_V2.md`
- `docs/SUPABASE_BETA_SETUP.md`

**Start state (verified ~14:00Z):** main = Production = `b33b6392`. The only open PR was #716 (an
intentional HOLD, untouched). `main` carried **9 failing unit tests** from bot-data rot.

**Final main / Production:** `e9f3ccac27` (#926–#928 merged; plus this docs PR). Production was verified on `25cd33d1` for the money panel; see §9.

## 1. Outcome in one paragraph

- **Official money is reconciled card by card.** The audit runs as one command and inside the deploy gate.
  It has 15 landed mutation probes and a new `/mr-dub` money panel.
- **The audit surfaced the session's most important fact:** under Rule S as written, **the protected
  bankroll cannot rise.** A loss costs its seed, a win rolls, and a completed ladder has no rule. The nightly
  fold would have silently forfeited a completed run, and it now halts instead (founder gate §8.1).
- **NFL Anytime TD is not product-eligible**, for four independently proven reasons. One of them is a model
  gate: the published model's forward test is currently outside its bars. A family-level product gate now
  makes that machine-checked daily, and no family can launder another.
- **The friends-beta account foundation is extended and hardened**, but stays off until a Supabase project
  exists:
  - an invite allowlist;
  - preferences, follows, saves and feedback tables with own-row RLS;
  - a stricter RLS contract that closed a pre-existing cross-user UPDATE gap in the static guard;
  - a For You that cannot express loss-chasing.

## 2. Mr. Dub / protected money (PR #926)

| | |
|---|---|
| Canonical owner | `public/data/mr-dub/portfolio.json`, Rule S fold over write-once `settled/<date>.json` (founder 2026-09-10) |
| Current bankroll | **$15,240.40** (folded through 2026-10-01) |
| Open exposure | $0.00 (MLB off day) |
| Historical peak | **$20,465.40**, 2026-06-24. Recomputed equals stored crown equals HWM. |
| Delta to peak | **−$5,225.00** |
| Reconciliation | ✓ 127 movements (29 July-era + 98 Rule S card rows): $100 + Σ = bankroll; each folded day = Σ its cards; stake carry holds on all 98 placed rows; day chain continuous |
| Record | Bank Builder 43–42 · Moonshot 5–41 (own line) |

- **Command:** `cd app && npm run money:audit`. The same check runs in `health-check.mjs` §3b, which is the
  deploy gate, and it blocked a real receipt-stake edit when I mutation-probed it.
- **New guards:**
  - money mutation probes (all caught): loss omitted, win double-applied, stake changed after freeze, return
    changed, pending as loss, push as loss, void moves money, shadow card moves money, duplicate settlement,
    balanceBefore/After mismatch, peak decreases, row deleted, bankroll edited, completion folded as a roll;
  - the fold halts on a completion (`LADDER_COMPLETION_OPERATOR_GATED`) and on an unknown product.
- **`/mr-dub`:** Money movements panel (Current bankroll · Historical peak · Difference · Open exposure ·
  recent movements). Verified at 390 px and 1280 px.
- **Accounting semantics were not changed.**

## 3. NFL product eligibility (PR #927)

### Anytime TD — GATED

The full checklist is in `docs/NFL_FAMILY_PRODUCT_GATE.md` §2.

| Dimension | State |
|---|---|
| Model / probability owner | `nfl-anytime-td-opportunity-v1` on the Week 4 boards; `probabilityKind MODEL / MODEL_PUBLISHED` (293/293). **Provenance fixed:** `modelVersion` and `generatedAt` were null on every receipt |
| Model evidence | Replay ELIGIBLE (held-out n = 35,128, ECE 0.020). **Forward is ACCUMULATING at n = 524/1000, with level 1.18 and ECE 0.043 outside the forward bars.** Top replay bins over-predict. No market-comparison bar exists |
| Role confirmation | **0/293.** No producer emits a confirmed role; T-55 only removes players |
| Availability | 253 role-uncertain, 40 QUESTIONABLE (refused). Nothing invented |
| Pre-kickoff prices | **0/293 for Week 4 (NOT_PROBED).** Authorization exists (549/1,160 used); Week 3 priced 236/273 (151 stale) |
| Settlement | **Not proven, and stalled.** The free ESPN producer is dispatch-only by design, every live-props file is IN_PROGRESS, and the prop-settlement ledger does not exist |
| Family product gate | GATED: MODEL_FORWARD_ACCUMULATING, ROLE_CONFIRMATION_UNAVAILABLE, PRICES_NOT_CAPTURED, SETTLEMENT_NOT_PROVEN, NO_FOUNDER_GRANT |
| Official / shadow | Neither: not in products. Measured daily in the universe's `nflFamilyGate` |

### Other families

| Family | Probability | Blocker |
|---|---|---|
| Passing yards | projection only; ESTIMATE_BELOW_BAR | calibration bar; no P(over) |
| Rushing yards | projection only | no calibrated P(over) mapping; forward accumulating (216/300) |
| Receiving yards | projection only (props-v1) | no calibrated P(over); the share-level candidate is FORWARD_BREACHED |
| Receptions | projection only (props-v1) | same as receiving yards |

For all four, settlement and pricing are blocked the same way as ATD.

## 4. Recommendation universe and product shadows

- **Universe, Sunday 10-04** (asOf 10-02 15:00Z):
  - 751 NFL candidates, **0 eligible**, 293 model-backed (all ATD), 0 market-only.
  - MLB: Division Series from 10-03. Market-implied team legs only.
  - Exclusions on the NFL candidates: MARKET_MISSING 751, SPORT_GATED 751, SETTLEMENT_UNSUPPORTED 723, ROLE_UNCERTAIN 616, NO_PROBABILITY 430, AVAILABILITY_BLOCKED 107, MODEL_NOT_PUBLIC 28, FAMILY_NOT_CLEARED 27.
- **SP-V2 shadow:** 1 forward day (10-02, off day → NO_ELIGIBLE_LEGS in all tiers). 0 model-backed legs. Methodology gate unchanged.
- **BB-C1:** NOT_YET. 13 of 20 decided lane-days; survival .462 vs control .60. Model-backed share 0. Not re-tuned.
- **MS-C1:** NOT_YET. 3 decided. Model-backed share 0.
- **Rerun with NFL:** NFL contributes zero eligible legs, so rerunning the shadows unchanged gives identical results. Nothing was tuned.

## 5. Automation (Thursday / Sunday / Monday)

- **Unchanged this session.** The universe build in daily-products now also writes `nflFamilyGate`
  (network-free).
- **Remaining manual / undecided pieces:**
  - the NFL prop settlement cadence: the free producer is dispatch-only by an explicit earlier decision;
  - prop price probes depend on `nfl-event-window` sweeps (Fri/Sat/Sun 13:00Z, running ~2h late today).
- The 08:16Z event-window failure was two manual dispatches racing; it was benign.

## 6. Friends beta and Supabase (PR #928)

| Item | State |
|---|---|
| Architecture fit | Static export kept; auth client-side (PKCE on `/account/`); no user data in static HTML. **No founder gate.** |
| Project created? | **No.** No keys anywhere. Accounts stay off (fail-closed config) |
| Schema | `db/accounts-schema.sql` (one idempotent script, the repo's existing convention). New tables: `beta_access` (invite list, no client access), `user_preferences`, `user_follows`, `saved_items`, `beta_feedback`; `bet_slips.official_card_id` |
| RLS | Own-row on 4 verbs for every owned table. Writes require `is_beta_member()`. **The contract now requires USING = owner check and one policy per verb.** Seven mutations caught |
| Auth | Magic link (P266); invite-only via "signups off" plus the allowlist |
| Manual bets / personal P/L | `bet_slips` + `bet-insights.summarise` (now with open exposure). Separate from Mr. Dub, enforced by a test |
| Follows / saves | Local (browser) today; the Supabase tables are ready, but sync is not built |
| Personalized feed | `lib/my/for-you-order.mjs` (orders and filters official items; results refused as input). Not yet wired into a page |
| Feedback | Table ready; no in-site form yet → founder-transcribed `docs/beta/FEEDBACK_LOG.md` |
| Docs | `SUPABASE_BETA_SETUP.md` (invite / disable / identify, acceptance, data checklist); `OPTIONAL_DP_SUPABASE_SETUP.md` (standalone, unassigned) |
| Blockers | The Supabase project (~20 minutes, founder or an optional helper). Then: the live two-account acceptance (setup doc §Acceptance), the feedback form, and follows/saves sync |

## 7. Inherited rot fixed (in #926)

- A 0-game off-day sim artifact broke 7 tests. They now select the newest artifact that has a ready game.
- NFL-2026 player logs began shipping on 10-02 while the Lab said "not available yet". The note is now
  data-driven in both the producer and the reader. The Lab projection was regenerated (3 files), and compare
  CX6 is restated as a true invariant.

## 8. Founder / model gates (only real ones)

1. **Completion banking under Rule S.**
   - Today a completed run cannot move the bankroll, so the bankroll can never exceed the $20,465.40 peak,
     whatever the models do.
   - **Live soon:** Bank Builder B is two wins from completing, and so is Moonshot B.
   - Options: **C1** bank `finalValue − seed` (recommended; symmetric with "a loss costs the seed"),
     **C2** bank `finalValue` (the June precedent; overstates by the seed), **C3** forfeit.
   - Until decided, the fold halts at the completion day, and later days wait too.
2. **NFL ATD promotion: not now.** The forward test resolves at n = 1,000 (about 2 weeks). If it passes,
   promotion still needs all of the following, plus a grant PR in `FAMILY_PRODUCT_GRANTS`:
   - a role-confirmation source;
   - automated pre-kickoff ATD probes;
   - a settlement cadence for the free ESPN producer (an ops decision, $0).
3. **Session 7 gates 1–2 are unchanged:** SP-V2 adoption, and BB-C1/MS-C1 versus the season length.

## 9. PRs and final state

Each PR merged only on a green exact head (`quality` + `python` + Vercel).
- #926: the gap to `main` was two bot data commits with zero code overlap. Money audit, health gate and the
  133 targeted tests were re-run on the merged tree first.
- #927 and #928: `main` unchanged since their heads; disjoint files.

| PR | What | Merge commit |
|---|---|---|
| #926 | money ledger audit + fold completion halt + `/mr-dub` panel + inherited rot | `25cd33d190` |
| #927 | NFL family-level product gate + ATD provenance | `24749c2fb4` |
| #928 | beta allowlist, account tables (RLS), For You, personal exposure | `e9f3ccac27` |

**Production acceptance** (`25cd33d1`), `/mr-dub` at 390 px and 1280 px:
- **Panel figures:** $15,240.40 · $20,465.40 (06-24) · −$5,225.00 · $0.00. These equal `money:audit` to the cent.
- **Spot-checks:** the last win (09-30 Moonshot B step 1, +$0.00 bankroll) and the last loss (09-30 BB A
  step 4: stake $1,435.47, bankroll −$100) are both shown correctly.
- **Page health:** 0 overflow, 0 console errors, no undefined/NaN.
- **#927/#928:** nothing user-visible ships, by design (no family granted; accounts off without keys).

**Tests:**
- Full suite before merge: 9,130, with only the 9 pre-existing failures, all fixed in #926.
- After merge: 336/336 on mr-dub, engine-v2, accounts and my.
- Mutation probes: 15 money · 10 NFL family/leg · 7 RLS. Each one landed and was caught.

## 10. Next recommended session

1. Founder decision on completion banking. Implement the chosen rule in `foldReceipts` / `applyFold` with
   its own receipt.
2. NFL prop settlement: a free post-final cadence → `data/internal/nfl/prop-settlement/` → `nfl-boards`
   reads PROVEN from it. Also replace the vacuous "a workflow mentions the settler" derivation.
3. Supabase project creation, then the live two-account acceptance; the `/account` feedback form;
   follows/saves sync.
4. Ask: answer "why isn't NFL in today's Bank Builder?" from the universe's `nflFamilyGate`.
