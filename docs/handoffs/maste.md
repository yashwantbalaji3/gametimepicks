# Fable 5 Master Prompt — GameTime Picks Soft-Launch Upgrade Plan

**Current time/context:** July 4, 1:55 AM ET  
**Soft-launch target:** July 10  
**Primary mission:** Make GameTime Picks feel like a polished, trustworthy sportsbook-style product while preserving the current methodology, settlement discipline, and money integrity.

You are Fable 5 working inside the GameTime Picks codebase. Work through this prompt in phases. Keep working all night until you either reach the end goal or hit a hard blocker. Do not stop at diagnosis. Ship the highest-impact validated improvements in safe logical batches.

---

## Non-Negotiable Rules

1. **No fabricated data.**
   - No fake odds, props, scores, hit rates, injuries, line movement, CLV, or weather.
   - If a market is not available, show `Market pending`, `Not offered`, or `No qualified play`.

2. **Canonical money is sacred.**
   - Only official settlement paths may change canonical portfolio money.
   - Every money mutation requires official results, dry-run, hand-grade verification, apply, money-integrity, forensic, idempotence, and deploy verification.
   - Never hand-edit canonical money files.

3. **Homer Nukes remains retired.**
   - It may remain in historical ledgers only.
   - It must not appear as an active product, active nav item, or active board.

4. **Bank Builder rules.**
   - Max 2–3 legs per lane.
   - Team/game markets only.
   - No player props.
   - No weak coin-flip filler just to chase payout.
   - Approved cards must never drift.
   - Lane A should be safety-first, especially on later steps with larger stake.
   - Lane B can be safer low-payout or value, but must be clearly labeled.

5. **Moonshot rules.**
   - Structured by game.
   - Prefer team/game markets.
   - Player props only in clearly high-volatility contexts if intentionally supported.
   - Must show volatility, correlation, why-hit, and why-fail.

6. **WC Specials rules.**
   - Must be grouped by game.
   - Must have tiered reliability.
   - No forced cards.
   - Must be useful and compelling, not random longshots.

7. **Deploy only after gates pass.**
   - tsc clean
   - full tests pass
   - build passes
   - money-integrity passes
   - forensic audit passes
   - idempotence passes
   - health passes
   - production smoke passes

---

# Phase 0 — Baseline Audit and Ground Truth

Before editing code, establish the current truth.

Run:
- `git status`
- identify current branch and HEAD
- inspect recent commits
- money-integrity
- forensic audit
- idempotence
- health
- tsc
- full test suite if feasible
- build if feasible

Record:
- canonical record
- canonical bankroll
- crown
- drawdown
- profit
- portfolio md5
- current slate date
- latest World Cup projection date
- latest MLB board date
- latest player-props date
- latest settlement date per product/sport
- current Bank Builder Lane A/B status
- current Moonshot status
- current WC Specials status
- current Suggested Parlays status
- current Mr. Dub ledger status

Deliver a short baseline summary before making changes.

---

# Phase 1 — Product Inventory and Route Audit

Audit every meaningful route and classify it as:
- Launch-ready
- Needs polish
- Stale
- Broken
- Legacy/should hide
- Needs data refresh

Routes to inspect:
- `/`
- `/today`
- `/games`
- `/bank-builder`
- `/moonshot`
- `/world-cup`
- `/world-cup/round-of-32` or knockout route
- `/world-cup-specials`
- `/mlb`
- `/picks`
- `/results`
- `/mr-dub`
- `/methodology`
- retired `/homer-nukes`

For each route check:
- stale dates
- stale cards
- visible undefined
- NaN
- broken links
- mobile layout
- bad empty states
- missing status badges
- unclear CTAs
- too much noise
- insufficient betting/actionable info
- hidden flagship products
- incorrect record/hit rate
- retired product leakage
- mixed design systems

Create a prioritized issue list:
- Critical
- High
- Medium
- Low

Critical and high issues must be fixed before polish.

---

# Phase 2 — Data Freshness and Daily Refresh Pipeline

The site must feel current every day.

Audit:
- World Cup refresh flow
- MLB refresh flow
- player props ingest
- specials generation
- suggested parlays generation
- daily portfolio activation
- Mr. Dub ledger rebuild
- results settlement
- static rebuild / Vercel deploy hook

If the refresh process is manual, create or harden an orchestrator.

Desired script:
`refresh_daily_products.sh` or similar, with:
- date argument
- sport selection
- dry-run mode
- credit guard
- money mutation guard
- fail-closed behavior
- logs of generated artifacts
- no deploy by default

