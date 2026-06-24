# Final Review — June 24, 2026

_Closeout for the hotfix + roadmap-execution mission. Money integrity held throughout: canonical bankroll
**$10,176.17 / crown $10,376.17 / record 12-2-0 / canonical exposure $0** never changed._

---

## 1. Bank Builder — final locked cards (PART 1)

Today's active cards are **approved-card-locked** — a refresh re-prices the pinned legs but cannot silently
swap them (the South-Korea-for-Brazil swap that triggered the hotfix can no longer happen). The only
automatic replacement is when a leg's odds/market goes unavailable.

### Lane A — Step 5 · `$3,502.57 → $10,089.23` (+188) · 🔒 locked · ACTIVE
| Leg | Game | Odds |
|---|---|---|
| Morocco to win | Morocco vs Haiti | -550 |
| Bosnia & Herzegovina to win | Bosnia & Herzegovina vs Qatar | -275 |
| **Over 2.5 goals** | **Scotland vs Brazil** | **-127** |

> The reverted leg (Scotland/Brazil Over 2.5) is restored and pinned. Reaches the **$10,000** Step-5 goal
> (~30% combined — the practical ceiling for a 2.857× single step; see the roadmap's $10k-path review).

### Lane B — Step 3 · `$702.45 → $1,562.22` (+122) · 🔒 locked · ACTIVE — left exactly as displayed
| Leg | Game | Odds |
|---|---|---|
| Brazil to win | Scotland vs Brazil | -320 |
| Under 2.5 goals | Switzerland vs Canada | -144 |

> **Cross-lane note:** Lane A (Over 2.5) and Lane B (Brazil ML) both reference the Scotland/Brazil fixture —
> an **operator-accepted correlation** documented in `bank-builder-locks.json`. The selector still guarantees
> independence; only the manual lock correlates them.

---

## 2. Moonshot — both lanes (PART 2)

| Lane | Status | Legs | Why |
|---|---|---|---|
| A | **awaiting** | 1 / 3 | thin WC slate — see below |
| B | **awaiting** | 1 / 3 | thin WC slate — see below |

The Moonshot now activates as **two independent lanes** ($25 each, own exposure/progression) with an
**adaptive 3–5 leg target**, a **+700 longshot floor**, and a **fair disjoint-game split** (max 1 leg/game,
no fabricated SGP). An operator-approved card pins + force-activates a lane exactly like Bank Builder.

**Today both lanes correctly AWAIT** — after Bank Builder consumes the WC favorites, only short totals on
already-used games remain (combined **+359 < +700**), so a longshot lane cannot be fielded honestly. Nothing
was forced or fabricated. **9 tests** prove both lanes activate independently the moment a qualifying slate
exists (deep slate → 5+5, medium → 3+3, thin → await; lock force-activates / releases / blocks late games).
Master-ledger Moonshot exposure is now keyed off the live daily portfolio, so an activated lane's $25 reaches
Mr. Dub.

---

## 3. World Cup Specials (PART 5)
- **June 24:** 5 cards live. **June 23:** settled **0-5** (rolled into the product ledger).
- **Open exposure $0** — no stale carry; diagnostics confirm active Bank Builder + Moonshot cards are
  excluded from the Specials pool.
- History archive present (`world-cup-specials-history.json`). Daily refresh + settlement working.

## 4. Homer Nukes (PART 6)
- **Dual-lane confirmed:** Lane A (3 legs, +3269) + Lane B (3 legs, +5680), **$10 each, $20 exposure**.
- Record **0-0** (launched June 23; first slate June 24 not yet settled — no ledger history is correct).
- Homer Score remains a **"Partial Model" (0/7 Statcast inputs)** — tracked as a P1 (data-gated).

## 5. Mr. Dub master ledger (PART 7)
The authoritative bettor now surfaces all five metrics — **Record / ROI / P&L / Open Exposure / Lifetime
Profit** (the last added this pass, plus per-product `pnl`/`openExposure` aliases).

| Product | Record | ROI | P&L | Open exposure | Status |
|---|---|---|---|---|---|
| Bank Builder | 2-0 | +141.42% | +$2,463.20 | $200 | fresh |
| Moonshot | 0-2 | -100% | -$50.00 | $0 | fresh |
| World Cup Specials | 0-5 | -100% | -$50.00 | $0 | fresh |
| Homer Nukes | 0-0 | — | $0.00 | $20 | fresh |
| **Aggregate** | **2-7** | **+128.31%** | **+$2,363.20** | **$220** | — |

> **Lifetime profit = +$2,363.20** (cumulative all-time realized P&L; every paper card settles from official
> results, so there is no unrealized component). This product track record is **separate** from the canonical
> seed-model bankroll, which is frozen.

---

## 6. Remaining blockers & next work
- **P1 — WC projection MODEL probability is inverted/buggy** (e.g. Bosnia +450/0.20 in the projection vs
  market -275/0.70). Selectors already prefer de-vigged market outlook, so it does not affect today's locked
  cards; quarantining the raw model prob is the next hardening (held back to avoid destabilizing locked cards).
- **P1 — Homer Nukes Statcast inputs (0/7)** — barrel%, xISO, pull%, park, etc. Data-gated.
- **P1 — Official-box-score settlement at slate close** — grade BB legs, Moonshot, WC Specials, Homer from the
  MLB Stats API / API-Football 90′ result (never web snippets), then roll the ledger.
- **P2** — self-contained WC Specials record/archive; operator-gated smaller-rung BB ladder; single public-
  launch flag. (Full list in `next-steps-roadmap.md`.)

---

## 7. Gates (PART 8)
- **Tests:** `npx tsx --test $(find src -name '*.test.mjs')` → **1394 / 1394 pass**.
- **Types:** `npx tsc --noEmit` → **clean**.
- **Build:** `npm run build` → **succeeds** (static export).
- **Money integrity:** canonical `portfolio.json` unchanged — $10,176.17 / $10,376.17 / 12-2-0 / $0 — verified
  by the lock + activation + ledger tests on every run.
