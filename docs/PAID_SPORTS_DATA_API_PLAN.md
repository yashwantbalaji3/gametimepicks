# Paid Sports Data API — Readiness Plan (Phase 2.6)

**Status:** PLANNING / SCAFFOLDING ONLY. No live paid calls, no purchase, no build
dependency. This document plus `app/src/lib/data-providers/*` are the *readiness*
layer: they let a future phase drop in a paid provider **without a rewrite**, while
guaranteeing the app keeps building and telling the truth when no key is present.

Created for the overnight roadmap. Companion scaffold:
- `app/src/lib/data-providers/types.ts` — provider interface + availability types.
- `app/src/lib/data-providers/registry.ts` — provider registry (env-NAME presence only).
- `app/src/lib/data-providers/data-providers.test.mjs` — rule-pinning tests.
- `.env.example` — placeholder NAMES (empty values).

Related prior docs (kept, not superseded): `DATA_PROVIDERS_ROADMAP.md`,
`DATA_PROVIDER_RESEARCH.md`, `DATA_SOURCE_ROADMAP.md`, `GAME_LAB_DATA_AUDIT.md` (§4/§6
define the "not yet simulated" honesty gate this plan inherits).

---

## 0. Hard rules (non-negotiable)

These are enforced by the scaffold + tests and MUST hold in any future integration:

1. **No purchase / no subscribe.** This phase evaluates *categories* only. Nothing here
   recommends buying a specific paid product.
2. **No hardcoded / committed secrets.** Keys live in `.env` (git-ignored) only. `.env.example`
   carries placeholder **NAMES** with empty values. The registry checks a key's *presence*, never
   its *value*.
3. **No build dependency on a paid API.** `next build`, `tsc`, and the test suite must pass with
   every provider env var unset. A missing key degrades a module to `available: false`, never an error.
4. **Do NOT replace the existing official settlement pipeline.** MLB Stats API / ESPN / nba_api
   settlement stays the source of truth for grading. A paid box-score feed, if ever added, is a
   *cross-check*, never the grader of record.
5. **Do NOT use paid data to change model weights.** Bank Builder / Moonshot / props model weights
   are set from *settled* results only. Paid feeds may enrich *display*; they must not tune the model.
6. **Do NOT fabricate fields when data is unavailable.** When a provider is absent, the module is
   marked unavailable (with a reason) and the UI shows the honest "not yet simulated / unavailable"
   placeholder — never a made-up number. (Same rule as `GAME_LAB_DATA_AUDIT.md` §9.)
7. **Read-only + optional.** Providers are read-only and optional. No provider writes to
   `app/public/data/` money artifacts (`portfolio.json`, daily-portfolio, ladders, ledgers).

---

## 1. Current data gaps for the deterministic game-simulation feature

The repo does **not** persist a per-game Monte-Carlo/simulation artifact today
(`GAME_LAB_DATA_AUDIT.md` §4). Game Lab currently ships as an honest *model report* over the
existing board/projection artifacts, with every distribution module rendered as a labelled
"coming later — not yet simulated" placeholder. To make the deterministic simulation feature
real, these are the data gaps, mapped to the modules they block:

| Simulation/report module | Today | Gap (what data is missing) |
|---|---|---|
| Official settlement grade | ✅ have (free pipeline) | reliability/coverage edge cases (extra-innings, AET/PEN policy) — a paid cross-check would reduce mis-grades |
| Score / margin / total **distribution** | ❌ absent | needs a persisted per-game MC; MC inputs improve with team/player rate data |
| Player-prop **distribution / volatility** | ❌ absent | needs per-player box stats + saved per-player MC |
| Player-prop lines coverage | 🟡 partial (Odds API free tier) | props are limited/credit-capped; broader/cheaper coverage needed |
| **Consensus** across books | ❌ absent | today one `oddsProvider` per fixture — no multi-book collection |
| Injuries / confirmed lineups | 🔴 not per-fixture | MLB lineups reachable free; a unified injuries/lineups feed is absent |
| Soccer xG / shots / corners / cards / first-scorer | ❌ absent | WC is odds-only; no event/advanced-stat layer |
| Historical calibration set | 🟡 partial | settled history is small; bulk historical data would sharpen calibration |