It should support:
- World Cup odds fetch
- World Cup projections
- World Cup board
- World Cup player props
- WC Specials
- Suggested Parlays
- daily portfolio
- MLB board
- MLB props ingest
- schedule shape correction
- Homer retired cleanup
- master ledger rebuild
- health check

Also create docs:
- how to run daily refresh
- when to settle
- when to regenerate
- how to verify
- how to deploy

---

# Phase 3 — Settlement Pipeline Hardening

Audit all settlement flows:
- Bank Builder
- Moonshot
- WC Specials
- Suggested Parlays
- MLB props
- optimizer
- soccer knockout AET/PEN handling
- pending/unsupported handling

Confirm:
- team markets settle on 90-minute regulation score unless market says otherwise
- extra time does not incorrectly flip 90-minute totals/moneyline
- player props pend if feed is ET-inclusive and cannot be safely inferred
- Over 1.5 / Over 2.5 lines parse correctly
- DNB/DC/BTTS grade correctly
- official results only
- settlement is idempotent

Add tests where missing:
- AET/PEN 90-minute total
- Over 1.5 vs Over 2.5
- approved Bank Builder card never drifts
- no double settlement
- pending markets not losses
- unsupported markets not losses
- stale daily portfolio cannot corrupt money

If completed games exist since last settlement:
- dry-run settle
- hand-grade
- apply only if official data complete
- rebuild ledger
- run money gates
- migrate tests only to verified canonical state

---

# Phase 4 — Bank Builder Redesign and Stability

Bank Builder must be one of the main launch products.

Audit:
- current Lane A status
- current Lane B status
- active step/rung
- approved-card file
- restart logic
- pool source
- selector
- daily portfolio output
- display pages

Fix:
- no player props in BB pool
- no MLB props in BB pool
- no coin-flip filler
- max 2–3 legs
- approval lock must prevent drift
- daily selector must not silently swap approved cards
- both lanes must have clear state:
  - Active
  - Awaiting settlement
  - Advanced
  - Stopped
  - Restarted
  - No qualified play

UI requirements:
- show Lane A and Lane B side by side
- show step number, cycle, stake, target, potential payout
- show each leg with market, odds, confidence, settlement status
- show why it can hit / why it can fail
- show “approved card locked” if applicable
- no operator-action-required copy for user-facing pages
- if no card qualifies, show premium empty state explaining why

Methodology enhancement:
- Add “Safety-first mode” for later ladder steps.
- Lane A on higher stake should prefer high-confidence team markets even if payout is lower.
- Avoid over-optimizing to rung target with weak legs.
- Document the tradeoff between target payout and probability.

---

# Phase 5 — Moonshot Redesign and Stability

Moonshot should be high-upside but not random.

Audit:
- current Moonshot lanes
- whether player props dominate
- whether legs are grouped by game
- whether cards are coherent
- whether it can settle
- current record
- whether it is stale

Redesign requirements:
- grouped by game
- 3–8 legs depending on slate size
- no forced card
- clear “lottery / high volatility” label
- show why it can hit
- show why it can fail
- show correlation warning
- show total odds and implied/model probability
- avoid weak 0.5 props unless justified
- prefer game-script alignment

Add tiers if useful:
- Structured
- Aggressive
- Stars
- Game Script

---

# Phase 6 — WC Specials Upgrade

WC Specials must be “a banger.”

Audit:
- are cards stale?
- are cards useful?
- are they too many legs?
- are they grouped by game?
- are tiers clear?
- are player props used responsibly?
- does Reliable tier avoid props?
- do users know what to pick?

Required tiers:
1. Reliable
   - team markets only
   - strongest favorites/protection
   - lower volatility
2. Balanced
   - team + one value market
3. Aggressive
   - higher payout
   - clearly marked volatility
4. Game Script
   - legs aligned to score/BTTS/total lean

Each card should show:
- legs grouped by game
- odds
- model confidence
- volatility
- correlation
- why it can hit
- why it can lose
- settlement status
- no forced cards

If a slate has only 2 games:
- show fewer cards if necessary
- do not fake a Reliable tier if not supported
- state why card count is lower

---

# Phase 7 — World Cup Knockout Page Overhaul

This is a priority. The current table is useful but noisy. Make it a sportsbook-style pick board.

## Main table columns should be:
- Game
- Time/status
- Model score lean
- Best result pick
- Best protection pick
- Total goals pick
- BTTS pick
- Best player prop if posted
- Confidence
- Knockout risk
- CTA

Remove:
- raw IDs
- redundant metadata
- long descriptions
- unused labels
- repeated status text
- unavailable markets unless compact
- anything that prevents quick scanning

