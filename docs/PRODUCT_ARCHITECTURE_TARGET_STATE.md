# Product Architecture — Target State (2026-07-13)

A thin **pillar layer** over the existing routes. No rebuild, no broken links — compatibility aliases where
needed. Money untouched.

## Three pillars
```
1. SIMULATIONS   — the core engine + per-sport centers (the main product topic)
2. FLAGSHIP PICKS — Bank Builder + Moonshot (paper products powered BY the simulations)
3. RESULTS / TRUST — official money, paper track record, model performance, methodology
```

## Primary nav (target)
```
Simulate ·  Bank Builder ·  Moonshot ·  Today ·  Results
                 └── (Flagship Picks pillar) ──┘
Secondary / rail: Methodology · Mr. Dub (money) · Advanced Builder · About
```

## Route model (target) + compatibility
| target | role | reached today via | compatibility |
|---|---|---|---|
| `/simulate` | **Simulation hub** (+ coverage matrix, sport cards) | `/simulate` | `/games`→`/simulate` ✅ |
| `/simulate/mlb` *or* `/mlb` | MLB Simulation Center | `/mlb` | keep `/mlb`; add "Simulation Center" framing (alias `/simulate/mlb`→`/mlb`) |
| `/simulate/world-cup` *or* `/world-cup` | World Cup Simulation Center | `/world-cup` | keep `/world-cup`; add framing (alias `/simulate/world-cup`→`/world-cup`) |
| `/simulate/ufc` *or* `/ufc` | UFC Simulation Center (experimental) | `/ufc` | keep `/ufc`; add framing |
| `/picks` | **Flagship Products hub** (BB + Moonshot + Advanced Builder) | `/picks` | `/parlays`,`/parlay-lab`,`/nba/parlays`→`/picks` ✅ |
| `/bank-builder` | Bank Builder product | `/bank-builder` | keep |
| `/moonshot` | Moonshot product | `/moonshot` | keep |
| `/build` | Advanced Builder (secondary) | `/build` | relabel, demote from primary |
| `/results` | **Results Center** (money + paper + model + pending) | `/results` | keep; absorb legacy tracker |
| `/mr-dub` | official money / trust | `/mr-dub` | keep; cross-link from Results |
| `/methodology` | how sims work + coverage matrix | `/methodology` | keep |
| `/today` | today's slate STATUS (not a 2nd home) | `/today` | scope down |
| `/projections` | fold into sport centers or retire | `/projections` | de-primary |

## Pillar requirements (folded from the mission's per-area specs)

### Simulation hub (`/simulate`)
Hero → sport cards (MLB / World Cup / UFC / coming-soon) → **market-coverage matrix** (done this pass) →
current/next reports → methodology labels (independent / market-anchored / market-implied / projection-only /
experimental) → CTA to Bank Builder + Moonshot.

### Per-sport simulation centers
- **MLB:** slate/no-games → game sim cards → 10k claim only where artifact-backed → distributions → ML/RL/total
  probs → player-prop sim where available → market snapshot → model-vs-market → unsupported markets (team totals
  settlement-blocked, F5 coming-soon) → methodology. Full-game score sim = **market-implied**, labelled experimental.
- **World Cup:** knockout stage → semifinals prominent → final/3rd-place **TBD** → 1X2/DC/DNB/total/BTTS (market-
  implied) → market snapshot → unsupported props listed (scorer/shots/corners/cards = provider-needed) → bracket → match reports.
- **UFC:** current/post-event → fight card → market-implied moneyline where odds → experimental method/distance
  reads (labelled) → validation status → **never in product cards** until validated.

### Flagship products (`/picks`)
`/picks` = Flagship Products Hub → Bank Builder (structured) + Moonshot (longshot) + Advanced Builder (secondary).
Rules: No approved current card → **No Play**; paper-only; official money separate; **UFC + settlement-blocked
markets excluded** (enforced by `market-coverage.isProductEligible`).

### Results / Trust (`/results`)
Sections: (1) official money record 19-14 · (2) paper product-card results · (3) model performance/backtests ·
(4) pending settlement queue · (5) sport-by-sport · (6) experimental archive (UFC). Pending ≠ loss; hit rates
carry sample-size disclaimers; no fake ROI. Retire the vestigial legacy `results/` export.

## Sequencing
This target is reached in slices (see `SIMULATION_FIRST_PRODUCT_ROADMAP.md`). Slice 1 (this pass): the coverage
matrix + honest gap surface on `/simulate`. Nothing here breaks a route; every legacy URL keeps working.
