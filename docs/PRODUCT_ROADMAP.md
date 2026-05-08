# GametimePicks Product Roadmap — Phase 19

A staged plan toward a unique, finished, premium NBA player-prop analytics product. Bias toward shipping data correctness first, polish second, growth third.

## Time horizons

### Next 24 hours

1. **Apply Phase 19** + push
2. **Run `python -m pipeline.diagnose_props`** — confirms current blockers (~3 expected: no Odds API key, refresh disabled, nba_api not installed locally)
3. **Activate The Odds API** per `docs/ODDS_API_ACTIVATION.md` — start with `ODDS_DRY_RUN=true`, then real fetch
4. **Run `python -m pipeline.settle_results --date 2026-05-05 --source-report`** — see what nba_api would auto-settle
5. **Run `bash scripts/operator_settle.sh 2026-05-05`** — first real settled slate

### Next 7 days

1. Settle every completed slate using the auto-settlement flow — build up a track record (at least 5-10 slates)
2. Activate Buttondown via `NEXT_PUBLIC_BUTTONDOWN_USERNAME` env var
3. Monitor recent10 coverage daily via `inspect_trends`. If coverage stays <50%, debug playerId resolution
4. Schedule the auto-refresh workflow daily 1 hour pre-tipoff
5. Soft-launch share — small Discord / friends-and-family signal — gather first round of UX feedback

### Next 30 days

1. **Wire v1 simulation behind a feature flag** — new "Simulation lab" tab on player cards. Marked clearly experimental.
2. **Begin backtest harness** — `pipeline/backtest.py` walks settled slates and computes Brier / log loss by tier
3. **Live odds latency banner** — show users when odds were last fetched, in their local timezone
4. **Per-player history pages** — drill into any player to see settled-leans hit rate
5. **Polish Results dashboard** — once 5+ slates are settled, design a real Results UX (currently empty-state-only)
6. **Mobile sweep** — pass through every page at 375px viewport width

### Next 90 days

1. **v2 simulation** — bootstrap from recent10, Bayesian shrinkage, shipped to production once Brier < v1 on out-of-sample
2. **Calibration dashboard** — public-facing page showing realized vs predicted hit rates by confidence tier
3. **Daily email digest** — Buttondown campaign. Auto-sends after refresh succeeds.
4. **SEO landing pages** — one per top-N players with stable URLs (`/player/lebron-james`)
5. **Watchlist feature** — users save players, get notified when a lean lands
6. **Public changelog** — every model change is dated and described

### Must finish before public launch

- ≥ 30 days of consecutive settled slates with no fabricated data
- recent10 coverage ≥ 70% sustained
- Calibration curve published and visibly monotonic
- Newsletter active with confirmed welcome flow
- Mobile experience clean at 375px on every page
- Responsible-use language visible on every page (already done)
- Public Results dashboard with at least 100 settled leans
- About page that's clear about what the model is and isn't
- Privacy policy + terms (consult lawyer before going national)
- Brand strict: GametimePicks ≠ GameTimeVault, methodology page makes this clear

### Nice to have later

- Side-by-side parlay comparison
- Historical odds movement charts
- Player-vs-defender heatmaps
- Live in-game updates during NBA windows
- Discord bot pulling daily leans
- API key for power users

### Do not do yet

- **Sports book affiliate links** — never until model is proven AND legal review is done
- **Real-money integrations** — same as above
- **Multi-sport (NFL/MLB/NHL)** — NBA must be excellent first. Adding sports too early dilutes everything
- **AI-generated analysis text** — risk of hallucinated stats. Templates only, no LLM-driven copy in production
- **User-generated content / forums** — moderation cost > value at this scale
- **"Premium tier" / paywall** — premature; needs proven value first
- **Heavy ML / deep learning** — can't be explained on the methodology page; against our transparency principle
- **Sportsbook scraping** — explicitly off-limits forever

## Workstream breakdown

