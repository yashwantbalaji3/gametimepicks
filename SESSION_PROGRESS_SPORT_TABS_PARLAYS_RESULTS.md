# Session progress — Sport tabs, parlays, and unified Results audit

> Generated 2026-05-17. Untracked. Do not commit.

## Phase 0 — repo state verified

- Started from `main` at `36ddcaa` (PR #44 — sport-separated audits + mobile UX polish)
- Created branch `feature/sport-tabs-parlays-results`
- Working tree clean except expected untracked SESSION_*.md, .claude/, root logo
- Open PRs: only stale legacy #1, #2, #4, #5 (left alone)

## Phase 1 — audit findings

Existing route structure before this PR:
- NBA: `/board`, `/parlay-lab`, `/results` — sport-anonymous URLs
- MLB: `/mlb`, `/mlb/board`, `/mlb/power`, `/mlb/results` — sport-namespaced with `MlbSectionTabs`
- Global `/results` already had a small inert `SportAuditTabs` chip strip

Reusable components confirmed sport-agnostic:
- `SettledGameDetail` (PR #44) — used by both `/results` and `/mlb/results`
- `PerGameScorecard` — used by `/results`
- `ResultsBreakdown` — used by `/results`
- `EmptyResultsCard`, `NewsletterSignup`, `NeonStatPanel` — fully shared

Data loaders:
- `lib/settlement-data.ts` → NBA `getLifetimeSummary`, `getLatestSettlement`, `getAvailableSettlementDates`
- `lib/data-mlb-results.ts` → MLB `getMlbLifetimeSummary`, `getMlbComparisonReport`, `getMlbSettledLeans*`
- Both return null/zero-safe shapes so cross-sport aggregation is safe.

Constraint discovered: app uses `output: "export"`, so server-side `searchParams` is unavailable. Cross-sport navigation needs route segments, not query strings.

## Phase 2–7 — implementation

### New components

- `app/src/components/nba/nba-section-tabs.tsx` — mirrors `MlbSectionTabs`. Tabs: Overview / Model Board / Power Board / Parlays / Results. Active detection handles both `/nba/*` and the legacy URLs (`/board`, `/parlay-lab`).
- `app/src/components/results-sport-tabs.tsx` — cross-sport sub-tabs (Overview · NBA · MLB · Parlays) used on every Results experience.

### New routes

- `/nba` — NBA Overview hub. KPI tiles, audit chip, slate game tiles, methodology + responsible-use anchor.
- `/nba/board` — re-exports `/board` so logic isn't duplicated; URL is sport-namespaced.
- `/nba/power` — honest "warming up" placeholder mirroring `/mlb/power`.
- `/nba/parlays` — re-exports `/parlay-lab`.
- `/nba/results` — NBA-only audit (hero, KPI strip, per-game scorecard, anomaly guardrail, expandable settled-game cards, breakdown). Mounts `NbaSectionTabs` AND `ResultsSportTabs`.
- `/mlb/parlays` — placeholder for symmetry with NBA's five-tab structure.
- `/results/parlays` — placeholder under the cross-sport hub.

### Modified routes

- `/board` and `/parlay-lab` — `NbaSectionTabs` mounted at top so legacy URLs feel sport-aware. No content changes.
- `/results` — rewritten as Overview-only hub. Cross-sport overall hit rate computed honestly (NBA settled decisive + MLB settled decisive, pushes excluded, pending never counted). KPI strip + per-sport summary cards that link to `/nba/results` and `/mlb/results`. `ResultsSportTabs` strip at top.
- `/mlb/results` — `ResultsSportTabs` mounted below `MlbSectionTabs` for cross-sport nav.
- `/mlb` section tabs — Parlays tab added; "Board" relabeled "Model Board" to match NBA.

### Hit-rate calculation (cross-sport overall)

```
overallDecisive = nba.decisive + (mlb?.decisive ?? 0)
overallWins     = nba.wins     + (mlb?.wins ?? 0)
overallLosses   = nba.losses   + (mlb?.losses ?? 0)
overallPushes   = nba.pushes   + (mlb?.pushes ?? 0)
overallHitRate  = overallDecisive > 0 ? overallWins / overallDecisive : null
```

- Pending games never feed the denominator.
- Pushes excluded from the denominator.
- Insufficient-data rows never counted.
- HR markets stay on Power Board and do not feed this hit rate.
- Parlay candidate slips not folded in (snapshots not yet persisted).

### Verification

- `npm run typecheck` → PASS
- `npm run build` → PASS, all 21 routes static. New routes are small (137B for re-export wrappers, 178B for the parlay placeholder).

## Phase 8 — parlay snapshot persistence plan

Persistence work is **out of scope for this PR**. Placeholder UIs are shipped at `/nba/parlays`, `/mlb/parlays`, and `/results/parlays` so users understand what is pending.

### Required architecture (next PR)

Pipeline step that writes the day's candidate slips before first game starts:

```
pipeline/snapshot_parlays.py
```

Inputs: today's enriched board JSON (per sport) → runs the same candidate builder as the UI → writes one JSON file per sport per date:

```
app/public/data/parlays/nba/YYYY-MM-DD.json
app/public/data/parlays/mlb/YYYY-MM-DD.json
app/public/data/parlays/multisport/YYYY-MM-DD.json   # later, after both single-sports flow
```

### Schema

```ts
interface ParlayCandidateSnapshot {
  sport: "NBA" | "MLB" | "multi";
  date: string;            // YYYY-MM-DD ET
  generatedAt: string;     // ISO 8601 UTC, BEFORE first tipoff
  candidates: ParlayCandidate[];
}

interface ParlayCandidate {
  candidateId: string;     // e.g. nba-2026-05-17-conservative-1
  mode: "conservative" | "balanced" | "aggressive";
  legs: ParlayLeg[];
  combinedOddsAmerican: number | null;
  hasSameGameLegs: boolean;
  hasSameTeamLegs: boolean;
  hasAnomalyLegs: boolean;
  hasCrossSportLegs: boolean;  // multisport only
  rationale: string[];
}

interface ParlayLeg {
  sport: "NBA" | "MLB";
  date: string;
  gameId: string;
  gamePk?: number;
  playerId: number | null;
  playerName: string;
  team: string;
  opponent: string;
  market: string;          // "PTS" / "pitcher_strikeouts" / etc.
  side: "Over" | "Under";
  line: number;
  odds: number;
  bookmaker: string;
  projection: number | null;
  edgePct: number | null;
  confidence: string;
  riskFlags: string[];
}
```

### Grading step

After settlement:

```
pipeline/settle_parlays.py
```

- Reads each snapshot.
- For every leg, looks up the matching settled NBA/MLB row by (date, gameId/gamePk, playerId, market, line).
- If every leg won → slip = Win. If any leg lost → slip = Loss. Otherwise (pending or push) → not yet decisive.
- Writes `pipeline/validation/parlay_settled_<date>.json`.

### Export step

```
pipeline/export_parlay_results.py
```

Writes public files for the UI:

```
app/public/data/parlays/results/lifetime_summary.json
app/public/data/parlays/results/by_mode.json
app/public/data/parlays/results/by_sport.json
app/public/data/parlays/results/settled_slips.jsonl
```

### UI surfacing

Only after grading data exists:
- `/results` overall hit rate stays prop-only. Parlay hit rate gets its own card.
- `/results/parlays` replaces the placeholder with real candidate-slip audit (by sport · by mode · expandable slip cards showing every leg's actual stat).
- `/nba/parlays` and `/mlb/parlays` add a small "audit" badge linking to that sport's slip results.

### Why we did not build it now

- Requires pipeline work, not pure UI.
- Requires running on a real slate before games start (operator decision per credit policy).
- Multi-sport leg adapter needs ~50 LOC each in `lib/parlay-builder.ts` to flatten `PropLean` and `MlbBoardLean` into the unified `ParlayLeg` shape.
- Until then, every hit-rate claim in the UI would be invented after the fact.

## Acceptance summary

- NBA and MLB both have five-tab sport-section structures (Overview / Model Board / Power Board / Parlays / Results).
- All legacy URLs preserved: `/board`, `/parlay-lab`, `/results` still work and now show sport-aware tabs.
- `/results` is the single performance hub. Sub-tabs cross-link to per-sport audits.
- Overall hit rate is computed honestly from settled decisive rows only — no pending, no fabricated parlay numbers.
- Board pages stay projection-first (no hit-rate emphasis added).
- Parlay hit-rate claims remain pending until snapshots exist (placeholder copy spells it out).
- Mobile: tab strips use `flex-wrap` so they reflow at 390px (matches existing MlbSectionTabs pattern).

## Out of scope (next PRs)

- Parlay snapshot persistence (Phase 8 plan above).
- Multi-sport parlay builder (depends on persistence).
- NBA Power Board real signals (currently honest "warming up" shell).
- MLB May 17 paid odds run (operator-gated, credit floor blocks it).
