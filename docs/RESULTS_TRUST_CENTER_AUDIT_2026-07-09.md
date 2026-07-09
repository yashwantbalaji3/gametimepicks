# Results / Trust Center — Audit + Rebuild Plan (2026-07-09, Chunk 6A)

**Audit-first / planning-first.** Goal: make `/results` the single clear public **trust center** ("Results & Receipts"). Display/IA only — no money/settlement/artifact changes. Paper-only / educational.

## Phase 0 — stability snapshot (1:05am EDT, ~55min before the 2am settlement window)
| Item | Value |
|---|---|
| Branch / HEAD | `june30-reset` @ `2a42da06` |
| origin/main · origin/june30-reset | `2a42da06` — **local == origin (synced)** |
| git status | clean |
| Money md5 | `affe6b21071f2b3be96bb2774eb347c3` ✓ |
| Canonical | 19-14 · bankroll $19,065.40 · crown $20,465.40 · drawdown $1,400 ✓ |
| Open exposure | $0 · Bank Builder no-play/awaiting Step 3 · Longshot/Moonshot no-play |
| Data files modified last 90min | **none — no settlement in flight** |

**Implementation decision:** a money-adjacent `/results` rebuild + verify + deploy from 1:05am would very likely bleed into the 2am settlement window (settlement changes the money md5 → a STOP condition mid-task). Per the founder's preferred outcome, this chunk **stops after the audit + plan**; the `/results` rebuild is specced below to run turnkey **after the settlement/nightly jobs finish** (≈2:30am+ or next session).

## The core finding — the trust-center job is SPLIT
- **`/results`** is a dense **parlay-first analytics** page (leg accuracy, parlay hit-rate by risk/sport, learning signals, per-date sections, Bank Builder settled steps) — labelled "Results".
- **`/mr-dub`** actually holds the **receipts** users trust: the record (19-14), the $100→$19K journey, bankroll/crown, the Bank Builder journey, product attribution — the nav comment literally calls `/mr-dub` "the polished trust center."
So today the canonical trust facts live on `/mr-dub`, while `/results` is analytics. **The fix: make `/results` the front-door trust center** (concise record · settled/pending · exposure · product cards · BB history · policy), sourced from the SAME canonical loaders, and keep `/mr-dub` as the secondary deep "Daily Dashboard."

## Phase 1 — trust-surface audit

