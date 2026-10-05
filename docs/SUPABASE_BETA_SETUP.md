# Friends beta on Supabase — setup and operation (Sessions 8–9)

The account foundation is built and **off** until a Supabase project exists:
- schema with own-row RLS;
- magic-link sign-in;
- `/account` with a manual bet tracker and personal P/L;
- slip upload, read and confirm.

This page covers only what the ~10-friend beta adds. The base steps (create the project, run the schema,
set redirect URLs, Vercel env, `npm run accounts:verify`) are in [`ACCOUNTS_SETUP.md`](./ACCOUNTS_SETUP.md).
An optional standalone version for a helper is [`OPTIONAL_DP_SUPABASE_SETUP.md`](./OPTIONAL_DP_SUPABASE_SETUP.md).

## Architecture fit (verified 2026-10-02)

- The Next.js output is `output: "export"` (static). There is no middleware, no server actions and no SSR
  session, so auth is **client-side only**: supabase-js with PKCE and `detectSessionInUrl` on `/account/`.
  This works with a static export because the callback is a static page that finishes the exchange in the
  browser.
- No user data is ever in static HTML. Every user row is fetched in the browser with the visitor's own
  session, and RLS decides what returns.
- The only server code is the Vercel functions in `app/api/*.mjs`. Only `slip-read` touches Supabase, and it
  is the only holder of the service-role key.
- Static export is **not** abandoned, and no founder gate is needed for that.

## What the schema now holds (`db/accounts-schema.sql`, idempotent; re-run it in the SQL editor)

| Table | Holds | RLS |
|---|---|---|
| `profiles` | display name (optional) and self-set limits | own row only |
| `bet_slips` | bets the person actually placed (legs as jsonb, an optional `official_card_id` citation) | own rows only |
| `user_preferences` | **explicit** sports, products, families, risk bands, "hide player props" | own row only |
| `user_follows` | canonical ids: sport, team, player, game (+ optional display `label`, S9) | own rows only |
| `saved_items` | game / official forecast / official card refs (+ the saved forecast `snapshot`, a copy of public data, S9) | own rows only |
| `beta_feedback` | route, sport, product, `kind` (S9), expected, actual, severity, link | own rows only (the founder reads them in the dashboard) |
| `beta_access` | the invite list: email, tester code T1–T10, revoked_at | **no client access at all** (RLS on, no policy) |

- Every **write** (insert/update) also requires `public.is_beta_member()`.
- **Read and delete** never require it, so a revoked tester can always see, export and delete their own data.
- Slip-image **uploads** are writes too: the `slips_write_own` storage policy also requires `public.is_beta_member()`
  (2026-10-05 beta fix), so a revoked tester or an uninvited account cannot upload. Reading and deleting their own
  images stay open.

**What the database allows vs. what the site offers today.** The policies permit an owner to delete their own rows
and images, and the battery proves it. The site itself has **no delete button** yet for bets, slips, follows or saves
(follows and saves are removed by un-following / un-saving and syncing). Until one exists, a tester who wants data
gone asks the founder, who deletes it in the dashboard (below). This is a known non-blocker for the friends beta.

## Inviting, disabling, identifying

1. **Supabase → Authentication → Providers → Email:** turn **off** "Allow new users to sign up". Sign-in then
   works only for users the founder creates: **Authentication → Users → Add user → Create new user** (Auto Confirm),
   after which the person signs in at `/account/` with "Email me a link" (`beta/HOSTED_BETA_RUNBOOK.md` Part C).
2. **Add the email to `beta_access`** in the SQL editor. This is the second lock, and the one that can be
   revoked:
   ```sql
   insert into public.beta_access (email, tester_code) values (lower('friend@example.com'), 'T1');
   ```
3. **To disable a tester:** run
   `update public.beta_access set revoked_at = now() where tester_code = 'T1';`
   They can no longer write. To remove the account entirely, first delete their folder in Storage → `slips` →
   `<user id>/` (storage has no cascade and no code removes images yet), then delete the user in
   Authentication → Users;
   this cascades to every row they own.
4. **In logs and notes, use the tester code (T1–T10), never an email or name.** Emails live only in the
   `beta_access` table, never in this repository (`data/internal/beta/cohort-contract.json` rule).

## Live RLS proof (Session 9) — executed, not regex-matched

`node app/scripts/accounts/rls-live.mjs` runs `db/rls-live/two-account-isolation.sql` against the real
`db/accounts-schema.sql` in a real Postgres, as the real roles with real JWT claims, inside one transaction
that is rolled back:
- **Local** (default): a throwaway cluster (unix socket only) + `db/rls-live/supabase-shim.sql`, which
  reproduces Supabase's roles, **default grants** (anon/authenticated get ALL on public tables, so RLS is the
  only barrier — otherwise the test would pass on a permission error), `auth.uid()`/`auth.jwt()` and storage.
- **Hosted:** `RLS_DB_URL=<the project's postgres connection string> node app/scripts/accounts/rls-live.mjs --hosted`
  runs the battery alone against the real project (read the string from the dashboard; it is never printed).

