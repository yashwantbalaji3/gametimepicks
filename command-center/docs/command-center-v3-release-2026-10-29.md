# Command Center v3: release report (2026-10-29)

**Live:** `https://team.gametimepicks.yashwantbalaji.com` (Vercel `gtp-team`).
**Builds:** each push to `gtp-ops` `main` is one build of about 10 s.
**Publishing:** the Mac stays the only live X sender. No X post was sent and nothing was bought.

## 1. UX audit (before)

The audit used real browsers on a local copy of the hosted code with your migrated data (785 posts, 12 X receipts). Screenshots are in `command-center/out/ux-audit/before/` and `…/after/`, and their numbers in each folder's `report.json`.

| # | Defect | Evidence |
|---|---|---|
| 1 | The header contradicted reality | "DRY RUN · BUDGET $0 · PUBLISHER: MOCK · PUBLISHING ENABLED (MOCK) · DEMO-GRADE APPROVALS", while the ledger had live mode, $0.54 of $5 spent and 12 X API receipts |
| 2 | The Queue was squeezed into a side column | At 1440 px the Queue was 388 px wide beside a 1,020 px chat transcript |
| 3 | Post cards were huge | Tallest card 1,521 px; evidence, warnings, engagement inputs and actions all stacked together |
| 4 | Status walls before content | The first full screen of the phone Queue was design and publisher status text in monospace, with no posts |
| 5 | Tablet was one endless page | At 768 px there were no tabs, and the page was 32,417 px tall |
| 6 | Stale wording | "Nothing is published by the Command Center: you post each approved draft yourself" in reports; "Published by you" / "Posted by you" on posts sent through the X API; "Enabled — mock publisher only" |
| 7 | No place for the daily overview, publishing management or results | Six tabs were organised around developer artifacts (Chat, Queue, Approvals, Tasks, Activity, Team) |

## 2. New structure

**Navigation:**
- Wide screens: a sidebar.
- Phones and tablets: a bottom bar with **Overview · Review · Publishing · Reports** plus **More** (Calendar · AI Team · Operations).
- One section at a time. A sticky top bar shows the true status: the live sender, X mode and spend, and Pause.

| Section | What it does |
|---|---|
| **Overview** | Today's date and the live-sender sentence. Tiles for posts needing a decision, approved but not sent, sent (today / month / all time), problems, and X spend against the cap. Also: next deadlines, today's slate (events only), publishing summary, latest results, AI team activity. "Prepare today's queue" appears when nothing has been prepared |
| **Review** | Compact cards (thumbnail, sport, kind, tip and post times, predicted winner, two-line caption preview, one status). Filters by state and sport. A card expands in place: swipeable full-screen gallery, caption choice and editing, the **same** Approve / Revise / Reject / Defer and publishing controls, evidence and provenance folded under "Details", and Previous / Next to review a slate without scrolling back |
| **Calendar** | Week and day views, sport filter, each post with its time and state; tap to open it in Review |
| **Publishing** | Live sender, mode, spend against the cap, sent count (API vs manual), problems. Alerts with Acknowledge. Jobs by state (scheduled / sent / problems / dry runs / manual) with X links, Cancel and Reconcile. Controls: Pause, Connect X, the dry-run switch, the hand-off, and daily preparation (live sender only) |
| **Reports** | Predicted winner vs final, from the ledger only, with denominators and a "small sample" label. Player projections honestly marked "not evaluated" (no verified box scores yet). Engagement as you entered it |
| **AI Team** | The conversation with the team. Each agent with its true connection: Claude Code / ChatGPT / Grok are **manual hand-off** today, and the API and connector routes are **not configured**. Current tasks; agent proposals and gates |
| **Operations** | Account, passkeys, recovery codes, people and roles, Claude Code billing and preflight, providers and seats, full activity history |

**Safety:** nothing behind an action changed. Approvals still bind the exact caption, images and data (digest). Step-ups, roles, once-only claims, no sending after the start time, pause and the single-sender rule are untouched. The browser and server step-up lists are compared by a test.

## 3. Implemented this release

- **The v3 interface** (`surfaces/console/app.js`, `index.html`, `styles.css`):
  - honest status wording;
  - the phone bottom bar;
  - full-screen gallery with swipe and arrow keys;
  - the card you just acted on stays open;
  - day sections stay open across refreshes;
  - scroll padding so controls never hide under the top bar;
  - phone tables become stacked rows.
- **Opt-in daily queue preparation:**
  - ledger kinds `queue-prep` and `queue-prep-run`; claim `queue-prep|<ET date>`;
  - only the live sender prepares, once per Eastern day, not while paused;
  - the scheduler actor may issue only that command;
  - the hosted cron and the Mac tick both call it;
  - failures raise an alert;
  - off by default (§8).
