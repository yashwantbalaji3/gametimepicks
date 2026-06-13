# June 12 full settlement — official sources

Settled: 2026-06-13 ~05:15 UTC. Official-source settlement only (not user claims/screenshots).

## World Cup June 12 (was unsettled — settlement artifact had finals:[] graded:[])
Official 90-minute regulation finals (group stage → no extra time):
- **United States 4–1 Paraguay** (SoFi Stadium) — ESPN/FOX/NBC/NPR/Yahoo/FIFA.
- **Canada 1–1 Bosnia and Herzegovina** (Toronto) — ESPN/FOX/FIFA.com/CBC/Opta. Larin 78'
  equalizer; a DRAW.

Daily double-chance calls graded (pick `home_or_away` = either listed team wins; a draw loses):
- `wc_2026-06-12_usa_paraguay_dc` — US-or-Paraguay → USA won → **WIN**.
- `wc_2026-06-12_canada_bosniaandherzegovina_dc` — Canada-or-Bosnia → 1–1 draw → **LOSS**.
- WC daily calls record: **1–1**.

Written to `world-cup/settlement/2026-06-12.json` + `latest.json` (finals + graded;
`settlementSource` = espn+foxsports+fifa). Corners omitted from finals — official corner
counts were not independently verified, so corner-total markets are left ungraded rather than
guessed (honest pending).

Note on June-12 WC suggested cards (parlays/2026-06-12.json, 7 cards): most carried the
"Canada or Bosnia" (`home_or_away`) double chance, which LOST on the 1–1 draw. By product
rules (any non-void leg lost → card LOST): the goals-Over-2.5 single on USA-Paraguay (5 goals)
would WIN; corner-total singles remain pending (no official corner data); the rest LOSE. These
suggested cards are illustrative, not ladder/Bank-Builder picks.

## Bank Builder Step 4 (re-audit — settled in PR #467, unchanged)
- US-or-Paraguay double chance → WON (USA 4–1, regulation).
- Luinder Avila Under 3.5 K → WON (official MLB Stats API gamePk 824102: 0 K, 0.2 IP, started).
- State: **$3,623.97 · 4–0 · Step 5/5**. Exactly one Step-4 ledger entry (idempotent). No change.

## MLB June 12
The June-12 MLB board carries model projections (leans), not tracked public bets requiring
settlement beyond the Bank Builder Avila leg (settled). No separate public MLB card ledger for
June 12 required settling. The Avila box score (0 K) is the official MLB settlement of record.

## NBA June 12
No June-12 NBA artifacts exist (NBA Finals Game 4 was June 10, settled as Bank Builder Step 2;
Game 5 is June 13). No June-12 NBA settlement required.

## Result
June 12 settled where official data exists. Pending/unavailable (honest): WC corner-total
markets (no verified official corner counts). Bank Builder unchanged. No stale Step-4 pending.
