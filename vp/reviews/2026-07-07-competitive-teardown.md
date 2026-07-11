# Competitive Teardown — GameScript · ParlayPros · SimTheGame

**By:** Claude (VP) · **2026-07-07** · sources: user description (GameScript/Dan Gamble AI, ParlayPros) + uploaded SimTheGame dashboard screenshots.
**One-line thesis:** all three are strong at *surface* (picks, sims, EV, distribution). **None of them prove an honestly-settled money record.** That is GameTime Picks' moat — we should deepen the product to their level while making our tracked, forensically-settled paper ledger the thing they can't copy.

## A. Comparison table
Legend: ✅ strong · 🟡 partial · ❌ absent · (v2) planned.

| Capability | GameTime Picks (today) | GameScript / Dan Gamble AI | ParlayPros | SimTheGame |
|---|---|---|---|---|
| Daily model picks | ✅ Top 10 + boards | ✅ daily AI + capper picks | 🟡 via parlays | 🟡 per-sim leans |
| Suggested parlays | ✅ Parlay Lab (thin) | ✅ | ✅ (core) | ❌ |
| Model confidence tiers | ✅ reliability-weighted | 🟡 | 🟡 | 🟡 "within range" |
| Hit rates / tracked record | ✅ **settled + calibration** | ✅ hit rates (self-reported) | 🟡 | ❌ |
| Player-prop tools | 🟡 board props | ✅ prop grading | 🟡 | ✅ **deep grids + box score** |
| Game simulator | 🟡 monte-carlo shadow only | ❌ | ❌ | ✅ **10k-run, distributions, box score** |
| Market agreement / calibration score | 🟡 internal only | ❌ | 🟡 (implicit) | ✅ **96/100 headline score** |
| Parlay builder (paper) | 🟡 build-your-own exists | 🟡 | ✅ **true-odds builder** | ❌ |
| True odds / EV | 🟡 edge shown, not packaged | 🟡 | ✅ **model true odds vs book** | 🟡 sim vs book gaps |
| Social content loops | ❌ (designed, not live) | ✅ **X-native daily engine** | 🟡 | 🟡 paywall-led |
| Mobile UX | 🟡 usable, split-nav debt | ✅ | ✅ | ✅ **clean, scannable** |
| Upgrade / monetization | ❌ (deferred by design) | ✅ subs/creator | ✅ subs | ✅ **$19/mo Pro, free-sim gate** |
| Transparency / results tracking | ✅ **best-in-class (Mr. Dub)** | 🟡 | 🟡 | 🟡 methodology page |
| Responsible-copy / legal posture | ✅ **paper-only, no hype** | 🟡 (pick-seller framing) | 🟡 (EV/betting framing) | ✅ "probabilistic, not predictions" |

**Read:** we lead on *trust + settlement*; we trail on *depth (simulator/props/calibration surfacing), parlay tooling, social distribution, and monetization packaging.* The roadmap should close the depth/distribution gap **without** giving up the trust lead.

## B. Per-competitor analysis

### GameScript / Dan Gamble AI
- **Does well:** a full "sports intelligence" surface (expert + AI picks, prop grading, hit rates, trends, real-time alerts) and, crucially, a **daily X-native content loop** that compounds audience. Distribution is the engine.
- **Learn:** the *daily publishing cadence* and packaging picks as shareable, self-contained social units; real-time "slate is live" notifications.
- **Avoid copying:** pick-seller/"expert lock" framing, capper hype, and self-reported hit rates without an auditable settlement trail. We must never adopt lock/hype language.
- **We do better:** our hit rates are **settled and forensically auditable**, not marketing. We can post "here's the receipt" content they structurally can't.

### ParlayPros
- **Does well:** the "**we show true odds so you decide**" positioning — model-derived fair odds vs book, EV surfaced, user builds the parlay. Empowering, not prescriptive.
- **Learn:** the *decision-support* framing (show the math, let the user choose) and a genuinely good paper parlay builder with correlation awareness.
- **Avoid copying:** anything that slides toward real-money EV chasing or "+EV bet now." We are paper-only/analytics — EV is educational, never a call to wager.
- **We do better:** pair true-odds/EV with our **tracked outcomes** — ParlayPros shows theoretical edge; we can show theoretical edge *and* how those leans actually settled over time.

### SimTheGame
- **Does well:** depth + clarity. From the screenshots: market snapshot → simulator output → win prob / margin & total distributions → team totals, match markets, Asian handicap, corners → average box score + keeper → **Biggest Model Leans** cards → **Market Agreement 96/100** calibration → first-goal-scorer → prop grids, all with a clean **SUPPORTED / NEUTRAL / OPPOSED** signal system and a "probabilistic, not predictions" disclaimer. Excellent scannability and honest framing.
- **Learn:** the *page architecture* (one matchup → snapshot → output → distributions → leans → calibration), the **supported/neutral/opposed** vocabulary, the **calibration score as a headline sanity check**, and the free-sim → Pro gate.
- **Avoid copying:** (1) their **UI/copy/layout verbatim** — we build original GTP-branded versions; (2) the subtle overstatement risk in a **market-derived** sim — SimTheGame *translates published prices into scorelines*, so "96/100 market agreement" is partly circular (a book-derived sim will of course agree with the book). We should be honest that agreement-with-book is a *sanity check*, not proof of edge.
- **We do better:** SimTheGame shows a pretty simulation but **tracks no record and settles no money.** We can offer comparable depth *and* the receipt — "here's the sim, here's the lean, here's how it settled, here's the bankroll." Depth + proof beats depth alone.

## C. Strategic takeaways
1. **Close the depth gap with existing data first** (Market Lab, Game Detail shell, calibration surfacing) — don't fabricate a 10k-run sim we don't have; use our real de-vigged model probabilities and monte-carlo shadow where present, mark the rest "unavailable."
2. **Adopt the vocabulary, not the layout** — supported/neutral/opposed and a headline calibration score are honest, useful, and original when GTP-branded.
3. **Distribution is the growth unit** — a daily, honest social pack is our version of the Dan Gamble loop and is the single highest-leverage growth investment.
4. **Trust is the wedge** — every competitor-inspired feature should end in a link back to the settled record. Depth earns the click; the receipt earns the trust.
