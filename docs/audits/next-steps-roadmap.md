# GameTimePicks — Next-Steps Roadmap

_Generated 2026-06-24. Authoritative product-by-product status, prioritized work queue, and the Bank Builder $10k-path review._

> **Invariant reminder (do not violate):** canonical Bank Builder money is frozen at **bankroll $10,176.17 / crown $10,376.17 / record 12-2-0 / exposure $0** (`app/public/data/mr-dub/portfolio.json`). The seed-model rolls a won step's stake (bankroll unchanged) and drops $100 on a lost step. The daily-portfolio, product ledgers, and selectors are **read/derive-only** — none of them may mutate canonical money. All paper-product P&L below lives in the **separate** master ledger, not the canonical bankroll.

---

## 1. Per-product status

### Bank Builder (flagship — dual ladder A/B)
- **Current state:** Lane A on **Step 5** ($3,502.57 → $10,000 target), Lane B on **Step 3** ($702.45 → ~$1,400). As of the June-24 hotfix, both lanes are **approved-card-locked** (`bank-builder-locks.json`); a refresh re-prices the pinned legs but cannot silently swap them. Lane A = Morocco ML (-550) + Bosnia ML (-275) + Scotland/Brazil **Over 2.5** (-127) → **$10,089**. Lane B = Brazil ML (-320) + Switzerland Under 2.5 (-144). Product paper record **2-0, +$2,463**.
- **Blockers:** none functional. The locked card relies on the live pool still carrying those games/markets — if odds vanish the lock releases with a note (by design).
- **Risk:** **Medium.** Lane A's Step-5 jump is a ~30% single-step proposition (see §3). Lane A and Lane B both reference the Scotland/Brazil fixture — an operator-accepted cross-lane correlation (the lanes are NOT outcome-independent today). The selector itself still guarantees independence; only the manual lock correlates them.
- **Confidence:** **High** on stability/plumbing; **Medium** on the $10k outcome (probability-bound, not engineering-bound).

### Moonshot Lane (high-volatility WC longshot challenge)
- **Current state:** standalone artifact (`moonshot-lane/active.json`) is **single-lane and `status:"stopped"`** at Step 1 after the June-21 leg lost (New Zealand/Egypt BTTS-No). The daily-portfolio shows a dual-lane shell (Lane A 2/5, Lane B 0/5) but both are **`awaiting`** — they cannot fill. Product record **0-2, -$50, $0 exposure**.
- **Blockers (real):** the June-24 WC slate has only **~3 distinct games** left for longshot legs after Bank Builder consumes Morocco/Bosnia/Scotland-Brazil/Switzerland. Two independent **5-leg** lanes need ≥10 distinct games. The Odds API also exposes **no soccer player props**, so the longshot pool is team/total-only and thin.
- **Risk:** **Low to the business** (paper-only, $0 canonical impact), but **PART 2 cannot be satisfied as literally specified** (two full 5-leg lanes) on today's slate without either lowering the leg target or broadening the pool.
- **Confidence:** **High** on the diagnosis; the activation requires a structural decision (see §2, P0).

### World Cup Specials (homepage longshot box)
- **Current state:** 5 cards generated for **2026-06-24**; the June-23 slate **settled 0-5** (rolled into the ledger). Exposure **$0** (no stale carry). Cards are the **team-model fallback** (player-prop specials impossible — no soccer props upstream).
- **Blockers:** the artifact has **no embedded `record`/`roi`/`archive`** block — historical performance is reconstructed only via the master ledger, not self-contained in `world-cup-specials.json`.
- **Risk:** **Low.** Display + settlement work; the 0-5 cold streak is variance on genuine longshots, not a bug.
- **Confidence:** **High** on daily refresh/settlement; **Medium** on self-contained record-keeping (P2).

### Homer Nukes (MLB home-run product)
- **Current state:** V2 dual-lane shipped — **Lane A + Lane B, 3 legs each, $10 each**, combined +3269 / +5680, written to `mlb/homer-nukes-active.json` for 2026-06-24. Exposure **$20**. Record **0-0** (no settled slate yet).
- **Blockers:** Homer Score is a **"Partial Model" (0/7 Statcast inputs)** — barrel rate, xISO, pull%, etc. not yet wired; ranking currently leans on odds + park/handedness only. No settled history to validate ROI.
- **Risk:** **Medium.** Confidence labels may over-state edge until Statcast lands.
- **Confidence:** **High** on plumbing/display; **Low** on model edge until the data gate clears.

### Mr Dub (authoritative aggregate bettor)
- **Current state:** `master-ledger.json` aggregates all four products — per-product **record / ROI / profit (P&L) / exposure / freshness / staleness / history**, plus an **aggregate** (9 bets, 2-7, stake $1,841.82, **profit $2,363.20**, ROI 128.31%, exposure $220, win-rate 22.22%). Exposure is staleness-gated so settled-but-unrefreshed lanes don't leak open risk.
- **Blockers:** the aggregate exposes `profit` but not an explicitly **labeled "Lifetime Profit"** field, and there is no per-product **`pnl`/`openExposure`** alias — PART 7 wants those names surfaced.
- **Risk:** **Low.** Numbers reconcile (BB +2,463.20 − 50 − 50 + 0 = +2,363.20).
- **Confidence:** **High.**

---

## 2. Prioritized remaining work

