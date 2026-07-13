# Simulation-First Product Roadmap (2026-07-13)

Phased path from "organized launch" to "FreeSim-level depth". Each item: complexity · risk · data source ·
files · DoD. Guardrail throughout: money `affe6b21`, no fake markets, no fake sims.

## Phase A — Product clarity (1-2 days · UI only, no data)
| item | complexity | risk | files | DoD |
|---|---|---|---|---|
| ✅ Market-coverage matrix + honest gaps on `/simulate` | S | low | `lib/market-coverage.ts`, `components/simulation-coverage-matrix.tsx`, `app/simulate/page.tsx` | **DONE this pass** — matrix renders, tests green |
| Pillar nav (Simulate · Bank Builder · Moonshot · Today · Results) | S | med (nav tests) | `components/nav.tsx`, `command-rail.tsx`, `nav-active-route.ts` | nav shows 3 pillars; tests updated |
| Sim-first homepage (sport-sim cards + BB/Moonshot pillars; drop stale spotlights) | M | med | `app/page.tsx`, `components/home/*` | homepage leads with simulations; tests pin it |
| Per-sport "Simulation Center" framing on `/mlb` `/world-cup` `/ufc` | S | low | those `page.tsx` eyebrows/heroes | each reads as a sim center |
| Demote `/build`→"Advanced Builder"; fold/retire `/projections`; link `/sports` | S | low | nav + those pages | no orphan/duplicate primary |

## Phase B — Per-sport depth (3-5 days · UI + light modeling, no new feeds)
| item | complexity | risk | data | DoD |
|---|---|---|---|---|
| MLB: surface run/win distributions from the existing 10k artifact | M | low | existing sim artifact | distributions render where artifact exists |
| WC: bracket/"path to final" context + semifinal prominence | M | low | committed schedule/board | bracket visible, TBD honest |
| Model-vs-market panels (all sports) | M | low | existing projections vs lines | panel per game report |
| Methodology badges everywhere (independent/market-anchored/market-implied/experimental) | S | low | `market-coverage.predictionSource` | badge on every read |

## Phase C — Market expansion (1-3 weeks · PAID provider feeds — never fake)
| item | complexity | risk | data source (REQUIRED) | DoD |
|---|---|---|---|---|
| Soccer player props (scorer/shots/assists) | L | med | player-prop odds provider + lineup + settlement | markets go `provider_needed`→`supported`; settled |
| Soccer set pieces (corners/cards) | L | med | set-piece odds + match-event settlement | as above |
| UFC method/round/distance | L | med | MMA method/round odds feed | experimental→market-implied where odds |
| MLB team-totals settlement + F5/alt lines | M | med | team-total settlement source; F5 line feed | `settlement_blocked`→`supported`; product-eligible |

## Phase D — Product-card intelligence (1-2 weeks)
| item | complexity | risk | DoD |
|---|---|---|---|
| Eligibility engine reads `market-coverage.isProductEligible` | M | low | settlement-blocked/experimental markets provably excluded |
| Correlation checks + settlement-source gating for BB/Moonshot | M | med | no correlated/ungradable legs in a card |
| BB approval UX + Moonshot risk disclosure polish | M | low | operator-gated approval flow clear |

## Phase E — Validation & public trust (ongoing)
| item | complexity | data | DoD |
|---|---|---|---|
| Independent soccer goal model + score distribution | XL | historical results | backtested; only then drop "market-implied" |
| Independent MLB full-game sim (replace market-implied) | XL | game logs | backtested win-prob curve |
| Calibration curves + model-vs-market dashboard | M | settled results | per-market calibration public |
| Automated settlement + sample-size disclaimers | M | official feeds | nightly settle on secrets; hit-rate CIs shown |

## Sequencing note
Phases A-B are cheap UI/modeling wins that make the product *feel* FreeSim-level and start now. Phases C-E are the
real depth and require **budget for data providers + validation** — until funded, the coverage matrix keeps every
gap honest instead of faked. Recommend: finish Phase A this week, Phase B next, then pick ONE Phase-C feed to pilot.
