# Full Simulator Product Upgrade — QA Checklist (2026-07-08)

Verification for the FreeSim-inspired simulator upgrade: click **Generate Simulation** → a sport-specific animation runs ≥10s → a complete, honest model dashboard reveals, built entirely from the precomputed deterministic MLB artifact. **FreeSim was functional inspiration only** — no competitor branding, copy, colors, layout, logo, or assets are used.

**Canonical money untouched all phases:** `19-14 · bankroll $19,065.40 · crown $20,465.40 · drawdown $1,400 · md5 affe6b21071f2b3be96bb2774eb347c3`. verify-money-integrity ✓ · forensic-money-audit "MATHEMATICALLY PERFECT" ✓ · health-check "HEALTHY — Deploy may proceed" ✓.

**Phases & commits:** P1 map `8743f23d` · P2 animation `8ef59501` · P3 dashboard `496fc43d` · P4 lobby `763dd003` · P5 sport-dispatch `42db86d3`.

**Suite/build:** 1813 tests pass / 0 fail · `tsc --noEmit` clean · `npm run build` ✓ 238/238 static pages.

## How the interactive flow was verified
`next dev` returns **500** on the `output: export` dynamic game-detail route (a project-wide static-export constraint, not a bug in this work — confirmed live). So the interactive 10-second flow was driven in a **real browser against the authoritative built artifact**: the committed `app/out/` static export served locally, then navigated + clicked + timed. This is the exact bundle the CDN serves.

**Timed run (deterministic, one click):**
| Elapsed | Animation showing | Baseball diamond | Dashboard (Central read / snapshot) |
|---|---|---|---|
| 3.2 s | **true** | **true** | **hidden** (false / false) |
| 11.2 s | false | false | **shown** (true / true) |

→ The dashboard is provably gated behind the full 10-second animation.

## Checklist (17)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Generate Simulation triggers a sport-specific animation | ✅ | Browser: click → "RUNNING GAMETIME SIMULATION" + baseball diamond appears in-place. |
| 2 | Animation runs ≥10s before the dashboard reveal | ✅ | Timed run above; runner sets `phase="done"` only on a single `setTimeout(…, SIMULATION_MIN_DURATION_MS)` (=10000). Test asserts no sub-10s numeric done-timer. |
| 3 | Baseball diamond for MLB (bases + mound + ball) | ✅ | Screenshot: 1B/2B/3B labels, home plate, pitcher's mound, stitched ball traveling the base path; inline SVG, no external asset. |
| 4 | `prefers-reduced-motion` respected (ball static, stages still advance) | ✅ | CSS `@media (prefers-reduced-motion: reduce){ .gtp-sim-ball{ animation:none } }`; StageChecklist renders unconditionally (no JS/matchMedia gate). Test #8. |
| 5 | Run-count claim honest — "1,000-run" only, gated | ✅ | Screenshot: "1,000-RUN SIMULATION · PRECOMPUTED MODEL ARTIFACT". Gated on `allowsRunCountClaim && runCount!=null`; no inflated run count, no sampling-method-name claim. |
| 6 | Market snapshot → **Priced Prop Snapshot** (priced picks only, widest gap) | ✅ | Renders from `marketProbability!=null` picks; widest `|model−market|` flagged; honest empty state when none. |
| 7 | Central read = strongest **prop lean**, NEVER a fabricated score/win% | ✅ | Screenshot: "A prop lean — not a predicted final score or win probability." Luis Arraez o1.5 · PROJ 2.07 · MODEL 65% · MARKET 44% · EDGE +21.4% · CONF 80% · ANCHOR (real artifact values). |
| 8 | Main takeaways — derived, deterministic, each names its source | ✅ | `deriveTakeaways` (strongest lean / highest conf / biggest edge / most-common market); ties break first-occurrence then alpha. Unit-tested. |
| 9 | Biggest leans — top-6 grid, reason bullets, model-vs-market bar | ✅ | Reused `GeneratedPickCard`; capped at 6 with honest "Showing top 6 of N". |
| 10 | Player / prop table — scrollable, capped, null-guarded | ✅ | `overflowX:auto` table, top-12 with honest "showing top N of M", every cell `dash`/`pct`/`num2`-guarded. |
| 11 | Distributions — real bins only | ✅ | Reused `DistributionCard`, gated on a real non-empty `distributions` block; no synthetic bins. |
| 12 | Current-slate market agreement — NOT calibration; hidden if no priced picks | ✅ | Labelled "Current-slate model-vs-market agreement" + sub-line "Not historical calibration…"; `marketAgreement()` returns null → module hidden. Unit-tested tiers. |
| 13 | Unavailable modules honest — no fabricated soccer | ✅ | Reused `UnavailableModules`; artifact declares scoreline/first_scorer/xg/corners/cards unavailable; none are faked anywhere. |
| 14 | Recap block — copyable, real fields only | ✅ | `buildRecap` (matchup, gated run-count, strongest lean, pick count, paper-only); selectable `<pre>` + guarded `navigator.clipboard`. Unit-tested (no banned copy; run-count both branches). |
| 15 | `/simulate` lobby — hero + featured (ready-only) + dashboard preview | ✅ | Screenshot: hero "Run a precomputed model simulation…"; **5 featured cards** (=cap) each "Generate Simulation →"; 8 dashboard-preview chips; honest "no scoreline/xG/corners for MLB" note. |
| 16 | Sport dispatch ready for future soccer — honest, no fake soccer | ✅ | Runner dispatches on real `view.sport` (not hardcoded); non-MLB → neutral shell "No <sport>-specific view yet"; no fabricated soccer data. Tests. |
| 17 | Safety: money unchanged · no banned copy · static-export compatible · paper-only | ✅ | md5 `affe6b21…` before/after every phase; banned-copy grep clean; client-only (no fetch/fs/randomness in render); "educational · paper-only · not betting advice" throughout. |

## Deliberately deferred (honest, not gaps)
- **Soccer simulation dashboard** — the sport-dispatch shell is ready, but a soccer/World-Cup simulation **artifact** does not exist. No soccer sim is generated or faked; a non-MLB sport shows the honest neutral staging until a real artifact carries those fields. Soccer-only modules (first scorer, corners, exact scoreline, xG, cards, BTTS, half results, Asian handicap) remain honestly unavailable.
- **Distribution line/projection overlays** — `DistributionCard` renders the real bins; no markers are fabricated onto a distribution that doesn't carry them.
- **Inflated run-count / sampling-method-name language** — not used; the MLB artifact is a 1,000-run seeded simulation and is described exactly as that.

## Net
The MLB simulator is a complete product: a game report *with* a simulation button became a **simulation-first dashboard**. Every number traces to the precomputed deterministic artifact or renders an honest unavailable state. No canonical money, record, or md5 moved.
