# Hosted CEO Command Center: handoff (2026-10-29)

**Branch:** `claude/gametimepicks-ceo-agent-center-4d5fd3`. Local commits only: nothing pushed, deployed, bought, migrated or sent to X.
**Not touched:**
- your Mac console (it wasn't running at 00:38 ET);
- its scheduler and approvals;
- the public site, DNS and X.

**Procedures:** `docs/hosted-deployment-runbook.md`.

## 1. What is now implemented

| Area | State |
|---|---|
| Hosted app (from H0/P0) | Stateless handler on Vercel + Neon:<br>• passkeys (Face ID / Touch ID), invite-only accounts, roles viewer / drafter / approver / publisher / admin;<br>• session expiry, logout, "sign out everywhere", revocation;<br>• step-up for approve, resume, live policy, X connect, user management and hand-off;<br>• CSP / HSTS / frame-deny headers; no unauthenticated endpoint besides sign-in, the X callback and the secret-checked cron |
| **Media storage (new)** | Images move to a **private** Vercel Blob store; Postgres keeps append-only references (key, sha256, size).<br>• Reads are hash-checked.<br>• Images stored before the migration stay readable.<br>• Retention removes only superseded/rejected/unused drafts after 14 days and records each removal; approved and published images are kept forever.<br>• Encrypted, verifiable backups to the Mac |
| **Single live sender (new)** | `publisher-host` hand-off with a generation number: a host can hand sending away, never take it. The inactive host sends nothing and leaves the schedule alone |
| **Migration tooling (new)** | `sync-ledger` both ways: entries + once-only claims + media, transactional, conflict-refusing, verified |
| **Caption editing (new)** | Edit any undecided caption on desktop or phone.<br>• The edit becomes a new option (E1, E2…), checked by the same rules plus each kind's own.<br>• The server computes its fingerprint, and approving it binds exactly that text.<br>• Drafters may edit; approving stays approver and up.<br>• The editor survives live refreshes while typing |
| Status | "Sending…" for an in-flight send (display only); X links on sent posts; alerts with acknowledge; the live-sender line on both surfaces |
| **Deploy preflight (new)** | Checks Vercel/GitHub configuration without printing values: wrong DB role, model keys, a staging deployment that could publish, a missing Blob store. `--probe` checks DNS, HTTPS and headers |

## 2. Deployed vs tested locally

- **Deployed: nothing.** I have no Vercel credentials or Neon project, and the `gtp-ops` repo doesn't exist.
- **Tested locally:**
  - unit, integration and browser suites (see §4);
  - a full Mac → hosted migration of a **copy** of your real ledger into the hosted handler, with an identical read model;
  - a local hosted staging run on that copy at 390 and 430 px.

## 3. Hosted URL

`https://team.gametimepicks.yashwantbalaji.com` is **not reachable**: no DNS record exists (preflight `--probe`: `ENOTFOUND`). That is expected until you add the domain in Vercel (§8).

## 4. Authentication and mobile verification evidence

**Real Face ID has not been verified on an iPhone.** Everything below used Chromium's *virtual* platform authenticator at iPhone viewport sizes; that proves the protocol and the layout, not a real device.

**Local hosted staging on the migrated copy of your ledger (390 px):**
- Unauthenticated: `/api/state` 401, media 401, cron 404.
- After sign-in: passkey setup with a one-time token; 10 recovery codes; an HttpOnly + SameSite=Strict cookie.
- The Queue shows today's 12 NBA posts as sent, with x.com links; images are served through the session.
- No sideways scroll; no page errors.
- The bar says *Live sender: the Mac console*.

**At 430 px:** no overflow, no button under 40 px.

**Test suites:** 183 / 183 pass, both normally and network-blocked (`npm test`, `npm run test:offline`). New this round: `media-storage` (9), `cutover` (1, end to end on the Oct 28 slate), `caption-edit` (4, including 1440 / 390 / 430 browser runs).

**Your check on the real device after deployment:**
1. Register your passkey with Face ID.
2. Sign out and in.
3. Approve one caption (step-up prompt).
4. Pause without a prompt.
5. Edit a caption.

## 5. Database and media storage

- **Media:** your Mac holds 320 MB of graphics from about two days. In Postgres that would fill Neon Free's 0.5 GB in days. Now:
  - images go to private Blob storage at about $0.05/month steady state;
  - the evidence to keep forever is 23.4 MB today (12 published posts);
  - retention would remove 225 MB of superseded drafts after 14 days.
- **Ledger:** 16 MB today, about 7 MB per busy queue day, so Neon Free lasts roughly two months of busy days. The ledger is never pruned. Before it reaches about 0.4 GB, you decide between Neon's paid plan and archiving old packages to the encrypted backup.

## 6. X callback readiness

- The hosted callback is `https://team.gametimepicks.yashwantbalaji.com/oauth/x/callback`: derived from `GTP_CC_ORIGIN`, PKCE S256, single-use state bound to the session, unit-tested.
- **Ready in code, not registered.** Add it in the X Developer Console *next to* the local `http://127.0.0.1:4190/oauth/x/callback`.
- The hosted side connects X itself; Keychain tokens are not copied.

## 7. Hosted scheduler readiness

- **Code ready:** Vercel Cron every 10 minutes (10 AM–2 AM ET) → GitHub `cc-publisher.yml` → `run-publish.mjs`, with every safeguard:
  - pause;
  - approval and fingerprint;
  - design;
  - image hashes;
  - fresh-data recheck;
  - before start time;
  - cap;
  - `media.write`;
  - once-only claim;
  - unknown outcomes never retried.
- The workers now get the Blob token.
- **Inactive by design:** the migrated copy is not the live sender, so its cron dispatches nothing.
- **Not yet run on real GitHub Actions / Neon** (step B3 in the runbook: one dry run).

## 8. DNS changes required

**Only one:** in Vercel, add the domain `team.gametimepicks.yashwantbalaji.com` to the new project, then copy **the exact record Vercel displays** to the DNS host of `yashwantbalaji.com`:
- usually a CNAME, plus a TXT record if Vercel asks for verification;
- the nameservers are NS1 `dns1/2/4.p07.nsone.net`, the pattern Netlify DNS uses.

I did not invent a value. Don't reuse the public site's CNAME, and leave `gametimepicks.` unchanged.

## 9. Cost estimate and approvals needed

| Item | Monthly |
|---|---|
| Vercel project on your existing Pro team (function, Cron every 10 min) | $0 extra |
| Neon Free (0.5 GB, compute well within the free hours) | $0 |
| Vercel Blob, private (about 1–2 GB of images) | about $0.05 |
| GitHub Actions, private `gtp-ops` (about 900–1,800 min on busy weeks vs 2,000 free) | $0, worst case a few dollars |
| X API | ≤ your $5 cap (about $0.045 per two-image post) |

**Nothing paid is needed to launch.** No auto-recharge, no plan change.

**Approvals needed from you:**
1. Create the resources (§1 of the runbook).
2. Set the environment variables.
3. Add the DNS record.
4. Register the callback.
5. Later, the cutover.

## 10. Safe cutover plan

Runbook §5, in summary:
1. Hosted dry run passes.
2. `sync-ledger --to-hosted --apply`.
3. You hand live sending to hosted from the Mac (exact words + macOS dialog). The Mac stops at once.
4. Sync again: the hosted side becomes the sender.
5. Watch the next post go out once.

**Rollback:** the reverse hand-off, then `--to-local`. Tested end to end on the Oct 28 slate:
- 3 posts, each sent exactly once across both hosts;
- the inactive host refused, and left the schedule untouched;
- the rollback restored the Mac.

## 11. Remaining blockers

1. Vercel sign-in / project, Neon project, private Blob store, the empty `gtp-ops` repo: yours to create. The repo contents are ready locally.
2. DNS record (from Vercel) and X callback registration: yours.
3. One real `cc-publisher.yml` dry run on Actions + Neon.
4. A real-iPhone Face ID check.
5. Database growth decision in about two months (§5).
6. `cc-worker.yml` still has a placeholder Claude Code version (`<pin-at-CP-H2>`): hosted queue builds stay off until CP-H2. The publisher workflow is complete.
7. Not built this round:
   - an automatic preflight warning for database size;
   - automatic engagement metrics (X reads cost money).

## 12. Your next actions, in order

1. Run `npx vercel@latest login`.
2. Create the **empty, private** repo `gtp-ops` on GitHub (no README). Its contents are already assembled locally at `~/Downloads/gtp-ops` (one commit, no remote; runbook §9). Say go and I push it.
3. Create the Neon project.
4. Run `node command-center/deploy/provision-db.mjs` in Terminal: it asks for the owner string at a hidden prompt and sends each role's credential straight to GitHub/Vercel (none printed).
5. Create a **Private** Blob store and connect it to the new project.
6. Set the variables from `deploy/env.example`. **Leave `GH_PUBLISHER_WORKFLOW` unset (staging).**
7. Run the preflight `--target vercel --staging` and `--target github`.
8. Add the domain in Vercel and copy its record to your DNS. Then run `preflight --probe`.
9. Register the hosted X callback.
10. On your iPhone, register Face ID with the setup token and try the Queue.
11. `sync-ledger --to-hosted --apply` (no cutover).
12. When you want it: authorize the cutover. Until then the Mac console stays the only publisher.
