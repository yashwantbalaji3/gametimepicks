# Morning briefing: CEO Command Center, 2026-10-28

> **Date reconciled 2026-10-28 (founder request).** This briefing was first filed as `morning-briefing-2026-10-29.md`. The work ran overnight from Tuesday Oct 27 to Wednesday Oct 28, US Eastern, and the briefing is for the morning of **Wednesday Oct 28 ET**. The earlier "Oct 28" run labels used UTC dates; they are corrected to Eastern below. The ledger's own timestamps are UTC and unchanged. The commit that added the file (`170bb9cbb5`) keeps its original subject.

Everything below was checked overnight against the code, the console's ledger and the committed data. Nothing was pushed, deployed, published, bought or connected. No Claude Code run was started.

## 1. Where things stand

**Committed locally** (feature branch `claude/gametimepicks-ceo-agent-center-4d5fd3`; not pushed):

| Commit | What |
|---|---|
| `08e915d6a7` | Phase 1 local console and NFL recap proof of concept |
| `03c76d92cd` + `4b8504c4c3` | M2: real ChatGPT → Claude Code engineering through G1–G3 |
| `e72fc5c53a` | H0 hosting readiness: passkeys, Postgres ledger, jobs, worker, deploy templates |
| `a3a66a5bb0` | Provider layer and Grok → ChatGPT → Claude Code team workflows |
| `cb42b92d26` | First three-agent run preparation and the evidence tool |
| `d86361dce2` | **Overnight checkpoint:** five-sport calendar, the recap favourite fix, the export-hash fix, a fail-closed data guard |

**Tests:** 94/94 pass, also with all network blocked. They cover M2, hosted auth and security, database roles, evidence integrity, the calendar, and the iPhone 390/430 layouts.

**Local only:** everything. The console runs at http://127.0.0.1:4190 ("CEO console" terminal tab). The hosted path is built and tested but not deployed.

**Provider integrations:**

| Provider | Genuinely operational | Manual | Built, tested on stubs only, not connected |
|---|---|---|---|
| Claude Code | **Yes**: the CLI on your Mac with your Max subscription. Real runs: M2, and the Oct 27 (11:22 PM ET) content-plan review (Sonnet, 2 turns, ≈ $0.10 estimated of your allowance, preflight claude.ai · max) | — | The hosted worker (`CLAUDE_CODE_OAUTH_TOKEN`, CP-H2) |
| ChatGPT | — | **Yes**: your app, copy/paste. 5 real contributions so far (3 engineering specs, the NFL plan, the calendar) | OpenAI API adapter (CP-O1) |
| Grok | — | **Yes**: your app, copy/paste. 1 real research round (5 NFL findings, 10 cited posts) | xAI API adapter with X Search (CP-X1) |

**Proof from the ledger** (`node orchestrator/team-evidence.mjs <commandId>`): the Oct 27 (11:22 PM ET) content-plan run `cmd-a2f77c554c33` has genuine Grok, ChatGPT and Claude Code contributions in one workflow. Every hand-off check passes and nothing is simulated.

**Decisions:** none open.
- The obsolete G2 (`gate-ade48ed08d41`) is recorded as **rejected**, and its working copy was removed.
- The NFL plan (`prop-57dca528ad75`) is **revise**, with your note.
- The calendar (`prop-d736a234523a`) is **approved as a draft**.
- The only `cc/` working copy left is M2's kept change (`cc/4a57532d-mvreil4t`), retained by the earlier D6 decision.

**The approved calendar is saved correctly:**
- It lives in the ledger, and its approval digest recomputes exactly from the stored calendar: 87 opportunities, 28 chosen, 0 draft problems.
- Its Markdown export is `out/console/strategies/cmd-4dac0382737d.md`. The export's *recorded* hash used the wrong convention: the hash of the JSON-encoded text, not of the file bytes. The content was intact; this is fixed and tested for new exports. The old record stays as written, because the ledger is append-only.

## 2. Verified or fixed overnight

1. **The recap favourite fix renders correctly.** SF @ ATL (an away pick) rebuilt through the real pipeline shows "70.6% San Francisco 49ers to win" and "Forecast missed: San Francisco 49ers lost". Both captions pass the validator.
2. **Export hashes** now match `shasum -a 256` of the file.
3. **Fail-closed data guard.** On the hosted worker, the calendar's data source would have pointed at the private repo and produced an *empty* calendar silently. It now refuses with a clear error unless `GTP_CC_DATA_REPO` / `GTP_CC_DATA_REF` point at the public GameTimePicks data.
4. **Earlier NFL plan run.** The facts ChatGPT received in the Oct 27 (11:22 PM ET) NFL plan run named the wrong favourite for 5 games (PIT@NO, CLE@TEN, SF@ATL, DEN@ARI, LAR@LV). That plan's game-specific claims should not be reused without re-checking them. The calendar run used the corrected facts.
5. **Terminology (resolved 2026-10-28, see [d1-daily-content-queue.md](d1-daily-content-queue.md) §2).** The recap card's headline reads "Official Forecast vs Final" while the capability registry classifies NFL as EXPERIMENTAL_PUBLIC. The authoritative public registry (`app/src/lib/public-registry.ts`) answers it: "Official Forecast" is the public term for NFL's published forecast, and EXPERIMENTAL_PUBLIC means it is not product-eligible. The headline stays. The per-card "Experimental model" footer is replaced by the registry's Model Performance sentence.

