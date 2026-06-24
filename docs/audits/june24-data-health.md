# June 24 Data Health Audit

## MLB (✅ healthy)
| Feed | Source | Freshness | Completeness |
|---|---|---|---|
| Games / schedule | The Odds API `/events` | June 24 (fresh) | 12 games |
| Odds / props | The Odds API `/events/{id}/odds` | June 24 (fresh) | 771 props (326 HR) |
| Player mappings | MLB Stats API (free) | fresh | 771/771 matched (100%) |
| Headshots | midfield.mlbstatic | fresh | 100% on matched |
| Opponent/team logos | ESPN + statsapi teams | fresh | 768/771 opponents resolved |

## World Cup (⚠️ June 24 inputs not generated)
| Feed | Source | Freshness | Note |
|---|---|---|---|
| Fixtures | ESPN/FIFA schedule.json | static (6 June 24 matches present) | OK |
| Odds | API-Football (key present) | **not fetched for June 24** | needs odds-discovery run |
| Player markets | API-Football | not fetched | needs run |
| Team mappings | statsapi teams | OK | accent/alias handling proven |

## Confidence
- MLB June 24 board: **high** (real Odds API + 100% statsapi enrichment).
- WC June 24: inputs exist (fixtures + key) but projections/odds not yet generated → products data-gated.