Add filters:
- Today
- Upcoming
- Completed
- High confidence
- Team props
- Player props posted
- Market pending
- Reliable picks
- High risk

Add sorting:
- kickoff
- confidence
- model probability
- payout
- knockout risk

Add row expansion:
- quick parlay builder preview
- top 3 team picks
- top 3 player picks
- why model likes it
- risk note

The user should be able to open this page and know exactly what to bet in under 30 seconds.

---

# Phase 8 — Game Detail Page Upgrade

Every World Cup game detail page must be a betting dashboard.

Sections:
1. Hero
   - teams
   - kickoff
   - status
   - predicted score
   - win/advance lean
   - total goals lean
   - BTTS lean
   - knockout risk

2. Best Picks
   - top 3 team/game markets
   - top 3 player props if available
   - confidence
   - odds
   - model probability
   - settlement support

3. Team Markets Table
   - moneyline
   - double chance
   - draw no bet
   - totals
   - BTTS
   - team to advance if real, otherwise labeled proxy

4. Player Props Table
   - anytime goalscorer
   - shots
   - shots on target
   - assists
   - other posted markets
   - if unavailable, show pending

5. Suggested Parlays
   - Safe
   - Balanced
   - Value
   - Game Script

6. Methodology / Risk
   - why model likes it
   - why it can fail
   - knockout-specific risks

No fabricated props.

---

# Phase 9 — MLB Product Upgrade

Baseball must not be neglected.

Audit:
- latest MLB board
- latest MLB props
- latest MLB suggested parlays
- latest MLB settlement
- /mlb page quality
- /games MLB cards
- /picks MLB cards

Fix:
- refresh MLB board for current date if live odds available
- ingest player props
- correct schedule shape
- remove Homer artifacts
- hide retired Homer
- generate MLB suggested parlays by game/tier if qualified

MLB suggested parlay tiers:
- Safe
- Balanced
- Value
- Aggressive

Must exclude:
- Pass leans
- unsupported props
- stale games
- completed games shown as live

Show:
- best player props
- pitcher props
- game-level grouping
- confidence
- odds
- market probability
- model probability if validated
- “market-implied” label where appropriate

---

# Phase 10 — Suggested Parlays and Picks Hub

The Picks page should be useful, not a dump.

Audit:
- active picks
- stale picks
- no-qualified states
- one-leg broken cards
- null odds
- supported vs unsupported settlement
- sport filters
- risk filters

Fix:
- remove broken legacy cards
- group by sport
- group by date
- group by risk tier
- show status
- show settlement support
- show no-play premium states
- allow users to understand why a card exists

For each parlay:
- legs grouped by game
- odds
- implied probability
- model confidence
- volatility
- correlation note
- why it can hit
- why it can fail
- pending/settled status

---

# Phase 11 — Results and Hit-Rate Truth

Results must be honest and trustworthy.

Audit:
- latest settled date per sport
- latest settled date per product
- optimizer latest date
- pending counts
- void counts
- unsupported counts
- pushes
- stale warning
- hit rate math

Fix:
- never count pending as loss
- never count unsupported as loss
- show settled-only hit rate
- show stale banners clearly
- show product-level records
- show sport-level records
- show daily timeline
- show pending section
- show settlement queue
- show unsupported markets separately

Add tests:
- pending not loss
- unsupported not loss
- stale optimizer banner
- product date labels
- hit rate denominator correct

---

# Phase 12 — Mr. Dub Ledger Polish

Mr. Dub was upgraded, but polish and verify.

Audit:
- every KPI
- every chart
- product attribution
- daily timeline
- active exposure
- pending status
- mobile layout
- animation performance
- stale data
- canonical match

Make sure:
- record matches portfolio
- bankroll matches portfolio
- crown matches portfolio
- day-by-day journey starts at $100
- latest settlement day appears
- current active/pending cards visible
- no broken charts
- no hidden ledger

Enhance if time:
- better mobile chart tabs
- sticky KPI row
- clearer active exposure
- better daily detail drawer
- product filter persistence
- “What happened today?” summary

---

# Phase 13 — Home and Today Redesign

Home and Today should be the launch landing surfaces.

Home should answer:
- What are today's best picks?
- What products are active?
- What is Bank Builder doing?
- What is the bankroll story?
- What sports are live?
- What’s stale/pending?

Today should include:
- flagship product cards
- best picks across sports
- fresh status badge
- date/time context
- no stale cards
- premium no-play states
- quick links to games and products

Make it clear for a new user:
- where to click
- what to trust
- what is pending
- what the record is

---

# Phase 14 — Navigation and Information Architecture