## 3. Five-sport content readiness

**The 28 chosen opportunities:** 8 READY, 20 NEEDS_VERIFICATION, 0 BLOCKED.

| Sport | Chosen | Data at the pinned commit | Forecast class | Graphic | Caption generator | Grok research |
|---|---|---|---|---|---|---|
| NFL | 10 (2 ready) | schedule, daily forecasts, results, ledger | experimental (`EXPERIMENTAL_PUBLIC`) | ✓ recap card | ✓ templates + validator | ✓ one round |
| NBA | 7 (1 ready) | schedule, finals record | **none** (`HISTORICAL_ONLY`) | ✗ | ✗ | ✗ |
| MLB | 4 (2 ready) | StatsAPI schedule (**captured Oct 25, stale**), official predictions, ledger | official (`FULL_MODEL`) | ✗ | ✗ | ✗ |
| UFC | 2 (1 ready) | Oct 31 card | **none** (`SCAFFOLD_ONLY`) | ✗ | ✗ | ✗ |
| EPL | 5 (2 ready) | fixtures with model-only 1X2 forecasts, results, ledger | experimental | ✗ | ✗ | ✗ |

**Supported by verified canonical data (READY):** the four catch-up recaps:
- NFL: 13 results, all with our forecast;
- NBA: 16 finals, results only;
- MLB: 1 result with our forecast;
- EPL: 5 results, 4 with forecasts.

Plus the explainers for NFL, MLB, UFC and EPL.

**Needs verification (20):**
- Every pregame forecast: a snapshot isn't the forecast of record until frozen at start.
- Every schedule-based engagement post: confirm on the day.
- The two NFL X-conversation replies: Grok's cited posts haven't been opened by the system.
- MLB: a stale schedule capture.

**Blocked, and therefore not chosen:**
- NBA and UFC forecast content: no validated forecast exists.
- Recaps of games that haven't happened yet.
- Live updates: no authorized publisher.
- X research for the four non-NFL sports.

**Producible today without engineering:**
- **NFL Week 7 recap cards + two validated captions per game** for any of the 12 gate-passed Oct 25 games: `node command-center/recap/run-recap.mjs --event <id>`, or the recap command in the console for one game.
- **The 4 explainer posts:** their ChatGPT drafts are number-free and pass the checks.
- **Engagement posts:** drafts exist; they need your same-day schedule check.

**Not producible yet:**
- **NBA, MLB and EPL recap posts with actual numbers.** The data is verified, but ChatGPT's calendar drafts are placeholders ("we're reviewing…"), and no step yet asks for a specific, fact-checked post per slot. That is D1 below.
- **Any non-NFL graphic.**

**To bring NBA, MLB, UFC and EPL to NFL's standard:**
1. A result-card template per sport. NBA and EPL first; MLB's season ends this week.
2. Per-sport caption templates and validators, reusing `checkDraft`.
3. A Grok research round per sport ($0, manual).
4. A freeze-time check for pregame posts (NFL, EPL, MLB).
5. NBA and UFC forecasts are **not** Command Center work: they wait on the GameTimePicks model roadmap.

## 4. Agent integration roadmap

Three different things, often confused:
- **Manual handoff (works today, $0):** you run the prompt in the provider's own app and paste the answer. Real provider output, but every step needs you.
- **Account-based connector (MCP):** the provider's app calls *our* Command Center tools, so no copy/paste. It needs the hosted Command Center with a connector endpoint (H1.5). Grok's custom connectors are "available to all Grok users"; ChatGPT write-actions on individual plans are **unverified**. You still start each session in the app; there is no API billing.
- **Paid API:** the Command Center calls the provider unattended, billed per use from a prepaid balance. **ChatGPT Plus does not include OpenAI API use, and a Grok or X account does not include xAI API use.** Each needs its own account and credit (CP-O1, CP-X1).

| Step | Grok | ChatGPT | Claude Code |
|---|---|---|---|
| Now | Manual research rounds (expand to NBA, MLB, UFC, EPL) | Manual: strategy, calendar, per-post copy | CLI on your Mac: reviews and engineering (G1–G3) |
| After H1 (hosted) | Manual from the iPhone | Manual from the iPhone | Hosted worker after CP-H2 |
| After H1.5 | Connector: Grok reads tasks, submits findings | Connector, if your plan allows write tools | — |
| After CP-X1 / CP-O1 | API with X Search, capped | API, capped | — |

## 5. The next increment: D1, daily content queue

The smallest step from "approved calendar" to "content you can actually post". It reuses the recap pipeline, `checkDraft`, the digest-bound decisions, the publisher boundary and the evidence tool.

