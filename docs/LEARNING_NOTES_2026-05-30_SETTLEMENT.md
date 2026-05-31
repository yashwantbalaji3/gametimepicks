# Learning notes — 2026-05-30 settlement

> **Status: tracking, not consumed.** Post-settlement read of the
> 2026-05-30 slate. It records the official graded record, a settlement
> *bug* found and fixed, and a 3-slate calibration read. It makes **no**
> promotion/demotion decision and changes **no** optimizer behaviour.
> Every figure traces to a file on disk; nothing is invented.

Continues `docs/QUALITY_NOTES_2026-05-30_SLATE.md` (the pregame note) and
`docs/LEARNING_NOTES_2026-05-29_SETTLEMENT.md`. Public era starts
**2026-05-27**; pre-era slates (05-25/05-26) are excluded from every era
figure here.

---

## 1. Settlement gap found + fixed (PR #202)

The scheduled `nightly-settle` (09:39 UTC) settled MLB correctly but left
**all 270 NBA leans (SAS @ OKC) `stats_unavailable`**. Root cause: the
NBA board keys that game by its NBA.com 10-digit id (`0042500317`);
`nba_api` was unavailable on the runner (NBA.com blocks CI IPs), and the
existing ESPN fallback only fires for ESPN's own 9-digit event ids — so a
**final game with official stats sat ungraded**, cascading into 28 pending
optimizer slips (9 public).

Fix (future-facing, tested): `resolve_espn_event_id_for_teams()` bridges
an NBA.com game → its ESPN event id via the public scoreboard (date + team
abbreviations, tolerant `SA`/`SAS`-style matcher). ESPN endpoints are not
IP-blocked, so **future NBA slates settle even when `nba_api` is down**.
Re-ran the official pipeline for 05-30 only.

| Metric | Before | After |
|---|---|---|
| NBA leans settled | 0 / 270 | **270** (149W / 121L) |
| Public risk-section slips | 1W / 29L / 9P | **4W / 35L / 0P** |
| Optimizer pool (120) | 4W / 83L / 28P | **8W / 106L / 1P** |
| Mis-settlements | — | **0** |

The lone remaining pending (Nolan Arenado `batter_hits`) is a **verified
DNP** — left honestly pending, never forced.

---

## 2. May-30 settled record (public era)

Source: `optimizer-summary.json` (`byDate`) — exactly what `/results`
renders.

| Date | W | L | Decisive | Pending | Hit rate |
|------|--:|--:|---------:|--------:|---------:|
| 2026-05-27 | 10 | 21 | 31 | 1 | 32.3% |
| 2026-05-28 | 24 | 87 | 111 | 3 | 21.6% |
| 2026-05-29 | 2 | 38 | 40 | 8 | 5.0% |
| 2026-05-30 | 8 | 106 | 114 | 1 | 7.0% |
| **Era** | **44** | **252** | **296** | **13** | **14.9%** |

05-30 (7.0%) was another cold slate. The era figure (14.9% over 296
decisive slips) is **recorded, not claimed as improvement**. These are
multi-leg parlays, so a low slip-level rate is structurally expected, but
the public record is honestly below break-even for the prices published.

---

## 3. 3-slate risk-section calibration (May 28–30, public, deduped)

`decisiveHit = win / (win + loss)`, pending excluded.

| Section | W | L | P | decisiveHit (n) |
|---------|--:|--:|--:|-----------------|
| low | 8 | 22 | 3 | **27%** (30) |
| medium | 1 | 15 | 4 | 6% (16) |
| high | 1 | 17 | 2 | 6% (18) |
| longshot | 0 | 19 | 1 | **0%** (19) |
| OVERALL | 10 | 73 | 10 | 12% (83) |

**Honest reading:**
- The taxonomy is still **directionally calibrated** — Low (27%) clearly
  beats the rest and Longshot (0%) is the floor.
- **Medium and High are now indistinguishable (6% vs 6%).** Over 3 slates
  the medium/high boundary is not separating decisively. This is a
  *watch* item, not yet an action — 16 + 18 decisive slips is still a thin
  sample, and one cold MLB stretch dominates both bands.
- Absolute rates remain low across a genuinely cold MLB run; do **not**
  act on this to change the optimizer.

**By sport (3-slate):** NBA **60%** (6/10) · MLB **5%** (2/41) · Multi
**6%** (2/32). NBA looks strong but the sample is tiny (10 decisive). The
cold is concentrated in MLB and Multi (which carry an MLB leg).

**Weakest markets (leg-level, n≥8, 3-slate):** `batter_hits` 23% (47) ·
`batter_hits_runs_rbis` 31% (58) · `pitcher_strikeouts` 43% (35) · `AST`
47% (19). Strongest: `REB` 96% (25) · `PTS` 74% (35) · `batter_total_bases`
60% (50).

---

## 4. Confirmed-signal policy — tracking, NOT consumed

`app/public/data/audit/policy.json` (rolling 7-day window, demotion-only,
3 confirming days required) now reports its **first confirmed market
signal**:

| Signal | Fires / Required | Confirmed | Effect if wired |
|--------|------------------|-----------|-----------------|
| `marketDemotions.batter_total_bases` | 3 / 3 | **true** | ×0.85 weight |
| `longshotKeepCollapsed` | (1 / 1) | true | keep longshot collapsed |
| `mixedSportDownrank` | 2 / 3 | false | — |
| `sameGameNbaCap` | 2 / 3 | false | — |
| `dnpGuardStrengthen` | 2 / 3 | false | — |
| `marketDemotions.AST` | 2 / 3 | false | — |

**Guardrail honored.** Verified that **no optimizer/board code reads
`policy.json`** (`grep` across `pipeline/` — only `audit_signal_policy.py`,
its own writer, references it). So the confirmed `batter_total_bases`
demotion **is not applied** and will **not** auto-apply on the next
`morning-projections` run. Wiring it in requires **explicit operator
approval** per the hard rules; this note only records that the threshold
was reached.

> Note: `batter_total_bases` is a *demotion* signal from the daily audit's
> own heuristic, yet it is one of the *better* markets at the leg level
> (60%). That tension is exactly why consumption stays gated on a human
> decision rather than firing automatically.

---

## 5. Recommendations (none change the optimizer tonight)

1. **Watch the medium/high boundary.** If 6%≈6% persists across 2–3 more
   settled slates with a larger sample, consider re-banding — but only as
   a deliberate, tested, operator-approved change, never from same-slate
   feedback.
2. **Keep the NBA→ESPN settlement bridge.** It converted a 0/270 NBA
   settlement into a full one; it is the reason 05-30 has a real NBA
   record at all. Future slates inherit the robustness.
3. **Do not consume `policy.json`.** Even the confirmed signal stays
   observational until an operator decides otherwise.

All numbers above derive from committed files; no outcomes were
hand-edited and no stats were fabricated.