### P0 — must clear before/at this launch
- **[done] BB approved-card lock + Lane A revert** (PR #602). Lane A stable all day; refreshes can't swap pinned legs.
- **[done] Moonshot dual-lane activation (PART 2).** Leg target is now **adaptive (3–5)** with a **+700 longshot floor**; the two lanes split the pool **fairly from disjoint games** (max 1 leg/game, no fabricated SGP) so a medium slate yields two 3-leg lanes instead of one 5-leg lane starving the other. The card-lock is now **product-aware** — an operator-approved Moonshot card pins + force-activates a lane exactly like Bank Builder. Master-ledger Moonshot exposure is keyed off the **live daily portfolio** (an activated lane's $25 reaches Mr. Dub). **Today's WC slate cannot honestly field a longshot lane** (after Bank Builder consumes the favorites only short totals on already-used games remain, combined +359 < +700) → **both lanes correctly AWAIT, $0 placed, nothing fabricated.** 9 new tests prove both lanes activate independently the moment a qualifying slate exists (deep slate → 5+5; medium → 3+3; thin → await).
- **Mr Dub labeled metrics (PART 7).** Add explicit `lifetimeProfit` (aggregate) and per-product `pnl`/`openExposure` aliases so the authoritative bettor surfaces Record / ROI / P&L / Open Exposure / Lifetime Profit by name.

### P1 — soon, before relying on the products' edge
- **Quarantine the WC projection MODEL probability.** It is inverted/buggy (e.g. Bosnia shows +450/0.20 in the projection vs market -275/0.70). The selectors already prefer de-vigged market-outlook, but the raw model prob is a latent footgun — gate it behind a sanity check (drop legs where model and market disagree by > X) or stop surfacing it.
- **Homer Nukes Statcast inputs (0/7).** Wire barrel%, xISO, pull%, park factor, pitcher HR/9, weather, handedness so the Homer Score is a full model, not "Partial."
- **Settle today's slate from official box scores** (MLB Stats API / API-Football 90′), never web snippets — BB legs, Moonshot, WC Specials, Homer.

### P2 — polish / resilience
- **Self-contained WC Specials record + archive** (embed `record`/`roi`/`history` in the artifact, not only the ledger).
- **Smaller-rung BB ladder option** (see §3) — a structural change, operator-gated.
- **Public-launch gate consolidation** — a single operator flag that flips all four products from paper-preview to public, with the staleness gate enforced.

---

## 3. Bank Builder $10k-path review (PART 3 core question)

**Question:** can we safely take Lane A from **$3,500 → $10,000**?

**Short answer: not "safely" in the everyday sense — the Step-5 jump is structurally a ~30% event, and no card can make a 2.857× parlay a coin-flip.** Reaching $10,000 from $3,502.57 needs a **2.857× return**, i.e. you must beat a **~35% market-implied probability** (1 / 2.857), and after the book's vig the realistic ceiling for any actually-available combo is **~30%**.

The current locked Lane A is already the **highest-probability target-reaching card on the slate**:

| Leg | Odds | De-vigged hit prob | Note |
|---|---|---|---|
| Morocco to win | -550 | 0.81 | short favorite |
| Bosnia & Herzegovina to win | -275 | 0.70 | short favorite |
| Scotland/Brazil Over 2.5 | -127 | ~0.52 | totals leg supplies the needed juice |
| **Combined** | **+186 (≈2.88×)** | **≈ 0.295** | 3 different games → legs independent |

Two short favorites alone only reach ~1.6×; the slate offers just **three** strong WC favorites (Morocco, Brazil, Bosnia) and Brazil's game is the totals leg — so a third favorite isn't available, and the totals leg (lower prob, more juice) is what bridges to 2.857×. **~30% is therefore the practical ceiling for a one-step $10k, and the selector already finds it.**

### Safer alternatives considered
1. **Stack more WC favorites** — not possible today (only 3 favorites; one is spent on the total). Rejected for this slate.
2. **MLB batter hits** — "to record a hit" runs ~0.62–0.68. Three hits ≈ 0.65³ ≈ **0.27** combined at ~1.55³ ≈ 3.7× (≥ 2.857×). Comparable probability to the WC card, **uncorrelated across games**, and available when WC favorites run out. **Recommended as a fill source** so the selector is never forced onto a single low-prob total.
3. **Pitcher strikeouts (alt-K lines)** — Tier-1 starters' main/alt-K lines ~0.55–0.60; three legs land in the same ~25–30% combined band. Viable secondary source.
4. **Correlated-risk check** — the locked Lane A legs are **three different games (uncorrelated, good)**. The only correlation today is **cross-lane** (Lane A Over 2.5 + Lane B Brazil ML, same fixture) — operator-accepted, and it does not change either single lane's hit probability.

### Recommendation (safest path)
- **For today's single step:** keep the locked ~30% card — it is already the highest-probability combo that reaches $10k. **Diversify the fill pool with MLB batter-hits / pitcher-K legs** so the selector never has to reach for a sub-0.50 total when WC favorites are exhausted.
- **For the ladder structurally (operator-gated, P2):** the honest way to raise the *eventual* probability of reaching $10k is **smaller rungs** — split the $3,500 → $10,000 jump into two ~1.7× steps ($3,500 → $6,000 → $10,000), each ~58%, with the option to bank at the intermediate rung. This changes the ladder's money semantics, so it is **proposed, not implemented** — it requires explicit operator approval.
- **Do not** chase $10k with a single longer-odds card to "lock it in faster" — that lowers, not raises, the probability, and adds variance the seed model can't absorb.

---

## 4. Execution order (PART 4)
P0 Moonshot dual-lane activation → P0 Mr Dub labeled metrics → P1 WC projection-prob quarantine → P1 Homer Statcast (data-gated, may defer) → official-box-score settlement at slate close. Each step ships behind the staleness gate; canonical money stays frozen throughout.