Make the app feel like a sportsbook product.

Recommended primary nav:
- Today
- Games
- World Cup
- MLB
- Picks
- Bank Builder
- Mr. Dub
- Results
- Methodology

Hide or demote:
- legacy routes
- old preview pages
- retired products
- thin routes
- duplicate dashboards

Ensure mobile nav:
- max 5–6 core items
- clear labels
- no dead routes
- active state
- quick access to Today/Games/Bank Builder/Mr. Dub

Add page headers with:
- status badge
- latest data date
- CTA
- short explanation

---

# Phase 15 — Design System and Visual Polish

Audit current token split:
- `--vault-*`
- `--gtp-*`

Do not rewrite everything at once. Create a practical design unification plan.

Immediate polish:
- consistent cards
- consistent badges
- consistent odds pills
- consistent confidence chips
- consistent page headers
- consistent empty states
- consistent table styling
- mobile spacing
- reduced-motion safety

Animations:
- subtle card entrance
- ladder progress
- chart draw
- status pulse for live
- no heavy or distracting effects
- respect prefers-reduced-motion

Bank Builder graphics:
- ladder rung visual
- step progress
- locked approved card
- settlement status
- payout target visualization

Moonshot graphics:
- trajectory / rocket-style but tasteful
- volatility arc
- grouped game cards

WC Specials graphics:
- tier cards
- reliability bands
- game grouping
- risk badges

---

# Phase 16 — Status Badge Rollout

Use shared StatusBadge/FreshnessBadge everywhere.

Apply to:
- Bank Builder
- Moonshot
- WC Specials
- Picks
- Results
- Mr. Dub
- Methodology
- Games
- MLB
- World Cup

Statuses:
- Active
- Live
- Pregame
- Awaiting settlement
- Awaiting refresh
- Market pending
- No qualified play
- Settled
- Retired
- Historical
- Stale
- Locked
- Approved

No bespoke inconsistent badges unless necessary.

---

# Phase 17 — Soft Launch QA

Before final deploy, perform launch QA:

Pages:
- /
- /today
- /games
- /bank-builder
- /moonshot
- /world-cup
- /world-cup/round-of-32
- /world-cup-specials
- /mlb
- /picks
- /results
- /mr-dub
- /methodology
- /homer-nukes

Check:
- HTTP 200
- no visible undefined
- no NaN
- no broken links
- no stale active cards
- no Homer active
- no fake hit rates
- no fake props
- canonical money correct
- fresh slate dates
- mobile readable
- tables not overflowing
- CTAs obvious
- empty states premium
- all products discoverable

---

# Phase 18 — Testing and Gates

Run:
- tsc
- all tests
- build
- money-integrity
- forensic
- idempotence
- health

Add tests for any fixed regression:
- Bank Builder no drift
- Bank Builder max 3 legs
- Bank Builder no props
- knockout table row contents
- no Pass leans
- status badges
- hit-rate denominator
- Mr. Dub canonical match
- Homer retired
- pending not loss
- unsupported not loss

Do not deploy if red.

---

# Phase 19 — Commit Strategy

Commit in logical batches:
1. Data refresh / settlement
2. Flagship product logic
3. World Cup page/game detail UX
4. MLB/Picks/Results
5. Mr. Dub / Home / Today
6. Navigation/status/design polish
7. Tests

If changes are too intertwined, one clear commit is okay, but message must explain:
- products refreshed
- UI upgraded
- money untouched or official settlement applied
- gates passed

---

# Phase 20 — Deploy and Production Verification

Push to main.
Wait for Vercel.
Run smoke.

Production must verify:
- current canonical money
- current slate
- Bank Builder correct
- Moonshot correct
- WC Specials correct
- MLB correct
- Mr. Dub correct
- Results honest
- no undefined/NaN
- Homer retired

---

# Final Report Required

Report in this format:

1. Baseline state.
2. Settlement/data refresh completed.
3. Product statuses:
   - Bank Builder
   - Moonshot
   - WC Specials
   - Suggested Parlays
   - MLB
   - Results
   - Mr. Dub
4. World Cup knockout page changes.
5. Game detail changes.
6. Home/Today changes.
7. Navigation changes.
8. Design/animation changes.
9. Testing/gates.
10. Production verification.
11. Remaining blockers.
12. Soft-launch readiness score out of 10.
13. What must be done before July 10.

Keep working all night until either:
- the site is soft-launch ready,
- official data is unavailable,
- live odds are unavailable,
- money safety fails,
- or validation gates fail.

If blocked, leave the site in a clean, deployable state and report exactly what remains.
