# Hosted Command Center: deployment, cutover and rollback runbook

**Target:** `https://team.gametimepicks.yashwantbalaji.com`. A separate, private Vercel project. The public GameTimePicks site and its project are not touched.
**Status (2026-10-29):** code complete and tested locally (including a staging run on a copy of the real ledger). **Nothing is deployed.** Every step marked **(you)** needs your account or your approval.

## 0. Safety rules this runbook keeps

- **One live sender at a time.**
  - The ledger record `publisher-host` names the only place allowed to send to X. Today, with no record, that is **the Mac console**.
  - A host can only hand sending *away*, never take it. The other host learns of the hand-off only through the ledger sync. That sync also copies every once-only send claim.
  - So at any moment zero or one host can send. A post one host sent is refused as `ALREADY_PUBLISHED` on the other (tested end to end: `tests/cutover.test.mjs`).
- **The inactive host leaves the schedule alone.** Its cron dispatches nothing and its publisher records nothing.
- **Staging can't publish.** `GH_PUBLISHER_WORKFLOW` stays unset (the preflight `--staging` check enforces it). The hosted copy is also not the live sender.
- **Secrets never leave their stores.**
  - No X tokens are migrated: the hosted side connects X again through its own OAuth callback.
  - Owner database credentials stay on the Mac and are used one command at a time.
- **The Mac console keeps running throughout.** None of these steps restart it, and its approvals and schedule are copied, never changed.

## 1. What you create (one time) and what it costs

| # | Resource | Who | Cost |
|---|---|---|---|
| 1 | Sign in to the Vercel CLI: `npx vercel@latest login` (or a scoped token) | you | — |
| 2 | Private GitHub repo `gtp-ops`: you create it **empty**; the contents are assembled locally by `deploy/assemble-ops-repo.mjs` (§9) and pushed only when you say go | you create, I prepare | $0 (2,000 Actions min/month free) |
| 3 | Neon project (Free) → `node command-center/deploy/provision-db.mjs` (asks for the owner string hidden; creates the roles, proves their limits, sends each credential straight to GitHub/Vercel, prints none) | you create; the command prints 4 role URLs once | $0 (0.5 GB) |
| 4 | Vercel project `gtp-ops` (exists; holds an older CLI-deployed Next.js app that the first Git deploy replaces) on your existing Pro team, root = the ops repo | you | $0 extra on Pro |
| 5 | Vercel Blob store, **access: Private**, connected to `gtp-ops` only | you | about $0.05/month (see §6) |
| 6 | Environment variables (`deploy/env.example`); then `node command-center/deploy/preflight.mjs --target vercel --env-file <pulled file> --staging` and `--target github` | you set, preflight checks | — |
| 7 | Domain (§2) | you | $0 |
| 8 | X callback (§3) | you | $0 |

**No step enables auto-recharge, a paid plan or a spending increase.** The X cap stays $5/month and you set it.

## 2. DNS: use the exact record Vercel shows

1. Vercel → `gtp-ops` → Settings → Domains → **Add** `team.gametimepicks.yashwantbalaji.com`.
2. Vercel then shows the record to add, usually a **CNAME** for `team.gametimepicks`, with a target specific to your project/team. If the domain is already used elsewhere, it may also show a **TXT** record for verification.
   - **Copy those values exactly.** Don't reuse the public site's CNAME (`c099500b2442b08e.vercel-dns-017.com`) and don't guess one.
3. Add them at the DNS host for `yashwantbalaji.com`.
   - Its nameservers are `dns1/2/4.p07.nsone.net` (NS1, the pattern Netlify DNS uses).
   - Today `team.` has no record and `gametimepicks.` has its own CNAME. **Leave that one unchanged.**
4. Wait for Vercel to show **Valid Configuration** and issue the certificate.
5. Then check:

   ```bash
   node command-center/deploy/preflight.mjs --probe https://team.gametimepicks.yashwantbalaji.com
   ```

   This checks DNS, HTTPS, HSTS, the frame/CSP headers, a 401 on unauthenticated state and a refused cron. Today it reports `ENOTFOUND` (expected: no record yet).

## 3. X callback (keep the local one)

