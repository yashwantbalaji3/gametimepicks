# Live acceptance capture kit (read-only)

This is the evidence capture for the Live Hub V2 acceptance windows:
- `docs/live/LIVE_V2_THURSDAY_ACCEPTANCE.md` holds the 23 checks;
- `docs/live/LIVE_V2_SUNDAY_1018_PLAN.md` is the Sunday run sheet.

The kit reads only:
- our Production gateway and pages;
- ESPN's free public summary, as ground truth;
- `origin/main` via `git`;
- GitHub's Production deployment records via `gh api`.

It never writes to the repo, never triggers a workflow and never calls a paid provider.

| File | What it does |
|---|---|
| `capture.sh` | Takes `--events <espnId,…> --settle-date <ET date>`; no event is hard-coded. **Phase A:** a pass every `--interval` s until `--until`. A pass captures only events inside their window (kickoff −60 min … +270 min, read from the schedule on main). For each such event it saves the event envelope with `players=1`, the game-page HTML and ESPN's summary. When any event is active, the pass also saves the slate, `/live` and `build-info.json`. Screenshots every `--shot-every` passes. **Phase B:** every 30 min, for every event, until settled-and-served or `--settle-until`. `--once` does exactly one pass (dry runs) |
| `git-watch.mjs` | Runs once per pass, from git/GitHub only. Per event it writes the frozen fingerprint (forecast, board, receipts, committed live-props summary). It also emits a `settlement` line covering: the market paper record state; the live-props phase/finality; the prop-settlement ledger counts; the **first** commit where live-props reads FINAL and the first where it reads CANONICAL; and whether Production serves each, by this pass's build-info and by the first successful GitHub Production deployment containing it |
| `shot.mjs` | Screenshots `/live` and each active game page at 390 and 1440 px (Playwright from `app/`). Per shot it records horizontal overflow, broken visible images and headshot/logo counts |
| `report.mjs` | Builds a per-event lifecycle timeline and its checks. Covered: states, score vs ESPN, **envelope player stats vs ESPN's box score** at the same pass (strict at the final), the frozen forecast and board from kickoff, live-props, provisional/canonical served, and ledger counts. A capture-wide **Missing or incomplete evidence** list covers non-200s, bot challenges, offline passes, gaps, late passes, failed screenshots and an unclean finish. It tolerates malformed lines: the 2026-10-15 kit's `"http":000` lines are repaired and listed |
| `kit.test.mjs` | Offline self-test: `node --test docs/live/capture/kit.test.mjs`. Bases point at a closed port; no fetch; no GitHub. Covers argument refusal, valid JSON for failed requests, the one-pass mode, malformed-line tolerance, and the settle-and-served stop replayed on SEA @ DEN |

## Request records
Every request is one JSON line:

```
{"t":"20261018T171500Z","name":"event","event":"401873000","http":200,"bytes":5321,"file":"…","mitigated":"","error":null}
```

- `http` is always a number; `0` means no response.
- `error` carries curl's reason.
- `mitigated: "challenge"` is Vercel bot mitigation: absence of evidence, not a site failure (`docs/VERCEL_BOT_CHALLENGE_VERIFICATION_CONTRACT.md`).
- A pass where **every** host, ESPN included, gave no response is reported as local connectivity loss.

## Settlement: what is watched, and why
The market paper record `data/internal/nfl/settlement/<date>.json` grades the pinned market consensus. Since the odds credit ceiling (2026-10-11), every event there reads `pending: NO_TARGETS`, so on its own it can never end a watch. That is how the 2026-10-15 run missed the settlement.

The kit therefore watches the record that settles the published predictions:
- the live-props artifact `app/public/data/nfl/live-props/<id>.json` (PROVISIONAL, then CANONICAL);
- the ledger `data/internal/nfl/prop-settlement/<date>.json`.

Phase B ends after the second consecutive pass on which every event's CANONICAL commit is served.

## Stop / interruption
- `capture.pid` in the output folder holds the shell's pid.
- `kill -TERM "$(cat …/capture.pid)"` writes a `stopped` line and exits. Then run `node report.mjs <dir>` by hand.
- A run with neither `finished` nor `stopped` was killed hard (SIGKILL, sleep or shutdown). The report says so.

## Dry run 2026-10-16T20:20Z (`--once`, HOU @ JAX 401872996, PRE)
- 6/6 requests 200, 0 mitigated;
- 4 screenshots, 0 px overflow, 0 broken images; game page 81 headshots / 63 logos;
- settlement line written (`no-file-yet`; no live-props yet);
- report written, listing LIVE and FINAL as not yet observed.
