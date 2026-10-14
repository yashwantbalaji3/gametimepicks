# Live acceptance plan — Thursday 2026-10-15 · SEA @ DEN · ESPN event 401872995

**Kickoff:** 2026-10-16T00:15Z = **Thursday 2026-10-15, 8:15 PM ET**. The "Oct 15 vs Oct 16" discrepancy is the same instant in ET and UTC — not two different games.
**Identity validated 2026-10-14:**
- ESPN scoreboard and summary both report event `401872995` as SEA (team 26, away) @ DEN (team 7, home), Empower Field at Mile High, `STATUS_SCHEDULED`, kickoff `2026-10-16T00:15Z`.
- Our `nfl/index.json` carries the same id, canonical `nfl-401872995`, matching kickoff, state `PUBLIC_EXPERIMENTAL`.
**Forecast:** published, `PUBLIC_EXPERIMENTAL`, set generated 2026-10-14T14:31:16Z.

**What is tested:** the CURRENT Production live path (LIVE-F, once #1081 is merged) **and**, read-only alongside it, the Live Hub V2 view model (#1082) fed the same envelopes. V2 is **not** promoted on the strength of this game. The game produces evidence; a separate founder decision follows.

**No paid calls.** The live gateway reads the free ESPN public feed. Nothing is triggered by hand that a schedule would not run.

## Evidence capture (all read-only)
- Every 5 minutes from T−60 min to final + 30 min, then at the canonical-settlement run, record:
  - `GET /api/live?sport=nfl` (the slate envelope);
  - `GET /api/live?sport=nfl&event=401872995&players=true`;
  - the `/live` and `/nfl/game/401872995/` HTML, plus a 390 px and a 1440 px screenshot.
- Keep a hash of the event's frozen forecast rows (board + WM2) taken at T−60 min, and compare it at each capture.

Store the captures under the scratchpad. They become the "real captured fixtures" for V2 lifecycle tests: the envelopes are recorded verbatim, never edited.

## Pass / fail criteria
| # | Check | PASS when | FAIL when |
|---|---|---|---|
| 1 | Forecast frozen before kickoff | `frozenAt`/`generatedAt` < 00:15Z, and the forecast hash is identical at every capture through settlement | Any byte of a frozen row changes, or any displayed freeze time is ≥ kickoff |
| 2 | Kickoff transition | Within ≤ 120 s of the feed reporting in-progress (one 60 s imminent poll plus the 60 s `PRE_IMMINENT` gateway cache), the chip goes **Scheduled → Live**. No "Live" before the feed says so | A "Live" chip before the feed is live, or no transition after 120 s |
| 3 | Score | Each displayed score equals the envelope's `competitors.*.score` at that capture. Before kickoff: "—", never 0 | A mismatch, or a 0 shown before the feed reports one |
| 4 | Quarter and clock | Shown as `Q{n} · {clock}` while live; halftime and end-of-quarter labels pass through; no clock once final | A clock shown after final, or "Q3 · 7:27 · 7:27"-style duplication |
| 5 | Live player stats (receiving yards, receptions, rushing yards) | The value matches the gateway row; any untracked family (passing yards, TDs) says "Not tracked live" | Any stat shown for an unmapped family, or a missing stat rendered as 0 |
| 6 | Frozen vs observed | Each featured row shows the frozen line and the current verified value side by side. The frozen value never changes. V2 `forecastProgress` agrees with the production tracker's state | The frozen value moves with live data, or the V2 and production states disagree |
| 7 | Feed delay and recovery | An envelope ≥ 45 s old shows "Delayed / last confirmed at …"; ≥ 120 s reads stale. Both recover on the next fresh poll | Stale data presented as current, or no recovery |
| 8 | Provisional final | Feed FINAL shows **"Final · grading pending"**, with no period line and no win or loss on any forecast | Any WIN/LOSS/HIT/MISS before settlement |
| 9 | Canonical settlement | After `nfl settlement receipts` runs, the chip shows "Final" and the forecast outcomes appear in the owner's vocabulary. Results and the game page agree | A disagreement between Results, the game page and `/live`, or a pending result counted as a loss |
| 10 | Pregame immutability | Forecast-of-record (Option B) for 401872995 resolves to the pre-kickoff served revision | Any post-kickoff revision becomes the record |
| 11 | Mobile | At 390 px: no horizontal overflow, the report link is ≥ 44 px, the chip and score are visible without scrolling the card | Overflow, clipped score, or a tap target under 44 px |
| 12 | Unsupported sports | NBA/EPL/UFC never appear as tracked on `/live`, and the coverage line reflects the rollout flags | Any untracked sport counted or labelled as live |

## Refresh behaviour (constants from code: `lib/live/freshness.mjs`, `use-live-slate.ts`)
| # | Check | PASS when | FAIL when |
|---|---|---|---|
| 13 | Poll cadence | The client polls every **300 s** before T−2h, every **60 s** from T−2h, every **30 s** in play, and **stops** once every game in the roster is terminal | Polling faster than this (cost), or continuing after every game is final |
| 14 | Freshness bands | The age of the last observation sets the line: **< 45 s** fresh, **< 120 s** "delayed", **≥ 120 s** stale (`FRESH_MAX_MS`, `DELAYED_MAX_MS`) | A stale state shown as fresh, or an age shown that is not being measured |
| 15 | Screen readers | No `aria-live` announcement on each poll; the state is read on demand from the card's summary | A re-announcement every poll |

## Progress rails and tracked rows (`railLandmarks`, `trackForecast`)
| # | Check | PASS when | FAIL when |
|---|---|---|---|
| 16 | Rail landmarks | Each tracked volume row shows the market line, the frozen GameTimePicks value, the range's high end and the live value as distinct markers. Headroom is kept so the live marker never runs off the rail | Markers overlap without labels, the live value is clamped silently, or a frozen marker moves |
| 17 | Over/under semantics | An over reports progress toward the line; an under is never called before the final | An under shown as won or lost mid-game |
| 18 | Touchdowns | Anytime TD reads "Not tracked live · settled from the official box score" until settlement | Any live TD claim |

## Provider failure (observe; never induce on Production)
| # | Check | PASS when | FAIL when |
|---|---|---|---|
| 19 | Gateway refusal or outage | Cards keep the last confirmed state, labelled "Live data temporarily unavailable · showing last known state · Last observed: <ET time>". A game that has started never reverts to "Scheduled" | A started game shown as Scheduled, or blank scores |
| 20 | Recovery | The next successful poll clears the banner and updates state without a reload | A stuck banner, or a reload needed |
| 21 | Per-row feed gaps | A family the gateway did not return reads "unavailable" for that row only | The whole card fails, or a missing stat reads 0 |

If no outage happens naturally, checks 19–21 rely on the recorded-fixture tests (`feed-outage.test.mjs`, the V2 board tests) and are marked **not observed live**. They are never forced on Production.

## Desktop / mobile parity
| # | Check | PASS when |
|---|---|---|
| 22 | Same facts | At 390 and 1440 px, at the same capture time, the chip, score, period, frozen values and live values are identical |
| 23 | Layout | At 390 px the cards stack, there is no horizontal page scroll, every control is ≥ 44 px, and the chip and score are visible without expanding anything |

## Promotion rule (V2)
V2 may be proposed for a founder-approved release only when **all of the following** hold:
- checks 1–12 PASS on this game **and** on one more NFL window (Sunday 10/18);
- V2's mapping of the recorded envelopes reproduces the production states with **0 disagreements**;
- MLB passes the same checks on one postseason game.

NBA, soccer and UFC stay "not tracked live" until their own adapters pass the same plan on real events.
