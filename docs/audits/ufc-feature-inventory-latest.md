# UFC Feature Inventory (latest)

| Factor | Source / status |
|---|---|
| Event/date/venue, bouts, fighter names, weight class | **available now** (free ESPN) |
| Main-event/title flags | available from schedule (partial) |
| Winner / method / round / distance odds | needs Odds API MMA ingestion (not wired) |
| Implied probability (de-vig) | derivable once odds ingested |
| Line movement | needs repeated odds captures |
| Record, recent form, days-since-last-fight, short-notice | **needs fighter-stat / history provider** |
| Age, height, reach, stance, camp | needs fighter-stat provider |
| Striking volume/accuracy/defense, SLpM/SApM, KD rate | needs fighter-stat provider |
| Takedown avg/accuracy/defense, sub avg, control time | needs fighter-stat provider |
| Finish/decision rate, KO/sub history, durability/chin | needs historical-result provider |
| Style matchup, reach edge, age curve | derived — needs the above first |
| Results (winner/method/round/time, NC/overturn) | **needs results provider** (ESPN MMA results are free → feasible) |

Only schedule + matchups exist now. Odds are one provider change away; stats and
results/grading are the real gating providers. No factor is fabricated.