- In the X Developer Console → your app → User authentication settings → Callback URI, **add** `https://team.gametimepicks.yashwantbalaji.com/oauth/x/callback`.
- Keep `http://127.0.0.1:4190/oauth/x/callback` so the Mac console keeps working.
- The hosted app derives its callback from `GTP_CC_ORIGIN` (PKCE S256, single-use state bound to your session). Then on the hosted site: Queue → **Connect X account** (passkey step-up).
- The hosted tokens live AES-256-GCM-encrypted in Neon (key `GTP_CC_SECRET_KEY`, only in Vercel and GitHub settings). The Keychain tokens on the Mac are not copied.

## 4. Migration (no cutover): Mac → hosted, repeatable

```bash
node command-center/deploy/sync-ledger.mjs --to-hosted          # dry run: counts, conflicts
node command-center/deploy/sync-ledger.mjs --to-hosted --apply  # copy + verify
```

- **What it copies:**
  - every ledger entry (same id, time and data) and every claim, in one transaction (a conflict writes nothing);
  - the images posts refer to → the private Blob store (write-once, hash-checked);
  - then it verifies that every source record is on the target, unchanged.
- **Rehearsed on a copy of your real ledger (Oct 29, 01:40 ET):**
  - 2,131 entries and 99 claims copied; verify OK; re-run copies 0.
  - The hosted read model equals the Mac's:
    - 785 posts, 12 published;
    - 12 jobs;
    - $0.54 spent;
    - `live` policy.
  - The hosted copy reports **live sender: the Mac console**.
- Re-run it as often as you like before the cutover: it is incremental and the Mac can keep running.

## 5. Cutover (only with your explicit authorization)

Pick a quiet window, at least 20 minutes before the next scheduled post.

1. **Hosted ready.** The hosted X account is connected with `media.write`. The publisher workflow is set (`GH_PUBLISHER_WORKFLOW=cc-publisher.yml`). One `cc-publisher.yml` run has passed as a dry run. Run a fresh `sync-ledger --to-hosted --apply`.
2. **Mac hands off.** Mac console → Queue → X publishing → *Live sender: this is it* → **Hand live sending to the hosted Command Center…**.
   - Type `I hand live X publishing to the hosted publisher`, then confirm the macOS dialog.
   - It is refused while any send is in progress or unreconciled.
   - From this moment **the Mac sends nothing live**. Its scheduler skips; review, approval and editing keep working.
