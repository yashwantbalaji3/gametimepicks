# Audit — Wire Parlay Engine into UI (mobile-first)

_Branch `ui-wire-parlay-engine-mobile-v1` off main `e4375dd`. Follows PR #508 (backend engine, dry-run)._

## Objective
Turn the PR #508 backend engine into a visible product: surface suggested parlays (by sport + risk),
game-specific parlays, the eligible-leg pool, and a **Dual Bank Builder preview** — mobile-first.
**No auto-launch. No protected `public/data/bank-builder/*` writes. No fabricated NBA/UFC/WC data,
photos, logos, hit-rates, or props.** Bank Builder stays operator-gated (preview only).

## How the engine reaches the UI (decision)
The codebase already loads `public/data/*.json` at **build time** in server components (e.g.
`loadBankBuilderV2`). So the engine is wired via a **build-time, server-only loader**
(`app/src/lib/parlays/ui-loader.ts`) that reads the committed board JSON, runs the pure engine
(`adapter` → `eligible-leg` → `daily-parlays`/`same-game`/`dual-bank-builder`), and returns
serializable display data. No committed dated artifact; no protected-data write. The loader is wrapped
so a bad/missing board yields an empty/evaluating state, never a build failure or fabricated card.

## Scope this PR
- `ui-loader.ts` (+ display types) — engine → display data, memoized, graceful empty states, identity
  enrichment (playerId/teamAbbr/country code) joined from the raw board, never from invented URLs.
- New greenfield **`/parlays`** route — suggested parlays by sport + risk, game-specific groups,
  eligible-leg marketplace, no-qualified states, Bank Builder preview link. Mobile-first.
- Additive **engine card on `/today`** linking to `/parlays`.
- Additive **operator-gated Bank Builder preview panel** on `/bank-builder` (not active; Run #1/#2/#3
  history untouched).
- One-line methodology note + link.

## Deferred (next PR — high regression risk on complex existing pages)
Deep filter rewrites of the existing `/build` marketplace and `/parlay-lab`, and per-sport
`/sports/[sport]` wiring. The new `/parlays` page covers the core showcase without touching those.

## Base state (recorded)
- Main SHA `e4375dd`; PR #508 merged (engine dry-run).
- Engine present: `app/src/lib/parlays/*` (13 files), `app/src/lib/methodology/{adapter,sources}.ts`.
- Commands: `scripts/methodology-dryrun.mjs`, `scripts/project-and-launch-today.mjs` (dry-run default).
- Today's dry-run: MLB 541 eligible legs; NBA/UFC/WC no qualified candidates; dual BB QUALIFIES on
  MLB (Lane A survival 86 / Lane B 80) — not launched.
- Protected (read-only): `public/data/bank-builder/*`, `public/data/parlays/*`, boards, settled/results.
- Operator-gated launch: only via `project-and-launch-today.mjs --launch --write-bank-builder` after
  explicit approval — NOT performed here.
