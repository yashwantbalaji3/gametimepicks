# Quality notes — 2026-05-30 slate (pregame)

> **Status: tracking, not consumed.** This note records the public-era
> record carried forward, the *pregame* composition of the 2026-05-30
> slate, and a shadow read of Low-Risk leg quality. It makes **no**
> promotion/demotion decision and changes **no** optimizer behaviour.
> Every figure below traces to a file on disk; nothing is invented.
>
> **No May-30 results are used here.** May-30 games are not final at the
> time of writing, so this note deliberately excludes any May-30
> outcome. It describes only what was *published pregame* plus the
> already-graded record through 2026-05-29.
>
> **➡ Settled (2026-05-31):** the post-settlement read — including a fixed
> NBA settlement gap (PR #202) — now lives in
> `docs/LEARNING_NOTES_2026-05-30_SETTLEMENT.md`. This pregame note is
> retained verbatim as the historical pregame snapshot.

Continues `docs/LEARNING_NOTES_2026-05-29_SETTLEMENT.md`. The public era
starts **2026-05-27** (`public-parlay-era.ts`); pre-era slates (05-25,
05-26) are excluded from every era figure here.

---

## 1. Public-era record carried forward (through 2026-05-29)

Source: `app/public/data/parlays/optimizer-summary.json` (`byDate`),
which is exactly what the `/results` hero renders.

| Date | Wins | Losses | Decisive | Pending | Hit rate |
|------|-----:|-------:|---------:|--------:|---------:|
| 2026-05-27 | 10 | 21 | 31 | 1 | 32.3% |
| 2026-05-28 | 24 | 87 | 111 | 3 | 21.6% |
| 2026-05-29 | 2 | 38 | 40 | 8 | 5.0% |
| **Era** | **36** | **146** | **182** | **12** | **19.8%** |

These are multi-leg parlays, so a low slip-level hit rate is structurally
expected — but **19.8% across 182 decisive slips is below break-even** for
the combined prices being published, and 05-29 (5.0%) was a notably weak
day. The era figure is *recorded*, not claimed as improvement.

The 8 pending on 05-29 are the documented no-show situation from the
prior note (5 unresolved legs across 3 players who did not appear). They
remain honestly **pending**, not force-graded.

---

## 2. Section + sport lanes (classified subset)

`byPublicSection` / `bySportBucket` lifetime totals only cover the dates
that carry section classification (05-28 and 05-29 — the 05-27 block is
`{}` on disk, a known backfill gap). They are a **subset** of the 182
era-decisive total, not the whole era.

**By public risk section (lifetime, classified):**

| Section | Wins | Losses | Decisive | Pending | Hit rate |
|---------|-----:|-------:|---------:|--------:|---------:|
| Low | 3 | 3 | 6 | 2 | 50.0% |
| Medium | 1 | 3 | 4 | 4 | 25.0% |
| High | 0 | 6 | 6 | 2 | 0.0% |
| Longshot | 0 | 7 | 7 | 1 | 0.0% |

**By sport bucket (lifetime, classified):**

| Bucket | Wins | Losses | Decisive | Pending | Hit rate |
|--------|-----:|-------:|---------:|--------:|---------:|
| NBA | 4 | 0 | 4 | 0 | 100.0% |
| MLB | 1 | 24 | 25 | 7 | 4.0% |
| Multi | 1 | 13 | 14 | 2 | 7.1% |

The shape is consistent with the prior note: **risk monotonicity holds at
the lane level** (low > medium > high ≥ longshot), and **NBA legs have
carried the record while MLB has been the drag** (1-24). But every cell
here is **tiny** — 4 to 7 decisive — so none of it clears a promotion
threshold. NBA 4-0 is encouraging directionally and nothing more.

---

## 3. May-30 slate composition (pregame, published)

Sources: `optimizer/2026-05-30.json`, `boards/2026-05-30.json`,
`mlb/boards/2026-05-30.json`, `snapshots/2026-05-30.json`.

- **NBA:** 1 game — `SAS @ OKC` (playoff), 95 player leans on the board.
- **MLB:** 15 games (DET@CWS, SD@WSH, KC@TEX, TOR@BAL, MIN@PIT, BOS@CLE,
  LAA@TB, MIA@NYM, MIL@HOU, CHC@STL, ATL@CIN, SF@COL, NYY@ATH, AZ@SEA,
  PHI@LAD), 674 player leans on the board.
- **Optimizer:** 120 total slips.
- **Public risk sections** (`publicRiskSections`, count per `all` lane):
  Low 4 · Medium 4 · High 4 · Longshot 4. The Low section is the only
  one with NBA representation (4 NBA); Medium/High/Longshot are MLB +
  multi only, because the single NBA game caps how many distinct NBA
  legs can be diversified into higher-variance lanes.
- **Bank Builder pool:** the `snapshots/2026-05-30.json` suggested pool
  carries 20 pending slips; Bank Builder's `selectPlus100BuilderSlip`
  (shipped PR #195) draws the +100-band pick from that pool only.

Note the structural mismatch the record above predicts: the slate is
**15:1 MLB-heavy**, and MLB is the weakest lane on record. The published
sections still lead with the low-variance lane, which is the honest
hedge given that composition.

---

## 4. Shadow report — Low-Risk leg quality (May-30, NOT consumed)

This is the Phase-6 shadow read requested by the runbook. It is a
**report only**: `app/src/lib/leg-quality-gates.ts` remains inert (no
non-test importer in `app/src`), and the proposed per-section leg-quality
ladder is **not shipped**. Nothing here feeds the optimizer.

Desired Low-Risk profile (target, for reference): 2–3 legs · combined
odds under +300 · individual leg odds around -150 (ideally -200) ·
recent-10 hit rate ≥75% where available · avoid plus-money legs unless
documented fallback.

The 4 Low-Risk slips published for May-30 (`publicRiskSections.low.all`).
`combinedAmerican` is `null` on these section slips, so the combined
below is **computed from the per-leg `oddsForSide` prices**, not read:

| # | Legs | Composition | Leg prices | Combined (computed) |
|---|-----:|-------------|------------|--------------------:|
| 0 | 2 | NBA: Kornet REB o2.5 · K.Johnson PTS o6.5 | +117 / -122 | **+295** |
| 1 | 3 | Multi: K.Williams REB o1.5 · J.Jones H+R+RBI u1.5 · Marte Hits o0.5 | -146 / -166 / -223 | **+291** |
| 2 | 2 | NBA: Harper AST o2.5 · SGA AST u7.5 | -108 / +100 | **+285** |
| 3 | 2 | NBA: Harper PTS o10.5 · K.Johnson PTS o6.5 | +103 / -122 | **+269** |

**Observations (honest, not actioned):**

1. **Combined odds:** all 4 land **just under +300** (+269 to +295), so
   they satisfy the "under +300" line — but they sit near the ceiling,
   not comfortably inside it. The Low lane is doing its job structurally.
2. **Plus-money legs are present.** Slips 0, 2, and 3 each carry a
   plus-money leg (+117, +100, +103). The desired profile prefers
   -150-ish legs and flags plus-money as a documented fallback. So the
   *current* Low lane would **not** pass a strict "no plus-money leg"
   gate — worth noting before any such gate is ever proposed for ship.
3. **`recent10` is absent from this data source.** The section slips do
   not carry a `recent10HitRate` field, so the "≥75% recent-10" criterion
   **cannot be evaluated** from `publicRiskSections`. Any future gate that
   relies on recent-10 must pull it from the leg-level board, not from the
   published section payload. This is a data-plumbing prerequisite, flagged
   not solved.
4. **Slip 1 is the cleanest by the price criterion** — three favourites
   (-146 / -166 / -223), no plus-money — but it is the multi lane that
   sits at 7.1% lifetime, and it leans on MLB legs (the 4.0% lane). Price
   quality and lane record point in opposite directions here, which is
   exactly why this stays a shadow read.

**Conclusion of the shadow read:** the Low lane is composed sensibly
(low combined, mostly favourites) but does not uniformly meet the
stricter desired leg profile (plus-money present; recent-10 unmeasurable
from this source). **No gate is enabled. No optimizer change is made.**

---

## 5. What this note does NOT do

- It does **not** grade or reference any May-30 outcome (games not final).
- It does **not** claim the model improved; 19.8% era is recorded as a
  problem, not a win.
- It does **not** enable `leg-quality-gates.ts` or any per-section ladder.
- It does **not** promote/demote any section, sport, or lane — every
  sample is far below a promotion gate (4–7 decisive per classified cell).
- It does **not** alter pregame May-30 suggestions; the slate is described
  exactly as published.

## 6. Follow-ups to watch (not committed here)

- Backfill a `byPublicSection` block for 05-27 so the section-lane totals
  cover the full era rather than the 05-28/05-29 subset.
- If a Low-Risk leg-quality gate is ever proposed for ship, plumb
  `recent10` to the section payload first (§4 obs. 3) and decide
  explicitly how plus-money legs are handled (§4 obs. 2) — both require
  operator approval before the optimizer consumes them.
- Keep watching whether NBA's small 4-0 lifetime edge survives more
  decisive slips before any per-sport weighting is claimed.
