# Sports Event / Prediction Market Capability Audit

**Date:** 2026-07-23
**Scope:** Read-only, artifact-backed audit. Determines whether the GameTimePicks
repo has ANY real capability to support Kalshi/Polymarket-style **sports event /
prediction-market contracts** — multi-outcome event contracts resolved by
news/rules rather than box scores (e.g. "player's next team", "coach fired before
date", "MVP winner", "playoff qualification", "draft position", "tournament winner").
No code or data was modified; this document is the only file written.

---

## 1. Honest summary

**The repo has NO capability for sports event / prediction-market contracts. The
classification is UNSUPPORTED.** Every "market" in the codebase is a **sportsbook
betting market** (moneyline, run line, total, player over/under) priced from The
Odds API and resolved from **official box scores** (MLB StatsAPI linescore/gameLog,
official soccer full-time results). There is no event-contract schema, no
multi-outcome event model, no news/RSS/press ingestion, no evidence-timeline or
source-reliability system, no resolution-rule storage, no Kalshi/Polymarket price
capture, and no event-outcome settlement path. The word "prediction markets" that
appears in the UFC expansion doc explicitly means sportsbook lines (moneyline /
method of victory / round totals), and the only Kalshi/Polymarket references
anywhere are old session-handoff notes citing Kalshi as a **UI styling idea**
("a Kalshi-style read" = an outcome-first card), not an integration. A handful of
*adjacent primitives* exist (a manual news-override JSON, player/team identity
registries, and a mature box-score settlement framework), but each was built for
the per-game prop simulator and none is an event-market scaffold. There is not even
a stub route, type, or data file dedicated to event contracts — hence UNSUPPORTED
rather than SCAFFOLD_ONLY.

---

## 2. Capability checklist

| # | Capability | Exists? | Evidence (path) | Notes |
|---|------------|---------|-----------------|-------|
| 1 | News / article ingestion (RSS, press, Twitter/X, beat reporters) | **No** (manual-only adjacent) | `pipeline/manual_overrides/news_signals.json`; `.env.example` (`NEWS_PROVIDER=manual`, `NEWS_DATA_MODE=manual`, `# X_API_KEY=` commented out); read by `pipeline/generate_daily_board.py`, `pipeline/config.py` | No automated fetching. A human pastes verified injury/lineup signals with a `sourceUrl`; used to nudge **player-prop projections**, not event contracts. X/Twitter key is documented but commented out. |
| 2 | Event-market schemas (`EventMarket` / `Contract` / `PredictionMarket` / `Resolution`) | **No** | grep of `app/src` for those interfaces → none. Only `type Outcome` in `app/src/lib/world-cup/specials-ledger.ts:46` (`"won"\|"lost"\|"push"\|"pending"`) and `app/src/lib/world-cup/game-prop-parlays.ts:481` (prop-odds outcome) | Both `Outcome` types are bet-settlement/odds shapes for game props, not event contracts. |
| 3 | Multi-outcome (N-way, non-binary) probability models | **No** | Existing engines are binary over/under (`N(proj, σ)` sampling, per `app/src/lib/game-simulations/`) + soccer fixed 3-way game result de-vigged from posted odds (`app/src/lib/world-cup/round-of-32.ts:224`) | No multinomial/categorical/Dirichlet distribution over an open set of event outcomes. The soccer "3-way" is a fixed home/draw/away game market, not a general N-way event model. |
| 4 | Evidence timelines / source-reliability tiers / `publishedAt` tracking | **No** (partial shape only) | `pipeline/manual_overrides/news_signals.json` carries `sourceName`, `sourceUrl`, `sourceReliability`, `createdAt`, `expiresAt`, `confidence` | Closest thing to an "evidence item," but it is a single manual override list, not a timeline/aggregation model. In-app "evidence" (e.g. `app/src/components/ui/player-prop-card.tsx`) means **box-score** evidence (last-5, final score, role), not dated news. No source-tier system. |
| 5 | Entity resolution (player/team/coach registry, name→id) | **Partial (players/teams only)** | `app/src/lib/sport-identity.ts`, `app/src/lib/alias-redirects.test.mjs`, `app/public/data/world-cup/player-markets/player-identity-latest.json`, `components/player-avatar` + `team-logo` | Maps player/team **names → provider (ESPN/API-Football) ids** for headshots/logos/aliases. No coach/manager/executive/general-entity registry; not built for event subjects. |
| 6 | Rule / resolution storage (resolution source, rule, deadline) | **No** | grep for `resolutionSource` / `resolutionDeadline` / `resolveBy` / `resolutionRule` across `app/src`, `app/scripts` → none | No concept of a contract resolution rule, source-of-truth, or deadline. |
| 7 | Market snapshots + price history for event contracts (Kalshi/Polymarket capture) | **No** | grep for `orderbook` / `yes.?price` / `contract.?price` / `priceHistory` → none. `"no-price"` in `app/src/lib/selected-bankroll-allocation.ts:62` = a **bet leg missing its odds** | Odds captured are American sportsbook odds for **game** markets only (The Odds API). No event-contract price/orderbook capture. |
| 8 | Settlement for event outcomes (vs box-score settlement) | **No** | Settlement scripts (`app/scripts/settle-*.mjs`, `pipeline/settle*.py`, `app/scripts/build-mlb-product-settlement.mjs`) all resolve from **official results**. Even "advancement/outright" is a **proxy**: `app/public/data/world-cup/round-of-32/board.json:7` — "advancement is a de-vig proxy, not an outright market"; `app/src/lib/settlement/soccer-markets.ts:71` | Mature settlement infra exists but is 100% box-score / official-result driven (StatsAPI linescore, soccer FT). No news-/rule-resolved event settlement. The nearest "outright"-sounding markets are de-vig proxies on 90-minute game results. |
| 9 | Prediction-market public routes (events/markets/futures beyond game props) | **No** | `app/src/app/events/page.tsx` = **schedule-only** hub for unmodeled leagues ("No odds, no projections, no parlays, no picks"); `app/src/app/market-guide/page.tsx` = betting-**term glossary**. No `/futures`, `/awards`, `/mvp`, `/draft` routes | `/events` displays ESPN schedule snapshots only; `/market-guide` defines "model %, market %, edge, EV" etc. Neither is an event-contract surface. |
| 10 | Any mention of Kalshi / Polymarket / prediction market / event contract / futures | **No integration** | `SESSION_HANDOFF_2026-05-22_PRE_OVERNIGHT_OVERHAUL.md:482,596` (Kalshi as a **UI card style**); `docs/archive/generated-reference/PR_END_TO_END_RECORD.md:170` ("Kalshi-style read"); `docs/audits/ufc-expansion-foundation-latest.md:23` ("prediction markets" = **sportsbook** moneyline/method/rounds) | No provider, no data, no code. "Kalshi" = an outcome-first display idea; "prediction markets" in the UFC doc = betting lines. |

**Also checked — futures / awards / MVP / draft / trade / coach artifacts or routes:**
none found. `find app/public/data app/src/app` for `future|award|mvp|draft|coach|trade`
directories → empty. The only `outright`/`to_win`/`advancement` strings live in the
**World Cup soccer** game-market code and are explicitly de-vig proxies on match
results, not event contracts.

---

## 3. Overall classification

### `UNSUPPORTED`

**Justification.** SCAFFOLD_ONLY would require at least an empty stub — an
`EventMarket`/`Contract` type, a `/markets` or `/futures` route, or an event-contract
data artifact — with no implementation behind it. **None of those exist.** There is
no schema, no route, no data file, no provider entry, and no settlement path for
event contracts. Every layer of the stack (ingestion → schema → model → evidence →
resolution → price → settlement → route) is absent for the event-market domain. The
three adjacent primitives that do exist —
(a) the manual `news_signals.json` override,
(b) the player/team identity registries, and
(c) the box-score settlement framework —
were each built for the per-game prop simulator and are not event-market scaffolding.
They are reusable *patterns/infrastructure* at best, not partial event-market code.

---

## 4. What would need to be built (gap list)

Just the gaps (architecture is a separate deliverable):

1. **Event-contract schema** — `EventMarket` / `EventContract` / `Outcome` /
   `Resolution` types: a market with an open set of named outcomes, a resolution
   rule, a resolution source, and a resolution deadline.
2. **News / evidence ingestion** — real (not manual) fetching from RSS / press /
   beat-reporter / X feeds, normalized into dated evidence items.
3. **Evidence timeline + source-reliability tiers** — an `EvidenceItem` model with
   `publishedAt`, source, tier/weight, and per-contract aggregation over time.
4. **Multi-outcome probability model** — an N-way / categorical estimator (news-
   and prior-driven) instead of binary `N(proj, σ)` over/under sampling.
5. **Entity registry for event subjects** — extend identity beyond players/teams to
   coaches, executives, franchises, awards, and draft slots.
6. **Resolution-rule storage + engine** — machine-readable rules ("resolves YES if
   official announcement by DATE from SOURCE"), plus a manual/operator confirmation
   step.
7. **Event-contract price capture** — Kalshi/Polymarket (or internal) market
   snapshots + price history for calibration and market-vs-model comparison.
8. **Event-outcome settlement** — a settlement path keyed on news/official
   announcements rather than a `gamePk` box-score join.
9. **Public route(s)** — an events/markets/futures surface distinct from the
   schedule-only `/events` hub and the `/market-guide` glossary.
10. **Honesty/guardrail layer** — the repo's existing paper-only, "not-market-proven,"
    leakage-safe conventions would need event-market equivalents (calibration,
    settlement-blocked flags, no-fabrication rules).

---

## 5. Can the existing per-game prop simulator be reused for event contracts?

**No — it cannot.** The prop simulator and event contracts are structurally
different domains, not two views of one engine:

- **Different resolution source.** The prop sim resolves off **official box scores**
  (MLB StatsAPI linescore/gameLog joined by `gamePk`; soccer full-time results).
  Event contracts resolve off **news, rules, and official announcements** (a trade,
  a firing, an award vote, a playoff clinch) — there is no box score to join and no
  `gamePk` equivalent.
- **Binary vs. multi-outcome.** The sim models a **binary over/under** a line by
  sampling `N(projection, σ)`. Event contracts are **multi-outcome** (which team,
  which award winner, which draft slot) or long-horizon yes/no with no continuous
  per-game stat to simulate.
- **Box-score-driven vs. evidence-driven.** The sim's inputs are statistical
  (projection, sigma, last-5, role). Event pricing needs an **evidence timeline** of
  dated news items of varying source reliability — a model the repo does not have.
- **Time horizon & tracking.** The sim resolves **same-day at game end**. Event
  contracts resolve **days-to-months out** and need continuous price + evidence
  tracking between now and resolution.

The only reuse that was ever discussed is **superficial UI** — the old "Kalshi-style
read" note was about an outcome-first *card layout*, not the projection engine.
Everything below the presentation layer (ingestion, schema, model, evidence,
resolution, settlement) would be net-new.

---

*Sources are cited inline as repository-relative paths. No code or data was modified
during this audit.*