- **"Predicted winner vs final" results graphic** (`gtp-social-results@1.0`):
  - recomputed from committed data (Oct 28: 8 of 12);
  - misses as visible as hits; the sample size and a "not a long-term accuracy claim" line are on the card;
  - two validated captions. **Unapproved, and not in the queue yet** (§7).
- **Cloud plumbing:**
  - Claude Code CLI pinned in `cc-worker.yml`; a test rejects unpinned installs;
  - the migration now carries engineering screenshots;
  - provision-db denies the new ledger kinds to the worker and publisher roles.

## 4. Capability readiness

| Capability | Status |
|---|---|
| Hosted app, passkeys, roles, recovery codes | **Working** (founder-verified on iPhone) |
| Review / approve from phone and desktop | **Working.** Approvals on the hosted copy reach the Mac only after `sync-ledger --to-local` until the cutover |
| Historical records and X receipts | **Working** (12 receipts, 2,131 entries migrated and verified) |
| Private media (Blob), retention, backups | **Working** (tested). Retention and backups run by hand |
| Publisher workflow on GitHub Actions | **Verified, sends nothing:** run 40913004388 passed every step under the publisher's DB role and found nothing due (`{"ran":[]}`), because hosted isn't the live sender |
| Hosted queue generation (worker on Actions) | **Ready, not yet exercised:** it needs one tap from you (§8) |
| Daily automatic preparation | **Built, off.** It runs on whichever side is the live sender |
| Hosted X connection and callback | **Not done:** needs your X Developer Console step and the Client ID (§8) |
| Hosted scheduled publishing | **Off by design** until your cutover authorization |
| AI agents | Claude, ChatGPT and Grok work by **manual hand-off**. Claude Code on Actions needs `CLAUDE_CODE_OAUTH_TOKEN` (not set). Paid APIs are off ($0 budget) |
| Results reporting | Ledger-based; it fills in when finals arrive with the next queue build. Player-projection accuracy is **not evaluated** (no verified box scores) |
| Engagement | Manual entry only (reading X metrics through the API costs money) |

## 5. Tests and deploys

- **Full suite: 219 of 219 pass.**
  - New tests: queue preparation (12), results graphic (6), provision probes, step-up mirror, recovery codes.
  - All seven browser suites were updated to the new navigation and pass at 1440, 390 and 430 px.
- **Visual checks** at 1440 / 1280 / 768 / 430 / 390 px: no sideways scroll and no page errors on any section. The only console errors are 3 engineering screenshots that the next copy run adds.
- **Deploys today on `gtp-team`:** the first deploy (3 builds, one failed), the recovery-code feature, the migration fix, v3, and the phone-table fix. Each is one push and about 10 s.

## 6. Known limitations

- The Mac and hosted ledgers diverge until synced. A hosted approval needs `--to-local` before the Mac can send it.
- The hosted cron runs 10 AM–2 AM ET, so an earlier preparation time fires at the first tick after 10 AM.
- 74 posts show as "Need your decision". Many are older catch-up recaps that never expire; consider rejecting or deferring the stale ones in bulk (roadmap).
- `gtp-team.vercel.app` is still attached. Remove it in Vercel → `gtp-team` → Settings → Domains.

## 7. Roadmap (priority order)

1. Cutover to hosted as the only builder and sender, so routine Mac syncs end (runbook §5, needs your authorization).
2. Per-template design approvals, so the results graphic can become its own daily post kind.
3. Bulk actions in Review: defer or reject stale catch-up posts.
4. Verified box-score source, then player-projection evaluation.
5. Weekly and monthly performance summaries from the ledger, with denominators.
6. UFC and NFL results cards on the same design system.
7. Claude Code on Actions (CP-H2: subscription token, usage credits off).

## 8. Actions that need you

1. **Try v3 on your iPhone** (pull to refresh).
2. **Exercise hosted queue generation:** on the hosted site, Overview → **Prepare today's queue** (or AI Team → type the command). It runs on GitHub Actions and writes to the hosted ledger only.
3. **Copy the Mac's latest data again** (adds the 3 screenshots): `node command-center/deploy/sync-ledger.mjs --to-hosted --apply`.
4. **X:** in the X Developer Console, add the callback `https://team.gametimepicks.yashwantbalaji.com/oauth/x/callback` (keep the local one), then send me the app's **Client ID** (not secret).
5. **Design approval:** look at `docs/assets/nba-results-2026-10-28.png` and say whether to adopt `gtp-social-results@1.0`.
6. **When ready:** authorize the cutover. Until then the Mac remains the only live sender.
