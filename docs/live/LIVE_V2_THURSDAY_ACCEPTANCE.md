# Live acceptance plan — Thursday 2026-10-15 · SEA @ DEN · ESPN event 401872995

**Kickoff:** 2026-10-16T00:15Z (Thu 8:15 PM ET).
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
| 2 | Kickoff transition | Within one poll (≤ 60 s) of the feed reporting in-progress, the chip goes **Scheduled → Live**. No "Live" before the feed says so | A "Live" chip before the feed is live, or a missed transition for more than 2 polls |
| 3 | Score | Each displayed score equals the envelope's `competitors.*.score` at that capture. Before kickoff: "—", never 0 | A mismatch, or a 0 shown before the feed reports one |
| 4 | Quarter and clock | Shown as `Q{n} · {clock}` while live; halftime and end-of-quarter labels pass through; no clock once final | A clock shown after final, or "Q3 · 7:27 · 7:27"-style duplication |
| 5 | Live player stats (receiving yards, receptions, rushing yards) | The value matches the gateway row; any untracked family (passing yards, TDs) says "Not tracked live" | Any stat shown for an unmapped family, or a missing stat rendered as 0 |
| 6 | Frozen vs observed | Each featured row shows the frozen line and the current verified value side by side. The frozen value never changes. V2 `forecastProgress` agrees with the production tracker's state | The frozen value moves with live data, or the V2 and production states disagree |
| 7 | Feed delay and recovery | A stale envelope (> 90 s) shows "Delayed / last confirmed at …" and recovers on the next fresh poll | Stale data presented as current, or no recovery |
| 8 | Provisional final | Feed FINAL shows **"Final · grading pending"**, with no period line and no win or loss on any forecast | Any WIN/LOSS/HIT/MISS before settlement |
| 9 | Canonical settlement | After `nfl settlement receipts` runs, the chip shows "Final" and the forecast outcomes appear in the owner's vocabulary. Results and the game page agree | A disagreement between Results, the game page and `/live`, or a pending result counted as a loss |
| 10 | Pregame immutability | Forecast-of-record (Option B) for 401872995 resolves to the pre-kickoff served revision | Any post-kickoff revision becomes the record |
| 11 | Mobile | At 390 px: no horizontal overflow, the report link is ≥ 44 px, the chip and score are visible without scrolling the card | Overflow, clipped score, or a tap target under 44 px |
| 12 | Unsupported sports | NBA/EPL/UFC never appear as tracked on `/live`, and the coverage line reflects the rollout flags | Any untracked sport counted or labelled as live |

## Promotion rule (V2)
V2 may be proposed for a founder-approved release only when **all of the following** hold:
- checks 1–12 PASS on this game **and** on one more NFL window (Sunday 10/18);
- V2's mapping of the recorded envelopes reproduces the production states with **0 disagreements**;
- MLB passes the same checks on one postseason game.

NBA, soccer and UFC stay "not tracked live" until their own adapters pass the same plan on real events.
