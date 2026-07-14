# FreeSim-Style Game-Report Upgrade — Log (2026-07-14)

Make the World Cup game report a "Simulation Report" (verb parity with MLB) while staying honestly
market-implied. Money untouched (md5 `affe6b21`, 19-14, $0). Verified ET 2026-07-14.

## Founder bug
MLB says "Generate Simulation"; World Cup said **"Generate Market Dashboard"** — soccer felt second-class /
like an odds dashboard, not a simulation.

## What was fixed (World Cup — items 1–4 of the priority)
1. **Wording (verb parity):** `wc-simulation-runner.tsx` CTA "Generate Market Dashboard" → **"Generate
   Simulation Report"**; "Market dashboard ready" → "Simulation report ready"; "Building market dashboard" →
   "Building simulation report"; top badge "Market-Implied Report Ready" → "Simulation Report · Market-Implied".
   The **source label stays honest**: "a market-implied simulation report from the de-vigged 90-minute prices"
   (never a 10k / independent soccer sim). `multi-sport-report-shell` "Advanced market dashboard" → "Advanced
   market details".
2. **Above-the-fold framing:** the report now reads as a Simulation Report; `WcGameCenter` (match result / DC /
   DNB / total / BTTS, 3-way probabilities) is the market-implied result, with the advanced odds table secondary.
3. **Bracket impact card** (`WorldCupBracketImpactCard`) above the runner on both semifinal reports: **Winner →
   World Cup Final · Loser → third-place game**, with **Final + third-place TBD** and **NO fabricated finalists**
   (verified: 0 real teams in the component; `if (!isSemi) return null`).
4. **Player props:** already per-fixture on the report (`detail.playerProps`, 24 real Odds API props for France
   v Spain), in the props tab — provider-backed, settlement-pending, excluded from products. (Surfacing them
   above the fold as a compact preview is the small remaining polish — see residuals.)

## What is honestly still market-implied
World Cup is a **de-vigged 90-minute market-implied read** — not an independent soccer simulation, no projected
scoreline, no xG. "No strong lean" is the disciplined output when the market is efficient, not a broken page.

## MLB (item 5) — NOT refactored this pass, by design
MLB already says "Generate Simulation" with the real 10k artifact flow (Game Center: distributions, win-prob,
run-line, total, player props). The mission's end-to-end MLB re-layout is a larger refactor; per the prompt's
"do not ship a half-broken MLB refactor," it is deferred to its own pass.

## Residuals / next
- Surface a compact **player-props preview above the fold** on the WC report (data already present in the tab).
- MLB end-to-end result-summary / top-outcomes re-layout (its own careful pass).
- Real soccer-sim depth (independent model, prop settlement) needs **provider/plan budget** — see
  `WC_PLAYER_PROP_SETTLEMENT` + `FREESIM_STYLE_SIMULATION_RESULTS_GAP`.

## Gates
tsc clean · suite 2185/0 (+ `wc-report-upgrade.test`, updated `wc-game-center.test`) · build exit 0 · forensic
PERFECT · money `affe6b21` · health HEALTHY. No fake soccer sim / 10k claim / fabricated finalists.
