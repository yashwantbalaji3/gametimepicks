# Program 176 — NFL simulation + MLB parity implementation

**Window** 2026-08-13 20:38 → 2026-08-14 01:15 ET (00:42 → 05:15 UTC) · **Start anchor**
`67bb34d89` (7 behind, fast-forwarded) · **Final HEAD** `7910e0d0c` · **Credits** 15/3,000
(unchanged) · **Protected money** byte-identical · **Gate** 4,297 / 0 · **a11y** 153 / 0

## Corrected classification

Program 176 asked for all 12 open parity rows plus Releases 1–6. **I closed one parity row, added
one assurance route, and fixed five of my own broken guards.** That is honest progress, not
closure. The ledger still derives **11 OPEN rows**.

## What shipped

**The largest parity row is closed.** `/nfl` was a 900px document; it now uses the *same*
`vault-page-shell` class, padding scale and overflow guard as `/mlb` — the existing owner, not a
fork. Ledger re-derived: 3 shipped · 3 adopted-shared · 2 adapter-needed · 2 not-applicable ·
11 open · 0 unexplained.

**`/nfl` joined the three-engine accessibility matrix**, where it had been absent while `/mlb` was
covered. Full sweep at 390/768/1440 plus 320px reflow: 153 passed.

## Proven in reality, not simulation

At 00:42Z — 1.7h past the 23:00Z kickoffs — the shipped P174 machinery was observed under genuine
post-kickoff conditions for the first time:

- **Lock:** 5 events moved UPCOMING → STARTED, left the pregame selectors, and kept their receipt,
  input hash, projected score and win probability exactly as published.
- **Refusal:** the generator wrote only for still-pre-start events; the 5 started games got nothing.
- **Settlement:** transitioned PRE_KICKOFF → AWAITING_OFFICIAL_RESULT on its own.

**Settlement remains REALITY_GATED**: ESPN still reports `STATUS_SCHEDULED` for every game ~2h past
kickoff, so no official final exists. Nothing was reconstructed.

## Defects — both mine

1. **Double `<main>` landmark.** My first shell adoption used `<main>`, but the app layout already
   provides one — which is why `/mlb` wraps in a `div`. Caught by inspecting the DOM; fixed and
   noted inline. The a11y route I added is the instrument that would have caught it automatically.
2. **Date-pinned guard rot — five of them.** UTC rolled to Aug 14 mid-session and my guards broke
   because they pinned `2026-08-13` or assumed a 9-event window. All now derive the date from the
   artifact under test and assert *relationships* rather than magnitudes (receipts == published
   forecasts, not "at least six"). My own memory warned about this exact rot.

## Still open — engineering-owned

11 ledger rows: the overview hero, freshness badge, quick-action rail, section headers, shared
EventCard, per-game deep route, simulation report surface, Build inventory, player portrait,
Bank Builder/Moonshot NFL adapters, and the NFL console event table. Plus Releases 2 (player
families), 4 (products), 5 (console) and 6 (learning loop).

## Next five

1. Settle when finals land (armed; fires ~14:30Z).
2. Per-game deep route via `multi-sport-report-shell` + an NFL adapter — the cheapest remaining row.
3. Overview hero + freshness badge + quick-action rail (all already sport-agnostic).
4. `NFL_MARKET_CONFIG` + thread `sport` through the 4 Market Center call sites.
5. NFL event control table on the protected console.
