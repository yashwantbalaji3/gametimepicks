# June 21 — Current Status + Blocker Audit (forensic, no fixes)

**Audit time:** Sunday June 21 2026, ~7:00 PM ET (23:00 UTC)
**Branch:** `june21-current-status-blocker-audit` (off `main` @ `360625a` = PR #551)
**Production commit:** `360625a` (#551), built/generated ~8:04–8:11 AM ET.
**Scope:** read-only forensic audit. **No cards placed, no slate published, no production changes.**

## Working-tree note (handled)
On entry the tree was **dirty** with uncommitted, never-deployed work from the prior "force-publish"
task (a 9am data re-pull + Lane A/B active edits; the Moonshot script had errored; Mr.Dub was never
rebuilt, so the tree was internally inconsistent). None of it was committed or deployed. Per the
"stop if dirty" rule it was captured and **`git reset --hard` to `360625a`** (the live commit) before
auditing. **Production was never touched by that work.** Notably, those would-be Lane A legs included
**Belgium ML, which finished 0-0 (a draw → would have LOST)** — pausing to audit avoided shipping a
losing Lane A.

## Bottom line
**The live site is trust-correct** (bankroll, exposure, record, crown, and contamination are all
right). The earlier Japan/Egypt screenshot is a long-reverted state and is **not** on production. The
one real blocker is **freshness**: production is an ~8 AM static snapshot, and at 7 PM it still shows
finished/in-progress June 21 games as a pre-event "Pregame slate."

## Verified state (local == live, both `360625a`)

| area | value | status |
|---|---|---|
| Domains `/bank-builder` | both 200 (gametime-picks.vercel.app + gametimepicks.yashwantbalaji.com) | ✅ |
| Mr. Dub bankroll | **$10,176.17** | ✅ correct |
| Open exposure / total | **$0 / $0** | ✅ correct |
| Record | **8-2-0-0** | ✅ correct |
| Crown | **$10,376.17** | ✅ protected |
| Lane A | advanced · Step 3 **awaiting** (no active card; legs shown are the settled USA+Gonzales history) | ✅ no exposure |
| Lane B | stopped · awaiting qualified June 21 restart (candidate-only) | ✅ no exposure |
| Moonshot | stopped · restart candidate surfaced (not active) | ✅ no exposure |
| Contamination (Japan/Egypt/Tunisia active) | **none** in any live artifact | ✅ clean |
| API keys (local `.env`) | ODDS_API_KEY ··2a97, API_FOOTBALL_KEY ··c7fa | ✅ present |

## Game status (API-Football, live at 7 PM ET)

| game | kickoff ET | status | result |
|---|---|---|---|
| Tunisia vs Japan | 12:00 AM | **FT** | 0-4 (Japan) |
| Spain vs Saudi Arabia | 12:00 PM | **FT** | 4-0 |
| Belgium vs Iran | 3:00 PM | **FT** | 0-0 (draw) |
| Uruguay vs Cape Verde | 6:00 PM | **HT (live)** | 2-1 |
| New Zealand vs Egypt | 9:00 PM | **not started** | pre-event |

## Freshness mismatch (the blocker)
The live data was generated at **8:04–8:11 AM ET**. The 5 live World Cup Specials reference
**Spain (now FT 4-0), Belgium (now FT 0-0), Uruguay (now HT), and NZ/Egypt (pre-event)** — i.e. 4 of
5 games are finished/in-progress but are still presented as pre-event longshots. The live `/today`
still renders the **"Pregame slate"** badge. The same staleness applies to the coverage matrix (101,
8 AM) and suggested parlays.

## Blocker list

| id | severity | surface | evidence | root cause | fix now? |
|---|---|---|---|---|---|
| B1 | **P1** | World Cup Specials, /picks, /parlays, /today badge | 5 Specials + matrix built 8 AM; 4/5 games now FT/live; badge says "Pregame slate" | static snapshot not refreshed intraday; built when all games were pre-event | recommend, on approval |
| B2 | **P1** | Results | June 21 FT games (Spain 4-0, Belgium 0-0, Tunisia/Japan 0-4) not yet shown as settled official results | no intraday settle since 8 AM | recommend, on approval |
| B3 | **P2** | automation | GH Actions lineup-refresh is dormant (no repo secrets); a separate nightly-settle cron ran 5:06/6:53 AM only | operator must add `ODDS_API_KEY`+`API_FOOTBALL_KEY` as **repo secrets** for intraday auto-refresh | operator follow-up |
| B4 | **P3** | Bank Builder | Lane A/B/Moonshot honest "awaiting/candidate" — correct, but reads as inactive on a favorite-heavy slate | favorite-heavy June 21 + candidate-only-by-design | none (working as intended) |

**No P0.** Bankroll, exposure, record, crown, and contamination are all correct on production.

## Why the weekend felt unstable (root cause)
1. **Rapid successive revisions** (#548 placed Japan/Egypt → #549 removed → #550 ledger source-of-truth
   fix → #551 live June 21 data). The operator saw intermediate states between deploys (the screenshots).
2. **Static-snapshot model:** the site is a build-time export. Without an intraday refresh, a morning
   build goes stale as games play out (today's 8 AM → 7 PM gap).
3. **Dormant intraday automation:** the lineup-aware GH Action can't run (no repo secrets), so nothing
   re-pulls/re-gates during the day.
4. A real ledger bug (phantom Lane B `coming_soon` losses) was found + fixed in #550 — that was the
   "$9,876.17 vs $10,176.17" confusion; it is now correct.

## Recommended fix order (for approval — not executed)
1. **B1+B2 (P1):** refresh the June 21 slate to current reality — settle the 3 FT games to Results
   (official scores), re-gate started/live games so they are no longer shown as pre-event, and rebuild
   Specials/coverage to the remaining pre-event content (only NZ/Egypt → an honest "one game remaining /
   between slates" state, likely 0 multi-game Specials). **No Bank Builder/Moonshot cards placed.** No
   bankroll/Mr.Dub impact (nothing was riding on these games).
2. **B3 (P2, operator):** add the two API keys as GitHub repo secrets + enable the intraday refresh so
   the slate self-updates and this staleness stops recurring.
3. Going forward: make fewer, reviewed deploys per day; let the automation handle intraday freshness.

## Production decision
**Leave production as-is until the fix is approved.** It is trust-correct to show (money/record correct,
no contamination); the only caveat is the stale "pre-event" framing of games that have finished today.
