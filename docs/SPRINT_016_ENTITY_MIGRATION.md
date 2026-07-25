# Sprint 016 — Entity System Migration Inventory

Status: **in progress.** Results surface migrated; the rest is mapped and queued below.
Baseline captured 2026-07-24. Regenerate any number here with:

```bash
npx tsx app/scripts/entity-census.mjs           # summary
npx tsx app/scripts/entity-census.mjs --files    # every call site
```

The census reads source text only — it renders nothing and imports no application code, so it cannot be
fooled by a component that merely re-exports another. Progress is **measured**, not asserted.

---

## 1. The finding that shapes this migration

The canonical entity components are thin wrappers over existing primitives:

| Canonical export | Wraps |
|---|---|
| `TeamLogo` | `ui/team-mark` |
| `GameHeader` | `ui/matchup-identity` |
| `PlayerPortrait` / `PlayerCard` | `components/player-avatar` |

**So a large share of the "203 rival call sites" already render identically to canonical.** They call the
same primitive one layer lower. Migrating those is about routing every surface through one layer so future
changes propagate — it is *not* fixing visible inconsistency. Reporting it as "203 broken things" would
overstate the problem.

The genuinely divergent implementations are: `ui/player-avatar` (a second, different avatar), 
`mlb/mlb-player-avatar`, bare `<img>` headshots, inline initials discs, `team-badge` monograms, and
`flag-badge` (legitimate for World Cup — a flag *is* the correct mark for a country).

### The `TeamLogo` trap

Two components share the name and they are **not interchangeable**:

| | `components/team-logo` (legacy) | `ui/team-mark` (canonical base) |
|---|---|---|
| Input | `team` + `sport` | `logoUrl` from an artifact |
| Logo source | derives the ESPN CDN path | uses the provider URL the data carries |
| 404 handling | `onError` → monogram | **none** — a bad URL shows a broken image |
| Rendering | client component (needs `useState`) | server-renderable |
| Sizes (px) | sm 24 · md 36 · lg 56 · xl 80 | sm 18 · md 24 · lg 32 · xl 44 |

Swapping the 37 legacy call sites to the canonical component directly would **regress**: it would drop the
404 fallback and lose the CDN derivation. Conversely, making the canonical one a client component to gain
`onError` would turn every artifact-URL logo (homepage, `/today`) into a hydrated client component.

**Resolution: `TeamLogo` in `components/entity` is now a facade.** It takes either `logoUrl` (→ `team-mark`)
or `team` + `sport` (→ the legacy client component, keeping `onError`). Call sites get one import; each keeps
the behaviour its data supports. Collapsing the two implementations further is a *behaviour change*, not a
cleanup, and is deliberately out of scope. The same trap exists for `PlayerAvatar` (two different files
export that name) and for `PlayerCard` (three files define their own local one).

---

## 2. Baseline census (pre-migration)

| Mechanism | Kind | Sites | Files |
|---|---|---|---|
| ✓ canonical `PlayerCard` | player | 3 | 3 |
| ✓ canonical `TeamLogo` | team | 2 | 1 |
| ✓ canonical `GameHeader` | team | 1 | 1 |
| ✓ canonical `PlayerPortrait` | player | 1 | 1 |
| `FlagBadge` | team | 75 | 37 |
| `TeamLogo` (legacy) | team | 37 | 21 |
| `PlayerAvatar` | player | 25 | 20 |
| `PlayerAvatar` (ui — different impl) | player | 15 | 14 |
| `TeamMark` (direct) | team | 11 | 4 |
| `MatchupIdentity` (direct) | team | 7 | 6 |
| `TeamBadge` | team | 6 | 2 |
| `CricketTeamBadge` | team | 5 | 3 |
| `MlbPlayerAvatar` | player | 4 | 3 |
| local `PlayerCard` (3 rival definitions) | player | 3 | 3 |

**canonical 7 · non-canonical 189.** An independent read-only audit of the same code arrived at 203 by also
counting ad-hoc `<img>`/initials markup that this census's conservative heuristic misses (it requires a
headshot/logo/crest word on the same line). Treat **~189–203** as the true range; the census is the number
to track because it is reproducible.

`EntityHeader` has **zero** call sites — a dead export.

---

## 3. Migration order (prompt priority) and status

| # | Surface | Route | Sites | Status |
|---|---|---|---|---|
| 1–2 | Results / Track Record | `/results` (+ `/mlb`, `/nba`, `/date/*`, `/parlays`) | 9 | ✅ **done** |
| 3 | Strategy Lab | `/bank-builder` | 9 | queued |
| 4 | Game Reports | `/games/[sport]/[gameId]` | ~26 | queued |
| 5 | `/mlb`, `/board`, `/picks`, `/projections`, `/build`, `/mr-dub` | — | ~60 | queued |
| — | World Cup `FlagBadge` (75) | — | 75 | **review, don't migrate blindly** — a flag is the correct mark for a country; only migrate where a club/team logo is actually meant |