3. **Carry the hand-off over.** Run `sync-ledger --to-hosted --apply`. The hosted bar now says *Live sender: this is it (hand-off #1)*. The hosted cron sends scheduled jobs from the next tick (every 10 minutes during game windows; the job waits for each exact due time).
4. **Verify.** On the next post:
   - the job shows *Sending…*, then *Sent* with the X link;
   - spend matches the X Developer Console;
   - nothing was sent twice (claims and receipts travel with the ledger).
5. **Keep the Mac console as the fallback.** You may leave it running: it can't send unless sending is handed back.

Between steps 2 and 3, *neither* side sends. A due post can be missed for that window, which is why the cutover goes in a quiet window.

## 6. Rollback (hosted → Mac)

1. Hosted Queue → **Hand live sending to the Mac console…**. Type `I hand live X publishing to the local publisher` and confirm with a passkey step-up. Hosted stops at once.
2. `sync-ledger --to-local --apply`. This copies the hosted receipts, claims and the hand-off into the Mac ledger, and pulls any images the hosted side rendered.
3. Restart the Mac console only if it was stopped. Its bar shows *Live sender: this is it (hand-off #2)*.

## 7. Media storage, retention and backups

- **Why off Postgres:**
  - Graphics are ~1 MB each.
  - Your local console holds **320 MB from about two days** of queues, which would fill Neon Free's 0.5 GB in days.
  - In the hosted app, bytes go to a **private** Blob store (no public URLs; served only through the signed-in app, CSP-sandboxed).
  - Postgres keeps an append-only reference per image (key, sha256, size).
  - A read whose bytes don't match the recorded hash is refused.
- **Retention:** `deploy/media-retention.mjs` is a dry run unless `--apply`; it needs the owner role.
  - **Never removes media of an approved or published post.**
  - Keeps undecided current drafts.
  - Removes superseded/rejected/unused images older than 14 days (minimum 7).
  - Each removal is recorded with hash and reason; the reference row and the ledger stay.
  - On today's data: the evidence to keep forever is **23.4 MB** (12 posts). After 14 days, 225 MB of superseded drafts would be removed.
  - Steady state is roughly two weeks of drafts plus all evidence, about 1–2 GB at $0.023/GB-month, so **about $0.05/month**. Blob operations and transfer are within Pro's included usage at this volume; check *Usage → Blob* after the first week.
- **Backups:** `deploy/backup.mjs`.
  - Make a key once with `--new-key` and keep it in your password manager.
  - Weekly: `--out ~/GTP-backups` writes an AES-256-GCM file containing:
    - every entry and claim;
    - media references and deletions;
    - the bytes of every approved/published image.
  - `--verify <file>` checks it.
  - Secrets and sessions are not exported.
- **Database growth:** the ledger itself is about 7 MB on a busy queue day (16 MB total today), so Neon Free lasts roughly two months of busy days. The ledger is evidence and is not pruned. Before it nears 0.4 GB, decide between Neon's paid plan and archiving old queue packages to the encrypted backup. Preflight will warn first (follow-up).

## 8. Commands summary (Mac, one at a time)

| Purpose | Command |
|---|---|
| First-time database setup (roles + credentials) | `node command-center/deploy/provision-db.mjs` · `--check` (schema only) |
| Schema after a migration change | `node command-center/deploy/migrate.mjs` |
| Config check | `node command-center/deploy/preflight.mjs --target vercel\|github --env-file … [--staging]` |
| Live host check | `node command-center/deploy/preflight.mjs --probe https://team.gametimepicks.yashwantbalaji.com` |
| Ledger + media sync | `node command-center/deploy/sync-ledger.mjs --to-hosted\|--to-local [--apply]` |
| Media retention | `node command-center/deploy/media-retention.mjs [--keep-days 14] [--apply]` |
| Backup / verify | `node command-center/deploy/backup.mjs --out ~/GTP-backups` · `--verify <file>` |
| Local hosted staging | `node command-center/hosted/dev-server.mjs` → http://localhost:4191 (Touch ID passkeys work on localhost) |
| Assemble the ops repo (local only) | `node command-center/deploy/assemble-ops-repo.mjs --out ~/Downloads/gtp-ops` |

## 9. The ops repo (`gtp-ops`)

`deploy/assemble-ops-repo.mjs` builds it as a **new local git repo with one commit and no remote**; it never overwrites a folder.
- **Contents:**
  - `command-center/` exactly as committed (tracked files only: no `out/`, `node_modules` or `.env`);
  - `api/index.mjs` and `vercel.json` at the root;
  - the two workflows in `.github/workflows/`, every action pinned to a commit SHA;
  - `public-snapshot/app/`: the six public-site files the web function loads (team-colour code and data, the caption word list, the logo), taken from the public `main`, never from a branch. Vercel's build copies them to `app/`. On Actions, `app/` is the live read-only sparse checkout instead.
  - `SOURCE.json`: both source commits and the sha256 of every snapshot file.
- **Refused:** anything that looks like a credential (GitHub/Vercel/model tokens, a Postgres URL with a password, private keys) and any build output. The finding names the file, never the value.
- **Checked by `tests/ops-repo.test.mjs`:**
  - pinned actions;
  - the sparse checkouts cover every public path the code reads;
  - after the same build command Vercel runs, the real `api/index.mjs` loads in a folder with no public repo beside it, and answers: logo 200, unauthenticated state 401, cron without its secret 404;
  - the function bundle glob covers every runtime directory.
- **Updating later:** assemble into a new folder, compare it with the ops repo, and copy the changes over as a normal commit. Never force-push.
- **Push (only after you create the empty private repo and say go):** `git -C ~/Downloads/gtp-ops remote add origin https://github.com/<owner>/gtp-ops.git`, then `git -C ~/Downloads/gtp-ops push -u origin main`.