**The honesty gate (inherited):** until a real per-game MC artifact is persisted and consumed,
Game Lab must not claim "N simulations / X% of sims / distribution." A missing provider must make
the relevant module `available: false`, not fabricate it.

---

## 2. Provider *need* ranking (HIGH → LOW by impact)

Ranked by how much each unblocks reliable products + the simulation feature. This ranks **needs**,
not vendors. The scaffold encodes the same order (`CAPABILITY_IMPACT` in `types.ts`).

| # | Need (capability) | Why it ranks here | Blocks / unblocks |
|---|---|---|---|
| **1** | **Official settlement / box-score reliability** | Grading correctness is the product's credibility. A wrong grade is worse than a missing pick. | Trust Center receipts; correct ladder settlement (cross-check only — never replaces the free pipeline). |
| **2** | **Player props + player box stats** | Props are the second product surface; box stats power per-player volatility modules. | Player-prop distribution/volatility; prop coverage beyond the free credit cap. |
| **3** | **Odds consensus / multi-book pricing** | A consensus price de-vigs better than a single book and reveals line movement. | "Consensus vs our model" module; line-movement UI. |
| **4** | **Injuries + confirmed lineups** | Kills dead legs (benched players) — biggest silent source of losing slips. | Lineup/injury-impact gate on props; fewer dead slips. |
| **5** | **Soccer xG / shots / corners / cards / first-scorer** | Turns WC from odds-only into a real match model; unlocks soccer-specific modules. | xG/shots, corners/cards, first-scorer grids for WC. |
| **6** | **Historical data for calibration** | Improves calibration/backtests; offline, not time-critical. | Bigger calibration set for the (settlement-driven) model. Offline use only. |

---

## 3. Candidate provider **categories** (neutral — not a purchase recommendation)

Generic categories only. Each is **optional** and gated behind an env-var **NAME**. Do **not**
read this as advice to buy any specific product; specific vendors already surveyed live in
`DATA_PROVIDER_RESEARCH.md` / `DATA_PROVIDERS_ROADMAP.md` and remain deferred.

| Category (generic) | Serves need # | Placeholder env NAME | Notes |
|---|---|---|---|
| Official box-score API | 1 | `SPORTS_DATA_PROVIDER_KEY` | Authoritative finals/box scores. Cross-check only. |
| Player-props & player box-stats API | 2 | `PLAYER_PROPS_PROVIDER_KEY` | Prop lines + per-player box stats. |
| Odds aggregator / consensus API | 3 | `ODDS_CONSENSUS_KEY` | Multi-book consensus + line history. |
| Injuries & confirmed-lineups feed | 4 | `INJURIES_LINEUPS_KEY` | Injury designations + confirmed starters. |
| Soccer advanced-stats API | 5 | `SOCCER_STATS_PROVIDER_KEY` | xG/shots/corners/cards/first-scorer. |
| Historical dataset provider | 6 | `HISTORICAL_DATA_PROVIDER_KEY` | Bulk historical results/odds for calibration. |

**Free baselines stay first-class.** Several needs are already served free today (MLB Stats API,
ESPN, nba_api, The Odds API free tier). A paid category is a *layer*, only if/when it's clearly
worth it — never a replacement for a working free source.

---

## 4. Required env-var NAMES (placeholders only — NEVER real keys)

Declared in `.env.example` with **empty** values. The registry inspects *presence* only.

```
SPORTS_DATA_PROVIDER_KEY=        # 1) official settlement / box scores (cross-check)
PLAYER_PROPS_PROVIDER_KEY=       # 2) player props + player box stats
ODDS_CONSENSUS_KEY=              # 3) odds consensus / multi-book pricing
INJURIES_LINEUPS_KEY=            # 4) injuries + confirmed lineups
SOCCER_STATS_PROVIDER_KEY=       # 5) soccer xG / shots / corners / cards / first-scorer
HISTORICAL_DATA_PROVIDER_KEY=    # 6) historical data for calibration
```

Rules: never commit a value; `.env` is git-ignored; the app builds/tests green with all of these
unset; presence flips a provider to "configured" but still performs **no** live call in this phase.

---

## 5. Provider interface / adapter design (read-only, optional, graceful)

