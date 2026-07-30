# `soccer/epl/results/`

**Empty, and empty for a stated reason.**

No official EPL results source has been approved. API-Football — the source the World Cup era used —
is paid, and adding or extending a paid credential is a founder decision rather than an engineering
default. No free candidate has been verified for official status, per-event machine-readability, and
terms of use, so none is named here as viable.

The decision, its options, and what each one unblocks are written up in
`docs/EPL_RESULTS_SOURCE_DECISION.md`. This directory stays empty until that decision is recorded.

## What will be written here once a source exists

One row per fixture:

- `eventId` — ours. Results join on the canonical identity, not on a provider fixture id and never on
  a club-name pair.
- `homeGoals` / `awayGoals` — **90-minute regulation** score. League play has no extra time; the field
  is named for regulation anyway so a future cup adapter cannot reuse it for an extra-time aggregate.
  That substitution is the exact defect in the frozen `pipeline/world_cup/settle.py`.
- `lifecycle` — the fixture's terminal state. `POSTPONED` and `ABANDONED` are results too: every
  market on the fixture voids, and nothing rolls over to a replacement, which carries its own
  `eventId`.
- `source`, `settledAt` — the official source consulted and when it was read.

## Until then

`app/src/lib/soccer/epl-settlement-adapter.ts` returns `RESULTS_SOURCE_PENDING` for every fixture and
grades nothing. `EPL_APPROVED_RESULTS_SOURCES` is empty, and a test asserts it stays empty, so the
blocked state cannot be lifted by accident.
