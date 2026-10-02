# Friends beta on Supabase — setup and operation (Session 8)

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
| `user_follows` | canonical ids: sport, team, player, game | own rows only |
| `saved_items` | game / official forecast / official card refs | own rows only |
| `beta_feedback` | route, sport, product, action, expected, actual, severity, link | own rows only (the founder reads them in the dashboard) |
| `beta_access` | the invite list: email, tester code T1–T10, revoked_at | **no client access at all** (RLS on, no policy) |

- Every **write** (insert/update) also requires `public.is_beta_member()`.
- **Read and delete** never require it, so a revoked tester can always see, export and delete their own data.

## Inviting, disabling, identifying

1. **Supabase → Authentication → Providers → Email:** turn **off** "Allow new users to sign up". Sign-in then
   works only for users the founder invites. Invite with **Authentication → Users → Invite user**.
2. **Add the email to `beta_access`** in the SQL editor. This is the second lock, and the one that can be
   revoked:
   ```sql
   insert into public.beta_access (email, tester_code) values (lower('friend@example.com'), 'T1');
   ```
3. **To disable a tester:** run
   `update public.beta_access set revoked_at = now() where tester_code = 'T1';`
   They can no longer write. To remove the account entirely, delete the user in Authentication → Users;
   this cascades to every row they own.
4. **In logs and notes, use the tester code (T1–T10), never an email or name.** Emails live only in the
   `beta_access` table, never in this repository (`data/internal/beta/cohort-contract.json` rule).

## Feedback

The `beta_feedback` table and its RLS are ready. **There is no in-site form yet**; adding one to `/account` is
the next account task. Until it ships, testers report to the founder directly, and the founder transcribes
each report into `docs/beta/FEEDBACK_LOG.md` using tester codes only. Each report records route, sport,
product, what they did, expected, actual, severity and an optional screenshot link. One tester never sees
another tester's report.

## Acceptance once the project exists (two test accounts)

Run in this order and record the result in the Session handoff:
1. Account A and account B can each sign in. A third, uninvited email cannot.
2. A follows NFL and B follows MLB. Their For You orders differ (`lib/my/for-you-order.mjs`), and the
   official forecasts and cards are byte-identical for both.
3. A records a manual bet. B cannot see it, and an anonymous client reads 0 rows (`npm run accounts:verify`
   REFUSES otherwise).
4. A's personal P/L shows staked / returned / net / open exposure correctly.
5. `npm run money:audit` is unchanged before and after. A user's bets never touch Mr. Dub money; a test
   forbids the accounts libs from reading it.
6. Revoke A: A can still read and delete their own rows, and can write nothing.

## Data collected (privacy checklist — not a legal review)

| Data | Why | Where | Deletion |
|---|---|---|---|
| Email | sign-in, invite list | Supabase auth + `beta_access` | delete the user in the dashboard (cascades); remove the `beta_access` row |
| Display name (optional) | how the account greets you | `profiles` | the same cascade |
| Bets you choose to record, slip images | your own history and P/L | `bet_slips`, private `slips` bucket | delete in `/account`, or via the cascade |
| Preferences, follows, saves | ordering your page | Session 8 tables | the same cascade |
| Feedback | fixing the beta | `beta_feedback` | the same cascade |
| Page views (no account id) | product analytics, 90-day retention | private Vercel Blob (P256) | expires after 90 days |

- **Never collected:** government IDs, payment cards, sportsbook passwords, bank credentials.
- **Sign-out:** `/account`.
- **Analytics vs. account data:** analytics never carries the account id.
