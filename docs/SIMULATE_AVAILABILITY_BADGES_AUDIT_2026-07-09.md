# `/simulate` Availability Badges — Audit & Design (2026-07-09)

**Goal.** Make the `/simulate` lobby easier to understand *before* a user clicks into a game, by
showing small, artifact-backed chips of what each fixture can simulate. Chips say **what is
available**, never the prediction. No fabricated markets, no leaked probabilities/prices/leans, gate
untouched, money untouched.

---

## 1. Current card data source

- Route: `src/app/simulate/page.tsx` → `SimulateLobby` (`src/components/games/simulate-lobby.tsx`).
- The lobby builds `GameRow[]` and renders them via `SportSelector` →
  `GamesExperience` (`src/components/games-experience.tsx`), which paints each game `<article>`.
- Every row is derived from the SAME joined details the rest of the site uses:
  `buildAllGameDetails()` (`src/lib/game-detail.ts`) → `PublicGameDetail`, keyed `sport/slug`.
- `PublicGameDetail` already joins every per-game artifact we need — nothing new to ingest:
  | Field | Backing artifact | Accessor |
  |---|---|---|
  | `gameLabSimulation` | `public/data/mlb/game-simulations/<date>.json` | `buildGameSimulationView` |
  | `gameCenter` (MLB) | `public/data/mlb/team-markets/<date>.json` | `getMlbGameCenter` |
  | `wcGameCenter` | `public/data/world-cup/projections/<date>.json` (de-vigged) | `getWcGameCenter` |
  | `wcExpanded` | `public/data/world-cup/expanded-markets/<date>.json` | `getWcExpandedMarkets` |

**Consequence:** the availability loader can derive chips **purely from the already-joined detail** —
DRY and honest by construction. It never re-reads raw JSON, never couples to a new file, and can only
emit a chip when the corresponding typed field is populated.

Verified live for the 2026-07-09 slate:
- MLB game `2b3ca349…`: `runCount = 10000`, 8 generated picks, moneyline + run line + total all present.
- WC match `b6e926d7…`: matchResult + total + BTTS + double chance + draw-no-bet present; expanded
  Asian handicap + team totals present.

## 2. Proposed loader

`src/lib/simulate-availability.ts` — **pure, framework-free** (no fs, no React/Next), mirroring
`simulate-lobby-featured.ts` so it unit-tests directly with a relative import.

```ts
export type AvailabilityBadgeKind = "simulation" | "market" | "prop" | "comingSoon";
export interface GameAvailabilityBadge { key: string; label: string; kind: AvailabilityBadgeKind; source: string; }
export function mlbAvailabilityBadges(detail: MlbAvailabilityInput): GameAvailabilityBadge[];
export function worldCupAvailabilityBadges(detail: WcAvailabilityInput): GameAvailabilityBadge[];
```

Inputs are structural subsets of `PublicGameDetail`, so `mlbAvailabilityBadges(detail)` type-checks
with a real detail. The lobby computes chips **server-side** and threads them onto `GameRow`
(`availabilityBadges`) as plain serializable data; the client card only renders them.

## 3. Supported-module mapping by sport

Each chip is emitted **only** when its backing field is present on the detail.

### MLB (`mlbAvailabilityBadges`)
| Chip | Kind | Condition |
|---|---|---|
| `${runCount.toLocaleString()}-run` (e.g. `10,000-run`) | simulation | sim ready/stale **and** `allowsRunCountClaim` **and** positive-integer `runCount` |
| `Moneyline` | market | `gameCenter.moneyline` present |
| `Run Line` | market | `gameCenter.runLine` present |
| `Total` | market | `gameCenter.total` present |
| `Player Props` | prop | sim ready/stale **and** `generatedPicks.length > 0` |
| `Distributions soon` | comingSoon | any of the above exist (documented roadmap — §5) |

### Soccer / World Cup (`worldCupAvailabilityBadges`)
| Chip | Kind | Condition |
|---|---|---|
| `Market-implied` | market | `wcGameCenter` present (lead framing) |
| `Match Result` | market | `wcGameCenter.matchResult` present |
| `Total` | market | `wcGameCenter.total` present |
| `BTTS` | market | `wcGameCenter.btts` present |
| `Asian Handicap` | market | `wcExpanded.asianHandicap` present |
| `Team Totals` | market | `wcExpanded.teamTotals` present |
| `Double Chance` | market | `wcGameCenter.doubleChance` present |
| `Draw No Bet` | market | `wcGameCenter.drawNoBet` present |

Ordering puts the expanded modules (Asian handicap / team totals) ahead of the derivative
double-chance / draw-no-bet views so the most informative markets survive the display cap.

## 4. Unsupported-module policy

Never advertised as available. Explicitly **not** emitted:
- **Soccer:** `10,000-run` (soccer is market-implied, never a sampled sim), corners, cards, exact
  score, xG, first/anytime scorer, player shots/SOT/assists. These need either a new provider or a
  built panel; until then they live on the game page's honest "coming soon" tab, not as lobby chips.
- **MLB:** margin distribution, total-runs distribution, team totals (not ingested for MLB). The
  alternate-line ladders are the single documented `Distributions soon` coming-soon chip — never a
  primary "available" badge.

If a module doesn't exist, there is simply no chip. No fabricated value ever appears.

## 5. Coming-soon policy

Exactly one coming-soon chip is permitted, and only because it is a **documented** roadmap item:
`Distributions soon` (MLB alternate-line margin/total ladders — see
`docs/MLB_ALTERNATE_LADDERS_AUDIT_2026-07-09.md`, deferred with a thin-tail-bin rationale). It is
rendered subdued (reduced opacity, muted color) and trails the real chips. Soccer carries **no**
coming-soon lobby chip — its roadmap detail is on the game page.

## 6. Pre-click leakage policy

Lobby chips are high-level module names only. **Allowed:** `10,000-run`, `Moneyline`, `Run Line`,
`Total`, `Player Props`, `Market-implied`, `Match Result`, `BTTS`, `Asian Handicap`, `Team Totals`.
**Forbidden (never emitted):** any probability, price, or lean — e.g. `Rays 57%`, `Under 7.5`,
`France -1 cover 46.5%`. The loader has no access to a probability/price field and never formats one;
the gate on the game page (Generate → tabbed dashboard) is unchanged.

## 7. Rendering

In `GamesExperience`, a wrapped chip row sits between the matchup band and the signal box:
- `flex flex-wrap` — mobile-safe, no horizontal scroll.
- Display cap of 6 visible chips + a subdued `+N more` (the game page shows the full set).
- Simulation chip gets a calm gold accent; market/prop chips are neutral; coming-soon is dimmed.
- No red overload — reuses existing tokens (`--vault-gold-*`, `--vault-rule`, `--vault-text-*`).

## 8. Integrity

- Money-independent: the loader never touches `portfolio.json` / bankroll; money md5
  `affe6b21071f2b3be96bb2774eb347c3` unchanged.
- No banned copy (`safe`, `lock`, `guaranteed`, …) in any chip label.
- Gate intact: chips describe availability in the lobby; the game-detail dashboards stay gated behind
  Generate.
