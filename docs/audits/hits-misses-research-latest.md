# Hits & Misses Research — settled data (auto-generated)

> `audit-hits-misses-research.mjs --write-report` · READ-ONLY · settled-only · no paid API · no fabrication.
> Rates show raw% (wins/decisive) and a Wilson 95% lower bound (`lo`) so small samples aren't over-read.

## MLB (settled leaned picks)
### By market
| key | hit% | wins/decisive | Wilson lo |
|---|---:|---:|---:|
| batter_hits | 53.0% | 1571/2964 | 51% |
| batter_hits_runs_rbis | 49.6% | 943/1903 | 47% |
| batter_total_bases | 42.9% | 525/1224 | 40% |
| pitcher_strikeouts | 47.2% | 161/341 | 42% |

### By odds band
| key | hit% | wins/decisive | Wilson lo |
|---|---:|---:|---:|
| favorite | 55.8% | 1063/1904 | 54% |
| plus_money | 41.5% | 781/1881 | 39% |
| mild_fav | 50.1% | 460/919 | 47% |
| heavy_fav | 67.5% | 520/770 | 64% |
| near_even | 44.0% | 217/493 | 40% |
| high_plus | 34.2% | 159/465 | 30% |

### By side
| key | hit% | wins/decisive | Wilson lo |
|---|---:|---:|---:|
| over | 50.1% | 2351/4697 | 49% |
| under | 48.9% | 849/1735 | 47% |

### By confidence
| key | hit% | wins/decisive | Wilson lo |
|---|---:|---:|---:|
| High | 48.6% | 1383/2846 | 47% |
| Low | 50.4% | 1333/2643 | 49% |
| Medium | 51.3% | 484/943 | 48% |

### Hitter vs pitcher
| key | hit% | wins/decisive | Wilson lo |
|---|---:|---:|---:|
| batter | 49.9% | 3039/6091 | 49% |
| pitcher | 47.2% | 161/341 | 42% |

### By last-5 bucket
| key | hit% | wins/decisive | Wilson lo |
|---|---:|---:|---:|
| L5_3of5 | 50.5% | 1111/2200 | 48% |
| L5_2of5 | 46.2% | 736/1592 | 44% |
| L5_4of5 | 51.9% | 736/1419 | 49% |
| L5_1of5 | 45.3% | 302/666 | 42% |
| L5_5of5 | 59.4% | 272/458 | 55% |
| L5_0of5 | 44.3% | 43/97 | 35% |

## NBA (settled leaned picks)
### By market
| key | hit% | wins/decisive | Wilson lo |
|---|---:|---:|---:|
| PTS | 53.7% | 522/972 | 51% |
| REB | 55.6% | 486/874 | 52% |
| AST | 44.5% | 335/753 | 41% |

### By side
| key | hit% | wins/decisive | Wilson lo |
|---|---:|---:|---:|
| over | 50.5% | 863/1709 | 48% |
| under | 53.9% | 480/890 | 51% |

### By confidence
| key | hit% | wins/decisive | Wilson lo |
|---|---:|---:|---:|
| High | 51.1% | 860/1682 | 49% |
| insufficient_data | 47.0% | 158/336 | 42% |
| Low | 55.9% | 171/306 | 50% |
| Medium | 56.0% | 154/275 | 50% |

## Card-level (optimizer-graded)
- cards decided: **774** · won **109** (14.1%) · lost-by-1-leg **301** · lost-by-2+ **364**
- of losing cards, **45.3%** lost by exactly one leg
- top single-leg killer markets: batter_hits (126), PTS (39), batter_total_bases (39), AST (31), batter_hits_runs_rbis (29), REB (22), pitcher_strikeouts (15)

*Read-only research. Market-reliability artifact: `app/public/data/audit/market-reliability.json` (shrunk to 0.5, k=60, sample floor 100).*