# GameTime Picks v2 — Feature Plan (missing features · principles · backlog · pages)

**By:** Claude (VP) · **2026-07-07** · pairs with `reviews/2026-07-07-competitive-teardown.md`.
**Frame:** match competitor *depth + distribution* while keeping our *trust + settlement* lead. Build from **existing data only**; mark anything we can't source "unavailable" — never fabricate a simulation, probability, or EV.

---

## B. Missing features (grouped)

1. **Daily social / distribution** — a Daily Social Pack generator (X thread, Discord slate drop, IG carousel, TikTok script, "3 model leans," "best no-play," settlement recap). *Our biggest growth gap.*
2. **Game simulator / matchup detail** — a Game Detail page per matchup: odds snapshot → model output → win-prob → margin/total distributions → team totals → BTTS/corners/props where available → player table → biggest leans → calibration → "what the model likes/doesn't."
3. **Player-prop depth** — a prop grid per team (stat columns, model median vs line, supported/neutral/opposed shading), "biggest model leans" cards, honest "no market" cells.
4. **Parlay builder / suggested parlays** — Parlay Lab v2: clearer suggested slips, paper build-your-own, model/true odds where backed by data, correlation warnings, confidence band, "why these legs belong (or don't)."
5. **Market agreement / calibration** — a headline "model-vs-market agreement" score + per-stat breakdown (our honest version of SimTheGame's 96/100), framed as a sanity check, not an edge claim.
6. **Results & trust** — Trust Center: tracked record, open exposure, settled vs pending, a **no-play log**, model-review archive, and a "misses & lessons" section.
7. **Bank Builder / Moonshot packaging** — clearer ladder step visualization, "why this card / why no-play," shareable card receipts, honest longshot framing.
8. **Monetization-ready (no real money)** — a free-vs-deeper gate (deeper sims, history, alerts), saved slips, alerts — *packaging only, deferred per ADR-0005; no wallets/sportsbook*.
9. **Mobile UX / nav** — fix the split-nav debt, consistent page hero, one label per destination, lighter /results.
10. **Internal ops for daily publishing** — the Social Pack as a generated docs/data artifact feeding the Social department; a "publish-readiness" check.

## C. Product principles — GameTime Picks v2
1. **Paper-only, analytics-oriented.** No real-money betting, wallets, or sportsbook integration — ever.
2. **No hype.** No guarantees, locks, "safe," "risk-free," or certainty. Sportsbook-*inspired* visuals; responsible copy.
3. **Every pick is trackable.** If we surface a lean, it must be settleable and it must show up in the record.
4. **Pending is not a loss.** Official-final only.
5. **Show the reasoning.** Model output, the gap vs book, and "what breaks it" — never a blind pick.
6. **Social-ready every day.** The product produces honest, shareable outputs daily by design.
7. **Depth ends in the receipt.** Every deep view links back to the settled record — depth earns the click, the receipt earns the trust.
8. **Never fabricate.** No invented sims, probabilities, EV, or corners. Missing data is labeled "unavailable."
9. **Original brand.** Inspired by competitors, copied from none — GTP layout, copy, and identity.

## D. Prioritized feature backlog
Fields: user problem · competitor inspo · GTP version · data needs · impl risk · legal/copy risk · impact · Code timing.

### P0 — must-fix immediately (pre/at launch, low risk)
| Feature | Problem → GTP version | Data | Risk (impl/legal) | Impact | Code |
|---|---|---|---|---|---|
| **Freshness/date correctness** (Top 10 rolls to current day) | Users see stale "today" → client-clock/rebuild fix | existing | low / none | high (trust) | now (in overnight loop) |
| **No-play log surfacing** | "Do they hide misses?" → a visible log of every no-play + reason | existing settlement/proposal | low / none | high (trust wedge) | now |
| **Responsible-copy sweep for any new surface** | avoid hype drift | n/a | low / low | high | now |

### P1 — next major product upgrade (post-launch, existing data)
| Feature | Problem → GTP version | Data | Risk | Impact | Code |
|---|---|---|---|---|---|
| **Market Lab (model vs market)** | "Where does the model disagree with the book?" → per-market model prob vs de-vigged book, supported/neutral/opposed, no-play if thin | existing edge/odds | med / low (no EV-to-bet) | high | later (Plan 0008 P3) |
| **Game Detail page shell** | "One place per matchup" → snapshot → model output → distributions (where we have them) → leans → calibration | existing boards + monte-carlo shadow; mark gaps | med / low | high | later |
| **Calibration/agreement score** | "Is the model sane?" → honest agreement score + per-stat, framed as sanity check | settled + model probs | med / med (framing) | med-high | later |
| **Parlay Lab v2 clarity** | "Why these legs?" → clearer suggested/no-play, correlation warning, confidence band | existing | med / low | high | later |
| **Daily Social Pack (docs/data)** | "We need daily distribution" → generated draft pack, never auto-post | existing brief/results | low / med (copy) | **very high (growth)** | **first after launch** |

### P2 — growth / monetization (no real money)
| Feature | GTP version | Risk | Impact | Code |
|---|---|---|---|---|
| Free-vs-deeper gate | deeper sims/history/alerts behind a supporter tier; no wallets | med / med | med (revenue later) | later |
| Saved slips + alerts | save paper slips; "slate live" / "settled" notifications | med / low | med | later |
| Prop grid depth | full per-team stat grids w/ supported-neutral-opposed | med / low | med | later |

### P3 — future moonshots
| Feature | GTP version | Risk | Code |
|---|---|---|---|
| True independent simulator | real 10k-run engine (not book-derived) w/ box scores | high / med | future (needs model + data investment) |
| Creator/community layer | honest community picks w/ settled grading | high / med | future |
| Multi-book line shopping (display-only) | compare book prices for context, no bet routing | med / med | future |

## E. SimTheGame-inspired pages (original GTP designs)

### 1. Game Detail / Simulator Page (`/game/<slug>`)
Sections, top→bottom: **matchup header** (teams, kickoff, "probabilistic, not a prediction" badge) · **odds snapshot** (de-vigged book: win/draw, handicap, total — labeled source) · **model output** (win prob, margin, total, BTTS where available) · **margin & total distributions** (only if monte-carlo shadow data exists; else "distribution unavailable") · **team totals** · **match markets** (scoreline, BTTS, double chance vs book) · **corners/Asian handicap where sourced** · **player table** (median vs line, supported/neutral/opposed) · **Biggest Model Leans** cards · **model-vs-market agreement** score · **"what the model likes / doesn't like"** (plain-language, tied to reliability weights) · footer disclaimer. **Every number cites its source; gaps read "unavailable," never invented.**

### 2. Market Lab Page (`/market-lab`)
Per market: model probability vs de-vigged book probability, the gap, and a **SUPPORTED / NEUTRAL / OPPOSED** tag (aligned-small-gap / near-line-no-lean / model-disagrees). Show **no-play** when the edge is within noise. Reliability weight per market family shown (DC strong, totals weak, etc.). **No real-money CTA; EV is educational.**

### 3. Parlay Lab v2 (`/parlay-lab`)
Three modes kept (Suggested / Build-Your-Own / Bankroll Plan). Add: model/true odds per leg **where backed by data**, a **correlation warning** (same-game legs), a **confidence band**, and a plain-language **"why these legs do/don't belong together."** EV/probability shown **only if data-backed**; otherwise omitted. Paper-only stake + projected payout, never "bet."

### 4. Daily Social Pack (`/internal` or `docs/social/<date>.md` — draft only)
Generates: **X thread draft**, **Discord slate drop**, **IG carousel bullets**, **TikTok script**, **"today's 3 model leans," "best no-play explanation," "settlement recap."** Every item pulls real facts from the day's brief/results, runs a responsible-copy check, and is marked DRAFT → Head-reviewed → **Yash-approved**. **Never auto-posts.**

### 5. Public Trust Center (`/trust` or expand `/results` + `/mr-dub`)
One place for: tracked record, open exposure, **settled vs pending**, the **no-play log**, the **model-review archive**, and **"misses & lessons."** This is the page that converts skeptics — lead with it in social.