1. **Produce:** on an approved calendar slot, build a post package.
   - **NFL recap:** the existing card and captions, per game.
   - **Other READY slots:** a ChatGPT paste checked against that slot's facts.
   - **Pregame slots:** a freeze-time check that turns NEEDS_VERIFICATION into READY only when the number matches the forecast of record.
2. **One decision per post:** approve, revise, reject or defer, bound to the exact caption, graphic and facts. Approving the calendar never approves a post.
3. **Status tracking:** drafted → approved → scheduled → published / rejected.
4. **Published = a manual-handoff receipt.** You post it yourself on X and paste the post URL; the URL is validated and recorded. This is the $0 "manual-handoff" publisher already named in the CP2 candidates. No X API, no automation.
5. **Engagement:** manual numbers you enter, clearly labelled. X analytics only after CP2.

D1 is local engineering only. It needs your go-ahead to implement, but no account, spend or external change.

## 6. Hosting readiness (team.gametimepicks.yashwantbalaji.com)

**Unchanged:** the CP-H1 founder steps in [h0-hosting-readiness.md](h0-hosting-readiness.md):
- private repo;
- Neon;
- `migrate.mjs --roles`;
- setup token;
- a dispatch token limited to Actions;
- the Vercel project with On-Demand Concurrent Builds off and a firewall rate-limit;
- the CNAME;
- passkey registration.

**Still unverified until real accounts exist:**
- the Neon driver;
- the Vercel `{ fetch }` entry;
- `workflow_dispatch` run ids;
- the worker's sandbox self-test on a real GitHub runner;
- free-tier limits on your accounts.

**New gaps found overnight (to fix at CP-H1, local work):**
1. The worker's sparse checkout of the public repo doesn't include the five-sport data paths or the capability registry.
2. The calendar facts need a git checkout of the public data with history (`GTP_CC_DATA_REPO`).
3. Recap rendering on the runner is untested: Chromium is installed by the workflow, but brand fonts on Linux are unverified.

Until these are fixed, the data guard makes the hosted calendar fail loudly instead of returning an empty result.

**Release-blocking security checks still to run on the live deployment:**
- passkey login, step-up and Pause/Stop;
- headers and CSP;
- forged-approval refusal;
- the database role and row-level-security checks against Neon;
- the sandbox canary on a real runner.

**Genuine blockers:** only your CP-H1 setup and approval to push and deploy. No provider connection is needed for H1.

## 7. Three highest-priority engineering tasks

| # | Task | Why now | Local, or needs authorization |
|---|---|---|---|
| 1 | **D1 daily content queue** with manual-handoff publishing receipts | Turns the approved calendar into postable, tracked content | Local; needs your go-ahead |
| 2 | **Result cards and caption templates for NBA and EPL** (MLB optional: season ends) | NBA has the most events and EPL has forecasts with results; NFL is the only sport with a graphic today | Local; needs your go-ahead (or route as an M2 task through G1–G3 if you want Claude Code to build it) |
| 3 | **Freeze-time verifier for pregame posts** (NFL, EPL, MLB) | 8 of the 20 chosen needs-verification slots are pregame forecasts (10 are same-day schedule checks, 2 are X replies) | Local; needs your go-ahead |

**Recommended next milestone: D1 + task 3 together.** That gives a daily queue in which NFL recaps and pregame posts can actually reach READY, with per-post approval and manual publishing receipts. Task 2 follows, so other sports get graphics.

## 8. Exact founder actions

| Action | Type | Effort |
|---|---|---|
| Say "go" on D1 + the freeze-time verifier (or choose differently) | Approval of local work | 1 minute |
| ~~Decide the card headline~~: resolved from the public registry on 2026-10-28 (keep "Official Forecast"; disclosure via Model Performance) | Done | — |
| Don't reuse the Oct 27 NFL plan's game-specific numbers without re-checking (wrong favourite for 5 games) | Awareness | — |
| Optional: run Grok research rounds for NBA, MLB, UFC and EPL in the console ($0, manual) | Manual handoff | ~10 min |
| Optional: post the four READY explainers and one NFL recap card by hand after reading them | Your publishing decision | ~10 min |
| When ready: CP-H1 hosting setup and approval to push and deploy | External, needs authorization | ~45 min |
| Later: CP2 publisher choice; CP-X1 / CP-O1 API accounts | External, spend | — |

## 9. Unresolved risks

- **Data freshness:** the calendar reads the latest *fetched* `origin/main`. Run `git fetch` first, or forecasts and schedules lag. MLB's schedule capture is from Oct 25.
- **MLB's season ends this week:** little value in MLB-specific engineering now.
- **No validated NBA or UFC forecasts:** content for those sports is results, schedules and explainers only, by design.
- **Manual provenance:** the ledger proves what was pasted and when, not which app wrote it.
- **Local console approvals are demo-grade** (loopback). Passkey step-up arrives with hosting.
- **X links are not opened by the system.** Every reply needs your check.
- ~~The "Official Forecast" headline on an experimental model~~: resolved from the public registry (see §2 and the D1 doc).