| Route / component | Purpose | Public label | Data source | Public/internal/dup | Overlap w/ /results | Keep | Move into /results | Stay secondary/internal | Risk |
|---|---|---|---|---|---|---|---|---|---|
| `/results` (`results/page.tsx`) | Parlay-first results analytics | "Results" | optimizer-summary, graded payloads, mlb/nba lifetime, calibration, market-reliability, BankBuilderResults | public | — (this IS the page) | the concise record + BB + settled/pending + policy | — | the deep risk/sport/leg drilldowns → a Results sub-tab or /results/model-audit | med (rebuild) |
| `/mr-dub` (`mr-dub/page.tsx`) | Portfolio executive dashboard: record, $100→$19K journey, bankroll, BB journey, product attribution | "Daily Dashboard" (nav) / title "Mr. Dub · Paper Portfolio" | portfolio.json, daily-summary, master-ledger, banked-ladders, daily-portfolio, moonshot | public | **high — owns the record/bankroll/receipts** | — | the canonical record/exposure/BB summary (via the SAME loaders, not by moving the page) | keep as the deep Daily-Dashboard view | low (don't touch beyond labels) |
| `/results/parlays` | Saved pre-game slip history graded after settlement | "Saved slip history" | data-parlays | public | under /results | — | link as a Results sub-tab | keep | low |
| `/results/model-audit` | Settled per-market/side/confidence audit | "Model audit deep-dive" | audit/model_audit.json | public | under /results | — | link as the Results deep-dive | keep | low |
| `/results/date/[date]` | Per-date settled audit | (dynamic) | settlement-data, mlb/results | public | under /results | — | link from a settled row | keep | low |
| `/results/{mlb,nba,nhl,ipl}` | Per-sport model audits (re-exports) | "<Sport> Model Audit" | per-sport results | public/dup | under /results | — | link as sport tabs | keep aliases | low |
| `BankBuilderResults` (`components/bank-builder-results.tsx`) | BB settled steps on /results | — | getBankBuilderSettledSteps | public | on /results | reuse in the BB history module | — | — | low |
| `AchievementBanner` / `crownLadderSummary` | $100→$10K completed-ladder proof | — | banked-ladders, portfolio | public | on /mr-dub + /today(removed) | reuse a compact version on /results | — | — | low |
| WC / Soccer Specials results | Specials settlement history | "Soccer Specials" | world-cup/specials-ledger | public | separate | a product-card on /results (record/ROI) | — | keep the full tracker on its page | low |
| Longshot/Moonshot results | Moonshot record/exposure | "Longshot Lab" | moonshot/portfolio | public | separate | a product-card on /results (no-play) | — | keep the page | low |
| `master-ledger` | Lifetime money journey | — | mr-dub/master-ledger.json | public (on /mr-dub) | high | source the record/profit summary | — | keep the deep journey on /mr-dub | low |

**Residual labels on `/results` today:** "Parlay Lab" (1 file) and "Track Record" (1 file) — clean these in the rebuild.
**Nav/footer trust links:** nav = "Results" (`/results`) + "Daily Dashboard" (`/mr-dub`); rail same; footer = "Results" + "Deep-dive track record" (`/results/model-audit`). All stay.

## Phase 2 — proposed `/results` = "Results & Receipts" trust center (IA)
1. **Trust Center hero** — "Results & Receipts" + "every card is paper-only · official settlement only · pending is not a loss · no-play is part of the system" + CTAs (View settled cards · Methodology · Back to Today's Picks).
2. **Record / exposure summary strip** — record **19-14** · bankroll $19,065.40 · crown $20,465.40 · drawdown $1,400 · open exposure **$0** · pending/settled counts (only if supported) — all from canonical loaders, none fabricated.
3. **Settlement status** — settled vs pending cards · no-play days · active exposure (none) · official-final policy · pending-is-not-loss.
4. **Product results cards** — Bank Builder · Today's Picks/Top Model Picks · Build-a-Pick · Longshot Lab · Soccer Specials · Simulations (model reads only). Each: status · record if available · pending · exposure · latest settled · link · honest unavailable state.
5. **Bank Builder history/status** — current step · no-play/awaiting Step 3 · exposure $0 · settled ladder steps (from `getBankBuilderSettledSteps`) · founder-approval requirement.
6. **Settled cards table** — date · product · card · result · stake/exposure · settlement source · notes. (Never mark pending as lost.)
7. **Pending cards table** — date · product · card · pending reason · expected settlement source · notes.
8. **Lessons / transparency notes** — model misses · no-play rationale · settlement caveats · unavailable player props · unresolved specials (factual).
9. **Official settlement policy** — official finals only · regulation-90 for soccer · pending≠loss · no-play valid · paper-only educational.
10. **Links / next steps** — Today's Picks · Simulate · Bank Builder · Methodology / How It Works.

The dense parlay-analytics (risk/sport breakdowns, leg accuracy, learning signals) is **demoted to a "Deep-dive" sub-tab / kept on `/results/model-audit` + `/results/parlays`** — not deleted, not the front door.

## Phase 3 — `/mr-dub` decision
- **Option A — keep as "Daily Dashboard" (secondary, public):** Results is the front-door trust center; `/mr-dub` stays the deep portfolio view (journey, timeline, attribution), linked from Results + More.
- **Option B — merge into `/results`:** `/results` canonical, `/mr-dub` reachable, later redirect. Risk: `/mr-dub`'s derived charts/journey are heavy and money-derived; merging risks its integrity and bloats the trust center.
- **Option C — internal/admin-only (noindex):** it's genuinely useful public transparency, so hiding it is wrong.

**Recommendation: Option A.** Best because `/results` becomes the concise canonical trust center (sourcing the record/exposure/BB from the SAME canonical loaders `/mr-dub` uses), while `/mr-dub`'s valuable depth stays as a secondary "Daily Dashboard" for users who want the full $100→$19K journey. Risk: low (no redirect, no data change). Steps: rebuild `/results`; add a "Daily Dashboard" link to `/mr-dub`; **do NOT redirect `/mr-dub`** (owner approval required later if ever). Owner approval needed: none for A now; a future `/mr-dub`→`/results` redirect (Option B tail) would need explicit owner sign-off.

## Data-source mapping (every /results metric must trace to a loader — no fabrication, no hardcoded money in components)
| Metric | Source |
|---|---|
| Record 19-14 | `portfolio.json` `record{wins,losses,voids,pending}` (or `crownLadderSummary().recordLabel`) |
| Bankroll / crown / drawdown | `portfolio.json` `currentBankroll` / `crownBankroll` / `drawdown` |
| Open exposure $0 | `buildDailyPortfolio(...).openExposure` |
| Pending / settled counts | `portfolio.json` `record.pending` + settled = wins+losses+voids (only if present) |
| Bank Builder status / step / settled steps | `buildBankBuilderProposal` + `loadPublicBankBuilderSummary`/`buildPublicDualLadder` + `getBankBuilderSettledSteps` |
| Settled/pending cards | graded payloads (`data-parlays` / optimizer summary) + BB settled steps |
| WC/Soccer Specials record | `world-cup/specials-ledger` |
| Longshot/Moonshot status | `moonshot/portfolio` + `buildDailyPortfolio` cards |
| Lifetime profit / journey | `mr-dub/master-ledger.json` (summary only on /results; full journey stays on /mr-dub) |
If a source is missing/ambiguous → show an honest unavailable state or omit; never invent.

## Implementation plan (turnkey, run AFTER settlement)
Create `components/results/` presentational components (prop-driven; page.tsx reads canonical + passes formatted props — NO hardcoded money). Rebuild `results/page.tsx` into the 10 sections above; demote the dense analytics to a sub-tab/existing sub-routes; label cleanup (Build-a-Pick not Parlay Lab; "Results & Receipts" not "Track Record"; Longshot Lab; Daily Dashboard for the /mr-dub link). Keep all sub-routes. Tests: the 14 from the prompt (record/exposure from source not hardcoded, settled≠pending, pending-not-loss, BB no-play, labels, links, no banned copy, money md5, /mr-dub still builds, no route deletion). Gates: full suite + tsc + build + money gates + banned + smoke; **re-fetch origin + confirm money md5 + no settlement files changed before deploy.**

## Guardrails
No money/settlement/artifact/ledger change; no settlement scripts; no new picks; no exposure/approval; pending never shown as loss; no `/mr-dub` behavior change beyond labels; no route deletion; paper-only; no banned copy. Money md5 stays `affe6b21071f2b3be96bb2774eb347c3`.
