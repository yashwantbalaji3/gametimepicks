# Program 174 — NFL public-beta completion

**Window** 2026-08-13 15:52 → 16:35 ET (19:52 → 20:35 UTC) · **Start anchor** `520ccf9e7`
(ANCESTOR; origin had advanced 2 commits on this program's own automation) · **Final HEAD**
`334872f13` · **Time to first kickoff at close** T‑2.4h · **Credits** 15 of 3,000 (unchanged —
no new question needed asking) · **Protected money** byte-identical

## What NFL users can do now

`/nfl` carries three live layers, each labelled for what it is:

| Layer | State | What a reader sees |
|---|---|---|
| Team forecasts | PUBLIC_EXPERIMENTAL / EXPERIMENTAL_LEAN | 9 games: projected score, win chance, total range, market beside it |
| Sportsbook consensus | MARKET_VIEW | 9 games × 11 books, attributed |
| End Zone Vault | **WATCHLIST_ONLY** | 100 touchdown candidates — explicitly *not* a card |
| Player props | NO_MARKET / ROLE_UNCERTAIN | typed refusal with the reason |

The Vault is the interesting one: on a night when it cannot responsibly sell anything, it is
still **useful** — Gibbs 32.0%, Bijan Robinson 31.9%, McCaffrey 29.1% — with the page saying
plainly *"This is a watchlist, not a card."*

## Releases shipped

| Release | Commit | Outcome |
|---|---|---|
| Phase 0 | — | live window classified; empty-capture regression replayed and proven impossible |
| A · canonical index + kickoff lock | `03792056e` | SHIPPED |
| C · output-state classifier | `03792056e` | SHIPPED |
| G · experimental settlement | `5c197177f` | PROVEN + ARMED (kickoff is T‑2.4h) |
| E · End Zone Vault | `334872f13` | SHIPPED — WATCHLIST_ONLY |

Full serial gate **4,284 / 0**. Whole chain runner-proven in CI (run 31739162767): forecasts →
Vault → index → settlement, all terminal.

## Two defects this program's own guards caught

**1. The receipt of record disagreed with the published page.** Settlement originally graded the
*first* receipt file per event. When the calibration λ moved 0 → 0.25 in Program 173, regeneration
wrote new values to a `-rev-` file and left the original in place — so the receipt said **50.0%**
while the page said **47.9%**, and settlement would have graded numbers no reader ever saw. It
surfaced as `winner 0/0` with every game "EVEN" on the fixture. The forecast of record is now the
**latest pre-kickoff revision**, with the full revision chain preserved and post-start files
ignored outright. A guard asserts receipt and published forecast agree event-by-event.

**2. Two of my own guards used substring scans.** `"roi"` matched **Det*roi*t Lions**. Renaming a
real team to satisfy a guard is the wrong repair, so the scans became JSON-key matches. (This is
the third program in a row where a loose guard regex needed tightening — worth remembering.)

## Verification of the inherited incident

Phase 0 required replaying the empty-capture overwrite. Reproduced on a scratch fixture: the naive
newest-by-timestamp selection returns 0 rows and a lost probe (what broke production), while the
evidence-bearing selection returns 9 rows and `PROBED`. Both writer defences confirmed present and
ordered before the write.

## GO / NO-GO

| Layer | State | Missing evidence |
|---|---|---|
| Team forecasts, market view | **GO — live** | — |
| End Zone Vault | **GO — WATCHLIST_ONLY** | prices + role evidence for ACTIVE |
| Passing / rushing / receiving | NO-GO | role evidence + offered market |
| Anytime TD probability | published inside the Vault watchlist | price for any card |
| VALIDATED_PICK, any market | **mechanically unreachable** | proven by synthetic sweep |
| First-slate settlement | **REALITY_GATED** | official finals after 23:00Z kickoffs |
| Bank Builder / Moonshot NFL legs | NO-GO | experimental forecasts do not qualify a leg |

## Not built in this window

Releases B (player projection *publication* — blocked by preseason role evidence, which is a
reality gate, not an engineering one), D (homepage/Today/Simulation Hub/game-report surfaces),
F (Bank Builder/Moonshot NFL adapters), H1 (versioned learning loop), I (protected NFL console
strip), and J's three-engine browser matrix. The launch-critical and settlement-critical paths
were completed; these are next.

## Next five

1. Settle the 9 forecasts after finals (armed: `experimental-settlement/WATCH.json`, fires ~14:30Z).
2. Homepage/Today/Simulation Hub NFL modules from the canonical index.
3. NFL strip on the protected console.
4. Versioned learning loop — freeze v1, train v2 offline only on settled games.
5. Player projections when regular-season role evidence exists.
