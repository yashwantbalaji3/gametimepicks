# EPL Results Provider — Founder Decision Package

**Program:** 080–083 · The 2026-27 EPL season starts in ~2 weeks. The odds side, identity, 1X2 de-vig, lifecycle states and a lineage-gated settlement adapter are built and tested; **every final score is blocked on this one decision.** Nothing below selects for you.

## The decision

Choose the official per-match results source EPL settlement may grade from. Requirements the adapter enforces regardless of vendor: machine-readable per-fixture finals · regulation-time score distinguishable from AET/pens · postponement/abandonment states · stable fixture identifiers joinable to our competition-scoped `eventId` (never name-only) · terms permitting this use.

## Options (facts only)

1. **API-Football** (already a repo secret for the dormant WC lineup path) — paid tiers; per-fixture finals + statuses; existing integration experience in this repo. Cost depends on plan; the existing key's tier/quota needs your confirmation before reuse.
2. **Football-Data.org** — free tier with EPL results at limited request rates; simpler data; terms must be reviewed for this use.
3. **An official/league-licensed feed** — highest authority, procurement overhead.

## What each choice unblocks, immediately

Vendor signed → provider interface implementation behind the existing adapter (≈1 session) → settlement dry-runs on early-season fixtures → G1 gate evidence → preview promotion decision on a month of clean captures. Until then EPL remains odds-side `RESULTS_SOURCE_PENDING`, honestly.

## What stays blocked regardless

No EPL model, no picks, no money products — the research-terminal policy and promotion gates govern; this decision only enables *settlement of factual results*.