Framework-free TypeScript in `app/src/lib/data-providers/`. Metadata-only in this phase — no I/O.

**`types.ts`**
- `ProviderCapability` — the six ranked capability areas; `CAPABILITY_IMPACT` pins HIGH→LOW order.
- `SportsDataProvider` — `{ id; describe(); isConfigured(); moduleFor(name) }`.
  - `isConfigured()` returns TRUE only when the provider's env-var **NAME** is present (non-empty).
    The value is never read/logged/returned. Never throws.
  - `moduleFor(name)` returns a `ProviderModule` `{ module; available; reason? }` — an availability
    record, never a network result.
- `ProviderModule` — the availability type simulation/report code consumes to decide render-vs-placeholder.
- `unavailableModule()` / `availableModule()` / `unavailableResult()` / `byImpact()` — tiny pure helpers.

**`registry.ts`**
- A static, non-secret `PROVIDER_CATALOG` of the six categories.
- `listProviders()` / `describeProviders()` / `knownEnvKeyNames()` — introspection (NAMES only).
- `getProvider(id)` — returns an `AvailableResult` (with `available` = env-name presence) for a known
  id, else a graceful `UnavailableResult`. **Never throws.**
- `missingProvider(id)` — always returns an `UnavailableResult` (unknown OR unconfigured OR
  "configured but nothing requested"). The explicit graceful path.
- `resolveModule(name)` — first configured provider that covers the module, else an unavailable
  record whose reason says "do not fabricate."

**Future adapter shape (Phase 3+, NOT in this phase).** When a real integration lands, an adapter
implements `SportsDataProvider` and adds *read-only* fetch methods behind `isConfigured()`:

```
// pseudocode — DO NOT implement in Phase 2.6
class OfficialBoxScoreAdapter implements SportsDataProvider {
  isConfigured() { return envNamePresent("SPORTS_DATA_PROVIDER_KEY"); }
  async fetchBoxScore(gameId) {
    if (!this.isConfigured()) return unavailableResult(this.id, "not configured"); // graceful, no throw
    // ... read-only HTTP GET; cache; NEVER write money artifacts; NEVER grade of record ...
  }
}
```

Adapter constraints carried forward: read-only; cached; optional; degrades to `unavailable`; never
writes `app/public/data/` money files; never becomes the settlement grader of record; never tunes
model weights.

---

## 6. What this phase deliberately does NOT do

- No network call of any kind (not even a "free" probe). Presence-of-NAME only.
- No new runtime dependency; no package added; no paid SDK.
- No change to `app/public/data/` — money artifacts (`portfolio.json` md5
  `affe6b21071f2b3be96bb2774eb347c3`, daily-portfolio, ladders, ledgers) are untouched.
- No change to settlement, card approval, or model weights.
- No fabricated simulation/distribution/xG/consensus values — unavailable modules stay unavailable.

---

## 7. Rollout sketch (future phases — for context only, not part of Phase 2.6)

1. **2.6 (this):** scaffold + doc + tests + placeholder env NAMES. Done when gates green.
2. **Phase 3a:** implement ONE read-only adapter (highest impact = official box-score cross-check)
   behind `isConfigured()`; compare against the free pipeline; log disagreements; still not grader
   of record. Requires explicit env NAME + allowlist + PR review.
3. **Phase 3b+:** add further adapters (props/box stats → consensus → injuries/lineups → soccer
   advanced → historical) only as each proves worth the cost, each fully optional + graceful.
4. **Simulation:** once inputs are richer, persist a real per-game MC artifact
   (`public/data/{sport}/game-simulations/YYYY-MM-DD.json`, additive) — then, and only then, may
   Game Lab present distribution modules as real.

---

## 8. Verification gates for this phase

Run from `app/`:

- `npx tsc --noEmit` — clean.
- `npx tsx --test $(find src -name '*.test.mjs')` — `# fail 0`.
- `md5 -q public/data/mr-dub/portfolio.json` == `affe6b21071f2b3be96bb2774eb347c3`.

The `data-providers.test.mjs` suite additionally pins: registry works with all env unset;
unconfigured/unknown providers fail gracefully; no secret VALUES in the new files or `.env.example`
(only placeholder NAMES); simulation code can mark modules unavailable; money md5 unchanged.