### A — Data correctness (highest priority)

| Item | Status | Phase |
|---|---|---|
| Real schedule | Done (Phase 7B) | shipped |
| Real odds | Unblocked (Phase 18) | needs operator activation |
| Settlement | Auto + manual fallback (Phase 19) | shipped |
| recent10 hydration | Code done; coverage low | needs board regen with nba_api |
| playerId resolution | Code done; gap on free tier | needs nba_api in workflow |
| Injury feed | Not yet | Phase 21+ |
| Minutes projection | Not yet | Phase 22+ |
| Lineup data | Not yet | Phase 22+ |

### B — Model quality

| Item | Status | Phase |
|---|---|---|
| Baseline projection | Done | shipped |
| Confidence tiers | Done (rule-based) | shipped |
| Backtest harness | Designed not built | Phase 20 |
| v1 simulation | Shipped, experimental | Phase 19 |
| v2 simulation | Designed | Phase 21 |
| Calibration curve | Designed | Phase 21 |
| Correlated simulation | Designed | Phase 23+ |
| Parlay scoring | Edge-based | Phase 23 (replace with sim) |

### C — Product UX

| Item | Status | Phase |
|---|---|---|
| Premium board | Done | shipped |
| Player cards | Done | shipped |
| Trend graphs | Done; data thin | needs coverage fix |
| Parlay Lab | Done (Phase 17) | shipped |
| Results dashboard | Empty state only | Phase 20 |
| Player profile pages | Not yet | Phase 20 |
| Daily slate digest | Email pending | Phase 20 |
| Mobile experience | Functional, not polished | Phase 20 |
| Royal/futuristic interface | In progress | continuous |

### D — Trust layer

| Item | Status |
|---|---|
| Responsible-use page | Done |
| Sample-size warnings | Done (Phase 17) |
| No-betting-advice copy | Done across all pages |
| Data freshness pill | Done (Phase 14) |
| Active-slate selector | Done (Phase 15) |
| Public changelog | Not yet (Phase 20) |
| Methodology page | Done; needs polish |

### E — Growth

| Item | Status | Phase |
|---|---|---|
| Newsletter foundation | Done (Phase 13) | shipped |
| Buttondown wiring | Done (Phase 18) | needs operator activation |
| SEO landing pages | Not yet | Phase 20 |
| Social sharing | Not yet | Phase 20 |
| Watchlist | Not yet | Phase 21 |
| Saved slips | Not yet | Phase 21 |
| Alerts | Not yet | Phase 22 |

### F — Multi-sport

| Sport | Phase |
|---|---|
| NBA | now |
| NFL | only after NBA hits the public-launch bar |
| MLB | not until NFL is real |
| NHL | not until MLB is real |

### G — Monetization

| Approach | When |
|---|---|
| Free tier only | now and through public launch |
| Premium analytics tier | after 6 months of stable launch + clear willingness-to-pay signal |
| Sports book affiliate (if pursued at all) | only after legal review and clear UX separation between editorial and affiliate |
| Sponsorships | revisit when audience > 5k subscribers |

## What this product becomes when finished

The picture worth committing to:

A premium-feeling NBA player-prop analytics platform where users see today's slate, drill into individual players' projections with full distributional context, build educational parlays that surface correlation honestly, and watch a published calibration curve prove the model isn't lying about its confidence. Free for the first audience. Honest about every limitation. Distinct from every "tipster" product because it shows its work.

The thing that makes it unique is **transparency at production scale** — a model with a public changelog, a public calibration curve, and an explicit no-fabrication contract enforced in tests. That's a product position no competitor in the prop-analytics space currently occupies.

## What's deliberately not in this roadmap

- A mobile native app (PWA covers it for now)
- Social features
- Live in-game audio
- Streaming integrations
- AI chatbot for "ask the model"
- Anything that requires us to claim profitability

Each of these is interesting; none unblocks the core value. They're deferred until the core works.
