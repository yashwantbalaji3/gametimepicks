# Bank Builder Policy Migration — $100 → $10,000 Public Ladder (2026-06-11)

**Effective:** 2026-06-11T05:10:00Z · **Type:** explicit, user-approved policy migration
(NOT an edited settlement result).

## Old ladder ($100 → $3,000)
100→200 · 200→400 · 400→800 · 800→1600 · 1600→3000.

## New PUBLIC ladder ($100 → $10,000)
| Step | Start | Goal |
|---|---|---|
| 1 | $100 | $200 |
| 2 | $200 | $700 |
| 3 | $700 | $2,000 |
| 4 | $2,000 | $4,500 |
| 5 | $4,500 | $10,000 |

## Why migrate
The user is launching the public Bank Builder around the verified NBA Finals run and wants a
higher, clearer public crown ($10,000) plus public recognition of the officially-confirmed
NBA Finals hit as the active run's Step 2.

## Official results this run (settled, not fabricated)
- **Step 1 — June 9 (MLB, official MLB Stats API):** Shohei Ohtani H o0.5 (win) + Corey
  Seager H u1.5 (win) → **$100 → $211.85**.
- **Step 2 — June 10 (NBA Finals Game 4, official ESPN box score):** Stephon Castle REB
  o4.5 → 5 REB (win) + OG Anunoby PRA o23.5 → 38 PRA (win) → **$211.85 → $728.76**
  (+$516.91). `officialResultConfirmed: true`.

## Tracked-vs-featured distinction (and the user decision)
- The **canonical tracked ledger** (settled by `build-bank-builder-ledger.mjs` from the
  official Suggested-pool Builder pick) settled June 10 on the MLB pick (Rengifo + Bregman)
  → $211.85 → $444.19. **This original ledger is preserved unchanged** in
  `ledger-latest.json` / `ledger-2026-06-10.json` + the featured artifact.
- **User decision (this migration):** the public Bank Builder run recognizes the
  officially-confirmed **NBA Finals featured hit** as the active **Step 2** result. This is
  a forward policy choice, applied via a NEW public layer — it does **not** rewrite the
  canonical tracked ledger.

## New current state (public)
- Paper bankroll: **$728.76** · Current step: **3 / 5** · Target: **$2,000**.
- Step 1 cleared (June 9 win) · Step 2 cleared (June 10 NBA Finals hit) · Step 3 active.
- Next Builder Slip stake: **$728.76** (= current bankroll), pending the next qualifying slip.

## Artifacts
- New public layer: `public-summary-latest.json`, `public-ledger-latest.json`,
  `public-ledger-2026-06-11.json`.
- Preserved canonical: `summary-latest.json`, `ledger-latest.json`, `featured-latest.json`,
  all audit docs.

## Guardrails
Paper bankroll · educational tracking · not betting advice · no guarantee. No settlement
truth changed; no past slip legs/odds/results altered; original tracked ledger preserved.
