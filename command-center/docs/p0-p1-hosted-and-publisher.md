# P0 private hosted Command Center + P1 X Publisher V1: report

**Status:** 2026-10-28, local only.
- Not pushed, deployed or published; no credits bought; no DNS changed.
- Live X publishing is not enabled. Nothing was sent to X.
- Commits: `d1625c0dcb` (publisher core), `509188f1a6` (hosted accounts + hosted publisher), plus this report's commit.

## 1. Completed vs pending

| Item | State |
|---|---|
| **Official X API publisher** (`publishers/x-api.mjs`)<br>• dry run builds the exact requests, no network<br>• live: 2 × `POST /2/media/upload` then `POST /2/tweets` with both media ids<br>• NOT_SENT vs UNKNOWN outcomes | **Done, tested against a mocked X**<br>Live calls never made |
| **OAuth 2.0 + PKCE** (`publishers/x-oauth.mjs`)<br>• S256, 256-bit single-use state bound to the starting session, 10-minute life<br>• refresh-token rotation | **Done, tested**<br>Real X consent not yet done (needs your app's Client ID) |
| **Secret storage** (`publishers/token-vault.mjs`)<br>• macOS Keychain locally (values via stdin, never argv)<br>• AES-256-GCM in Postgres when hosted<br>• setup script with hidden input (`scripts/x-setup.mjs`) | **Done** |
| **NBA game post**<br>• one post per game with both graphics (Predicted Winner, then Projected Stat Lines)<br>• one combined caption with one verified featured player per team<br>• both image hashes in the approval fingerprint | **Done**<br>12 of 12 games on Oct 28 pass every check (221–272 / 280 characters) |
| **Scheduling 45 minutes before tip-off** | **Done** (default schedule time; the founder can choose another time before tip) |
| **NBA Top 5 points / rebounds / assists** | **Held by design.** The NBA Top Boards are private research (`data/internal/research/nba/top-boards`); no official published board exists, and a ranking is never derived from the stat-line lane. The queue lists them as held with that reason |
| **Pre-publish gate**, in order:<br>1. Pause<br>2. Approval / invalidation / design approval<br>3. Fingerprint recomputed + image hashes<br>4. Start-time window<br>5. Fresh data fetched + re-check (winner, stat lines, featured players for injuries or lineup changes, tip time)<br>6. Live authorization + monthly cap + connected account<br>7. Once-only claim committed **before** the request | **Done, tested** |
| Single canonical prediction | Every number comes from the published NBA lane or NFL receipts and site files. Nothing reads Simulation Theater |
| Duplicate protection<br>• a PUBLISHED or UNKNOWN result blocks any further send for that post<br>• only a definite NOT_SENT allows another attempt<br>• hosted: claim flushed to Postgres before the request | **Done, tested** |
| Pause Publishing switch; audit (every step in the ledger); job status; alerts with acknowledge; reconciliation (paste the X link / confirm not posted / API lookup) | **Done** |
| Founder approval gates unchanged<br>• per-post approval; design approval<br>• live needs the exact authorization sentence + cap, plus a macOS dialog locally or a passkey step-up when hosted | **Done**<br>A recurring publishing *policy* (auto-approve rules) is **not** built: every post still needs its own approval |
| Manual live test, then scheduled live after authorization | **Done** (live test needs a cap but not scheduled-live mode) |
| **P0 accounts**<br>• individual passkey accounts, invite-only, roles<br>• server-side permission per route (fail closed), step-up with your own passkey only<br>• last-admin protection; disable ends sessions; session expiry (12 h idle, 7 days absolute) | **Done, tested** (+ mutation-checked) |
| Narrow OAuth callback (state + code only) → `/oauth/x/finish` needs the starting administrator's session | **Done, tested** |
| Hosted publishing<br>• Vercel Cron → `cc-publisher.yml` job (fresh public data, its own Postgres role that can record only publishing results)<br>• waits for each exact due time | **Code done**<br>Untested on real Vercel / GitHub / Neon (CP-H1) |
| Performance tracking | Engagement numbers stay founder-entered (X reads cost money). An automatic metrics poll is **not** built |

## 2. Local test results

- **Full suite:** 157 / 157 normal and 157 / 157 network-blocked.
  - One browser test failed once under full-suite load. It passed alone twice and on the rerun of the whole suite.
- **New tests:**
  - `tests/publisher-x.test.mjs` (9): OAuth, the adapter, and the gate end to end on the real Oct 28 NBA slate. Covers:
    - scheduling, dry run and pause;
    - an injured featured player, a changed stat line or a moved tip-off is refused;
    - a tampered image is refused; a missed window is recorded;
    - live with a mocked X: one post, two images, a receipt, never twice;
    - unknown outcome → no retry → reconcile;
    - roles.
  - `tests/hosted-accounts.test.mjs` (6): roles matrix, invite-only, escalation attempts, expiry, OAuth callback, cron secret.
  - `tests/db-roles.test.mjs` (+1): the publisher database role can't forge approvals or decisions.
- **Mutation checks:** removing the server-side role check fails 2 tests; accepting another user's passkey for step-up fails 1.
- **Dry-run demonstration** (`docs/x-publisher-v1-dry-run-2026-10-28.md`, preview `out/publisher-demo/game-posts-dry-run.png`):
  - Latest data (`d9688ac257`), in a throwaway ledger.
  - All 12 games scheduled at tip-off minus 45 minutes, clock stepped to each due time.
  - Each ran the full gate as DRY_RUN with 2 images. Would cost $0.045 each. Nothing sent, no receipt written.
- **Independent security review:** section 7.

## 3. OAuth callback URLs (verified against the code)

| Where | URL | Verified |
|---|---|---|
| Local Command Center | `http://127.0.0.1:4190/oauth/x/callback` | Served by `surfaces/console/server.mjs`. Probed live on 2026-10-28: a bad or malformed state returns 400 and nothing is echoed. X's docs require `127.0.0.1`, not `localhost` |
| Hosted | `https://team.gametimepicks.yashwantbalaji.com/oauth/x/callback` | Served by `hosted/app.mjs` from `GTP_CC_ORIGIN` + `/oauth/x/callback`, tested end to end on a test origin. **Not reachable until deployed** |

Register both in the X Developer Console. X requires an exact match.

## 4. Hosting recommendation and expected costs

**Architecture:** the H0 architecture plus the publisher job.

| Piece | Host |
|---|---|
| Web app (login, queue, approvals, OAuth) | A new Vercel project on your existing Pro team, at `team.gametimepicks.yashwantbalaji.com` |
| Database | Neon Postgres (Free) |
| Claude worker + publisher job | Two workflows in the private `gtp-ops` repository |

It is isolated from the public site: separate project, domain, database, secrets and cookies (`__Host-`, SameSite=Strict). The public repository is only read.

| Item | Expected | Basis |
|---|---|---|
| Vercel | **$0 extra**: a project on the existing Pro team; Cron every 10 minutes is allowed on Pro (Hobby is daily-only) | vercel.com/docs/cron-jobs/usage-and-pricing |
| Neon Free | **$0**. Compute: about 60 CU-hours/month estimated (wakes every 10 minutes, 10 AM–2 AM ET) against 100 included. **Storage is the constraint (0.5 GB)**: see blocker B1 | neon.com pricing / free-plan FAQ (one Neon page still says 50 CU-hours: check yours) |
| GitHub Actions (private repo) | About 900–1,800 publisher minutes/month on busy NBA weeks (a job waits ≤ 10 min for its due time) plus worker jobs, against 2,000 free. Any overage is about $0.008/min, under $5 | GitHub plans page (confirm on your billing page) |
| X API | **$0.015–0.045 per game post** (post create $0.015; media upload unlisted, assumed $0.015 per image). About $5–8/month at 4–6 posts a day; at most about $16 if all 12 games post daily. Your monthly cap enforces it | docs.x.com pricing (10-27) |
| DNS | $0: one CNAME | — |

**Total:** about **$5–16/month**, all X usage, within a cap you set. Possibly a few dollars of GitHub minutes. A paid Neon plan only if you choose it over media retention.

## 5. Deployment plan, DNS, credentials, backup and recovery

**Deploy at CP-H1, in this order:**
1. Private `gtp-ops` repo.
2. Neon project, then `deploy/migrate.mjs --roles`. This prints 4 connection strings, now including `CC_PUBLISHER_DATABASE_URL`.
3. Vercel project.
4. Environment and secrets:

| Where | Name |
|---|---|
| Vercel (Production only) | `DATABASE_URL` (app role) |
| | `GTP_CC_ORIGIN` |
| | `GTP_CC_RP_ID` |
| | `GTP_CC_SETUP_TOKEN_SHA256` |
| | `GH_DISPATCH_TOKEN` |
| | `GH_OPS_OWNER` / `GH_OPS_REPO` |
| | `GH_WORKER_WORKFLOW=cc-worker.yml` |
| | `GH_PUBLISHER_WORKFLOW=cc-publisher.yml` |
| | `GTP_CC_SECRET_KEY` (32 random bytes, base64) |
| | `GTP_CC_X_CLIENT_ID` |
| | `GTP_CC_X_HANDLE` |
| | `CRON_SECRET` |
| GitHub (gtp-ops) | secrets `CC_PUBLISHER_DATABASE_URL`, `GTP_CC_SECRET_KEY` (same value) |
| | variables `GTP_CC_X_CLIENT_ID`, `GTP_CC_X_HANDLE` |

5. Copy `deploy/github/cc-worker.yml` and `cc-publisher.yml` into the ops repo; pin action SHAs.
6. Deploy.
7. **DNS:** add `team.gametimepicks.yashwantbalaji.com` in Vercel → one **CNAME** at your DNS host. Nothing on the public site changes.
8. First passkey with the setup token, then delete `GTP_CC_SETUP_TOKEN_SHA256`.

**Credential storage:**

| Credential | Where it lives |
|---|---|
| X tokens / client secret | Keychain locally; AES-GCM in Neon when hosted. The key lives only in Vercel and GitHub encrypted settings |
| Database role passwords | Shown once by the migrate script; stored only in Vercel/GitHub secrets |
| Passkeys | Public keys only, server-side |
| Invite tokens, recovery codes | Hashes only |

Nothing secret is in the repository, the ledger or logs.

**Backup and recovery:**
- **Neon:** point-in-time restore (Free keeps a short history window). Weekly `pg_dump` with the owner role to an encrypted file on your Mac. The ledger is append-only, so a dump is a complete audit copy.
- **Lost passkey:** another passkey, or one of the 10 recovery codes (founder). Recovery ends every session.
- **Lost X tokens or a revoked app:** reconnect (admin + step-up).
- **Compromised token:** disconnect (revokes at X), rotate `GTP_CC_SECRET_KEY` (re-encrypt by reconnecting), and check x.com/settings/connected_apps.
- **Stuck or unknown post:** an alert shows. Reconcile by pasting the X link, or "not posted". It is never retried blind.

## 6. Production-readiness checklist

- [x] Every endpoint, job and admin function checked server-side; unknown routes fail closed; tested.
- [x] No self-registration; invites single-use, 72 h; last administrator protected.
- [x] Step-up (Face ID / Touch ID) for approvals, resume, live publishing, live authorization, connecting X, managing people.
- [x] OAuth: state + PKCE + the starting administrator's session; callback exposes nothing else.
- [x] Once-only publishing; never after start; fresh-data re-check; dry run by default.
- [x] Secrets never in the repository, the ledger, logs or the browser (tested for tokens in state and at rest).
- [ ] **B1 media storage (before hosting):** retention for rendered graphics, or object storage, so Neon's 0.5 GB isn't exhausted (about 40 MB/day today).
- [ ] B2: hosted queue builds need the NBA/NFL public data paths in the worker's sparse checkout (`cc-worker.yml` lists only the H0 NFL paths).
- [ ] B3: run `cc-publisher.yml` once as a dry run on real Actions + Neon (pins, sparse paths, `git fetch` in a sparse checkout).
- [ ] B4: real X consent and one live test post (your credits + approval).
- [ ] B5: confirm the media-upload price on your X usage page after the first post, and adjust `PRICE_USD` if it differs.
- [ ] Security review findings (section 7) closed.

## 7. Independent security review

To be filled in when the review completes.

## 8. Your remaining one-time actions

1. **Approve the `gtp-social@2.2.1` design** (Queue), then approve tonight's NBA game posts you want.
2. **X Developer Console:**
   - Read and write permissions.
   - App type (Native recommended).
   - Both callback URLs exactly.
3. Run `node command-center/scripts/x-setup.mjs` in your Terminal (Client ID, plus the secret if it's a Web App).
4. **Connect X account** from the Queue as GameTimePicks; label the account as automated on X.
5. **Buy X credits + set a spend cap in the X console** (your purchase), then a **Live test post** on one approved post.
6. When you're satisfied: **Authorize scheduled live publishing** with a monthly cap.
7. **Hosting (CP-H1):** say go, then create the ops repo, Neon project and Vercel project, and add the CNAME. B1–B3 are fixed before that.