The battery proves, for profiles, preferences, follows, saved, bets (incl. their legs), feedback and slip
images: A reads A / B reads B; A cannot read, update (WHERE'd **and** blanket), re-assign or delete B's rows
and vice versa; anonymous reads 0 rows everywhere and cannot write; an uninvited account cannot onboard; a
revoked tester keeps read/delete and loses write; the invite list is unreadable; every `public` table has RLS
and is covered. `--all-mutations` injects 8 defects (RLS off, open SELECT, open UPDATE USING, anon read, no
invite check, readable allowlist, any-folder storage, an unprotected new table) and each must be caught.
`src/lib/accounts/rls-live.test.mjs` runs both where Postgres exists and is skipped *by name* where it does not.

**Status:** the local proof passes (2026-10-02). The hosted run waits on the project (below).

## Follows, saves and preferences across devices (Session 9)

`/account` runs `AccountSyncPanel` after sign-in (`lib/accounts/account-sync.mjs`):

| Type | Strategy |
|---|---|
| follows | **union** by canonical id; a removal propagates only if made since the last sync (per-account baseline in this browser). First sign-in on a device removes nothing on either side |
| saved forecasts | **union** by id, the account keeps the immutable snapshot; same id → the device's original stands; removals as above |
| style (risk / bankroll / unit) | unchanged (`style-sync.mjs`): adopt only into an empty device, otherwise both shown and the reader picks |
| preferences (`user_preferences`) | account only — no device copy, nothing to merge |
| bets | account only; never on the device, never in Mr. Dub |

What happened is always shown as one sentence. A non-canonical id (a name) is refused, never adopted.

## Feedback (Session 9)

**In-site form:** `/feedback` (linked from `/account`; `?from=<path>` pre-fills the page). Signed-in testers
only; one own-row insert into `beta_feedback` (type, severity, optional sport/product, what happened, what was
expected, the page path — never a query string). The founder reads reports in the Supabase dashboard
(Table editor → `beta_feedback`, or `select * from beta_feedback order by created_at desc`). No client — the
form included — can list anyone's feedback but their own; there is deliberately no privileged admin page in the
static site. `docs/beta/FEEDBACK_LOG.md` remains for reports that arrive outside the site.

## Acceptance once the project exists (two test accounts)

Run in this order and record the result in the Session handoff:
1. Account A and account B can each sign in. A third, uninvited email cannot.
2. A follows NFL and B follows MLB. Their For You orders differ (`lib/my/for-you-order.mjs`), and the
   official forecasts and cards are byte-identical for both.
3. A records a manual bet. B cannot see it, and an anonymous client reads 0 rows (`npm run accounts:verify`
   REFUSES otherwise). Then run the full battery against the project:
   `RLS_DB_URL=… node app/scripts/accounts/rls-live.mjs --hosted` → `RLS LIVE ISOLATION: PASS`.
4. A's personal P/L shows staked / returned / net / open exposure correctly.
5. `npm run money:audit` is unchanged before and after. A user's bets never touch Mr. Dub money; a test
   forbids the accounts libs from reading it.
6. Revoke A: A can still read their own rows, and can write nothing (no new bet, no feedback, no slip-image upload).
   Owner delete after revocation is proven by the hosted battery (step 3), not by a site button: none exists yet.

## Data collected (privacy checklist — not a legal review)

| Data | Why | Where | Deletion |
|---|---|---|---|
| Email | sign-in, invite list | Supabase auth + `beta_access` | delete the user in the dashboard (cascades); remove the `beta_access` row |
| Display name (optional) | how the account greets you | `profiles` | the same cascade |
| Bets you choose to record, slip images | your own history and P/L | `bet_slips`, private `slips` bucket | no in-site delete yet: the founder deletes on request (the `slips/<user id>/` folder first, then the user, which cascades the rows) |
| Preferences, follows, saves | ordering your page | Session 8 tables | the same cascade |

## Known non-blockers for the friends beta (2026-10-05, founder-accepted)

- **Preferences have no screen.** `user_preferences` exists with own-row RLS, but nothing writes it and `/my` does not
  read it. Personalization in the beta is follows and saves only.
- **Follows cover MLB teams, NFL teams and NFL players only** (`lib/follow/follow-schema.mjs`). NBA, soccer and UFC
  follows wait on those departments' canonical ids.
- **Sync runs when `/account` is opened**, not from `/my`: a follow made on one device reaches another after a visit
  to `/account` there.
- **No in-site delete** (above).
- **AI slip reading is OFF** for the beta: `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are not set in Vercel,
  and `/api/slip-read` answers 503 by design.

The Friday step-by-step is [`beta/HOSTED_BETA_RUNBOOK.md`](./beta/HOSTED_BETA_RUNBOOK.md).
| Feedback | fixing the beta | `beta_feedback` | the same cascade |
| Page views (no account id) | product analytics, 90-day retention | private Vercel Blob (P256) | expires after 90 days |

- **Never collected:** government IDs, payment cards, sportsbook passwords, bank credentials.
- **Sign-out:** `/account`.
- **Analytics vs. account data:** analytics never carries the account id.
