# UFC Expansion Foundation (latest)

> Status: UFC is already registered as a **schedule-only** surface (no odds, no
> projections, no parlays, no picks). This documents the foundation + what a
> real, gated expansion requires. No code change here; the existing capability
> gates already fail-closed for UFC.

## Current state (verified in code)
- `app/src/lib/sports-coverage.ts`: `ufc` registered, level **schedule-only**,
  blurb "Upcoming fight cards — schedule only, no odds or projections."
- `app/src/lib/sport-capabilities.ts`: fail-closed → UFC has NO projection /
  parlay / pick capabilities (unknown/unregistered → no capabilities).
- Tests assert UFC is schedule-only with no betting fields
  (`event-schedules.test.mjs`, `sport-capabilities.test.mjs`,
  `build-a-parlay-config.test.mjs` blocks UFC from Build-a-Parlay).
- UFC appears only in Events/Sports coverage (named fight cards), never as picks.

## Why UFC is attractive later (honest, not a launch claim)
Cards + lines post early; style/profile factors (reach, stance, cardio, finish
rate, takedown defense) are persistent and can be predictive. But none of that is
wired yet — see the data-source audit.

## Target prediction markets (eventual MVP, gated)
fight winner (moneyline) → method of victory (KO/TKO / submission / decision) →
over/under rounds → fight goes the distance → (fighter props only if data exists).

## Feature groups (for the eventual leakage-safe builder)
identity / weight class / stance / reach / height / age · days-since-last-fight /
short-notice / weight-cut risk · opponent quality / strength of schedule ·
striking volume-accuracy-defense, SLpM / SApM, knockdown rate · takedown avg /
accuracy / defense, submission avg, control time, get-up · cardio (round-3),
finish vs decision rate, KO/sub W-L, durability/chin · style matchup
(striker/grappler, pressure/counter, orthodox/southpaw), reach edge, age curve ·
market: moneyline / method lines / round totals / line movement / closing-line value.

## Launch gates (ALL required before any public UFC pick)
two-sided (de-vig) odds · fighter-stat provider · historical fight results ·
a grading contract · a leakage-safe feature builder (rolling windows strictly
before the card) · a backtest with sample-size controls. Until then: schedule-
only / "coming soon" — never public picks.