Per `components/command-rail.tsx`, **Track Record = `/results`** and **Strategy Lab = `/bank-builder`** —
so priorities 1 and 2 are the same surface and were completed together.

### Completed: Results (9 sites, 4 files)

| File | Was | Now |
|---|---|---|
| `parlay-ticket-card.tsx` | `PlayerAvatar` + legacy `TeamLogo` | `PlayerPortrait` + canonical `TeamLogo` |
| `player-recent-form-drawer.tsx` | `PlayerAvatar` + 2× legacy `TeamLogo` | canonical |
| `settled-player-accordion.tsx` | `PlayerAvatar` + legacy `TeamLogo` | canonical |
| `player-results-cards.tsx` | `PlayerAvatar` + `TeamBadge` monogram | `PlayerPortrait` + canonical `TeamLogo` (real logo, monogram fallback retained) |

Post-migration census: **canonical 16 · non-canonical 180** (+9 / −9, exactly the sites targeted).
Verified in the browser against the built export: `/results/`, `/results/mlb/`, `/results/nba/` all 200,
with real headshots and team logos rendering.

---

## 4. Orphan removal — DONE (8 files), and how it nearly went wrong

`scripts/unreachable-components.mjs` computes **reachability** from the 67 real Next.js entry points
(page/layout/template/error/route/middleware) and transitively follows every import. A per-file grep is not
enough: an orphan can be imported by another orphan, keeping a whole dead subtree "alive".

A file is only reported deletable when it is unreachable **and** unmentioned anywhere in `src/` or
`scripts/` — including tests.

> **The instrument was wrong first.** Its mention-check originally required a path separator before the
> basename, so guard tests that enumerate files by bare name were invisible to it:
> `moonshot-tracker.test.mjs` asserts shared ticket primitives exist via `["odds-pill", …, "team-identity"]`,
> and `no-run-labels.test.mjs` lists `"dual-bank-builder-teaser.tsx"`. Both files were reported "safe to
> delete", both were deleted, and **the test suite caught it** (3 failures). Both were restored and the
> detector fixed to match a basename with or without extension, with or without a leading path. The safe-set
> then fell from **58 → 37**, i.e. 21 files it would previously have green-lit are in fact referenced.
>
> Lesson carried forward: `tsc` passing proves nothing about files referenced by *string* rather than import.
> Always run the full suite before trusting a deletion.

**Deleted (8, all identity-bearing, −19 non-canonical sites):** `anatomy-callout.tsx`,
`bank-builder/official-step3-candidate.tsx`, `cricket-board-section.tsx`, `curated-projections-card.tsx`,
`nba-finals-cards-section.tsx`, `parlay-builder-client.tsx`, `parlay-lab-experience.tsx`, `trends-client.tsx`
(the last also removed a third rival local `PlayerCard` definition).

**Kept — protected by a guard test, do not delete:** `tickets/team-identity.tsx` (shared-ticket-primitive
invariant), `bank-builder/dual-bank-builder-teaser.tsx` (Bank Builder copy scan).

**Still dead, still carrying identity sites (next batch):** `cricket-context-cards.tsx`,
`cricket-player-projections.tsx`, `player-recent-form-panel.tsx` — 6 sites.

**Out of scope, reported only:** 29 further unreachable files carry no identity markup. They are real dead
code but deleting them belongs in a cleanup change, not an entity-migration diff. Run
`npx tsx app/scripts/unreachable-components.mjs` for the current list.

---

## 5. Players rendered without team/opponent context

The sprint asks that every player mention carry team + opponent. Canonical `PlayerCard` already emits
`{team} vs {opponent}`; these do not:

**No team and no opponent:** `world-cup/model-player-props-matrix.tsx`, `world-cup/wc-player-props.tsx`,
`ui/suggested-card.tsx` (its sublabel is sometimes just the sport — see `lib/build-legs.ts`),
`build-experience.tsx`, `awaiting-settlement-table.tsx` (orphan).

**Team but no opponent:** `game/game-detail-page.tsx` (×2), `ui/player-prop-card.tsx`,
`ui/player-prop-group.tsx`, `ui/projection-card.tsx` (names neither), `world-cup/curated-picks.tsx`,
`bank-builder/vertical-ladder-climb.tsx`, `player-recent-form-panel.tsx`, `mlb/mlb-top-leans-strip.tsx`.

UFC fighters have no team by nature — initials are correct there; only the missing *opponent* is a real gap.

---

## 6. Constraints carried into every remaining batch

- Presentation only. No prediction, simulation, or settlement logic moves into a component.
- Money md5 must stay `affe6b21071f2b3be96bb2774eb347c3`.
- `bank-builder/vertical-ladder-climb.tsx` determines the CURRENT rung via `rung.step === lane.step`.
  Touch its identity markup only — a lane-logic change breaks 15–40 tests.
- Never weaken a guard to make a migration pass. If a guard encodes the *old* mechanism, rewrite it to state
  the true invariant.
