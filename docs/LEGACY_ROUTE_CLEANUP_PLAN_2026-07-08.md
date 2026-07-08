# Legacy Route Cleanup Plan — 2026-07-08

**Goal:** reduce confusion from 30+ reachable routes without deleting anything or breaking direct URLs. This audits every non-primary route and recommends an owner-safe action. Nothing is deleted here; Phase 3 removes only *clearly-safe* stray links. Money untouched (md5 `affe6b21071f2b3be96bb2774eb347c3`, 19-14, $0 exposure).

## Discovery surfaces today
- **Primary nav** (5-tab spine): Simulate · Today's Picks · Results · Bank Builder (+ Home). Clean — no legacy.
- **Secondary nav** (after divider): Game Reports · MLB · World Cup · Build-a-Pick · Soccer Specials · Moonshot · Track Record · How It Works. No legacy/off-season.
- **Command rail** (desktop lg+): lists more, incl. off-season sports (NBA, UFC), Build, Methodology, About.
- **Footer**: links NBA, NHL, Parlay Lab (legacy alias), Methodology.
- **Orphan legacy cluster**: /board, /events, /trends, /projections are linked only *to each other* (trends→board, sports→events) — NOT from the main nav/home, so already off the primary discovery path.

## Audit table

| Route | Status | In nav? | Active product? | Legacy/off-season/internal | Recommended action | Risk | Owner approval? |
|---|---|---|---|---|---|---|---|
| `/build` | works | no (game-card CTA) | **yes** — betslip builder, linked from every game card | active | **keep public** | — | no |
| `/parlays`, `/parlay-lab` | redirect → `/picks` | footer + trending tabs | alias of Build-a-Pick | legacy alias | keep (back-compat redirect); **remove stray footer/tab link** (use `/picks`) | low | no |
| `/nba` | works (off-season board) | command-rail + footer | no — season over (Finals done) | off-season | **remove links** from footer + rail; keep route; add "off-season" | low | no (seasonal) |
| `/nhl` | works (off-season) | footer | no — off-season | off-season | **remove footer link**; keep route | low | no (seasonal) |
| `/ipl` | works (off-season) | not in nav (page cross-link) | no | off-season | keep route; remove any stray link | low | no |
| `/ufc` | works (intermittent) | command-rail | intermittent (between cards) | seasonal | **keep** (returns often); gated in `/games` when stale | low | no |
| `/board` | works | no | no — legacy NBA board | legacy | keep buildable; already off primary path (only /trends links it) | low | **yes** to retire |
| `/events` | works | no | no — legacy schedule | legacy | keep buildable; only /sports links it | low | **yes** to retire |
| `/trends` | works | no | no | legacy | keep buildable; not in nav | low | **yes** to retire |
| `/projections` | works | no | no | legacy/internal | keep buildable; not in nav | low | **yes** to retire |
| `/sports` | works | no | partial (sports directory) | legacy-ish | keep buildable; consider folding into `/simulate` later | med | **yes** |
| `/preview` | works | no | no | internal | keep internal; no public link | low | no |
| `/homer-nukes` | retired landing | no | no (retired 2026-06-30) | retired | keep landing (history); no nav link | low | no |
| `/methodology` | works | footer + many pages | info page | info | **keep** (legitimate, widely linked) | — | no |
| `/about`, `/responsible-use`, `/learn` | works | learn/footer | info pages | info | **keep** | — | no |
| `/ops` | works | not in public nav | internal admin | internal | **keep internal** (noindex) | — | no |
| `/mr-dub` | works | secondary ("Track Record") | active trust surface | product | keep (secondary); consider "Daily Dashboard" rename | low | **yes** for rename |
| `/results`, `/bank-builder`, `/simulate`, `/today` | works | primary | **yes** | active | **keep primary** — never hide | — | no |

## Phase-3 (this session) — clearly-safe removals only
Remove stray links to **off-season sports (NBA, NHL)** from the footer + command-rail (routes stay buildable; direct URLs unaffected; trivially reversible when the seasons return). Leave everything else as documented; retiring the legacy cluster (`/board`, `/events`, `/trends`, `/projections`, `/sports`) needs **owner approval** and is deferred.

## Owner decisions still needed
1. Retire (redirect/archive) the legacy cluster `/board`, `/events`, `/trends`, `/projections`, `/sports`?
2. Rename `/mr-dub` "Track Record" → "Daily Dashboard", or keep?
3. Seasonal policy: auto-hide off-season sport nav links (NBA/NHL/IPL) when their board is stale, and auto-restore in-season?
