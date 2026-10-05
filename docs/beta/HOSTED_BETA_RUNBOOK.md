# Hosted friends beta — the founder's runbook (cohort `friends-beta-2026-10`)

**Approved by the founder 2026-10-05.** Supabase project on the free tier · invite-only sign-up · AI slip reading
**OFF** · 3–5 trusted friends, about Oct 9–18 · a short private-beta note (below) stands in for the legal pages
**for this closed beta only**. It is not a substitute for the public-launch Terms/Privacy work (Oct 17–19).

Scope is the audited schema as it is: no new tables, no new account features, no slip reading. Any new
Supabase/security architecture decision is a founder gate.

**Secrets rule.** The database password, the connection string and the `service_role` key go only into your
password manager and (for the keys that need it) Vercel. Never paste them into a chat, an issue, a commit or a doc.
Every command below reads them from a prompt that does not echo, so they never land in your shell history either.

---

## Part A · Create the project (you, ~20 min, any day before Friday)

1. **supabase.com → New project.** Name `gametimepicks`, region US East, free plan. Generate a strong database
   password and save it in your password manager.
2. **Authentication → Sign In / Providers → Email:** Email ON. **"Allow new users to sign up" OFF.**
3. **Authentication → URL Configuration:**
   - Site URL: `https://gametimepicks.yashwantbalaji.com`
   - Redirect URLs: `https://gametimepicks.yashwantbalaji.com/account/`
4. **SQL Editor → New query:** paste the whole of `db/accounts-schema.sql` **from `main` after the beta security
   PR has merged** (it adds the invite check to slip-image uploads), and click Run. "Success. No rows returned" is
   the expected answer. Running it again later is harmless.
5. **Vercel → project `gametime-picks` → Settings → Environment Variables → Production**, add exactly two:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL (Project Settings → API; looks like `https://abcd.supabase.co`)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the **legacy `anon` key** (Project Settings → API Keys; if the page opens on
     the newer "publishable / secret" keys, switch to the **Legacy** tab: the site and the checks below are built
     for the `anon` and `service_role` keys)

   **Do not add** `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` to Vercel: slip reading stays off.
6. **Redeploy Production** (Deployments → latest → Redeploy). The values are baked in at build time, so accounts
   switch on with that deploy and not before. Tell the thread when it is done so the deploy SHA is recorded.

## Part B · Prove it on your own computer (you, ~10 min)

You need: a checkout of the repository, Node 22, and `psql`. No `npm install` is needed for these two checks.
On a Mac: `brew install libpq && brew link --force libpq` gives you `psql`.

**B1 · Get the latest code**

```bash
cd ~/path/to/gametimepicks        # your checkout
git checkout main && git pull origin main
cd app
```

**B2 · Setup check (reads only; creates nothing)**

```bash
read -r  -p "Project URL: "          NEXT_PUBLIC_SUPABASE_URL      && export NEXT_PUBLIC_SUPABASE_URL
read -rs -p "legacy anon key: "      NEXT_PUBLIC_SUPABASE_ANON_KEY && export NEXT_PUBLIC_SUPABASE_ANON_KEY; echo
read -rs -p "legacy service_role key: " SUPABASE_SERVICE_ROLE_KEY     && export SUPABASE_SERVICE_ROLE_KEY; echo
npm run accounts:verify
```

- **Pass:** the last line says READY (exit code 0), with a `warn` only on the AI reader. The service-role key is used here only so the check can confirm
  the `slips` bucket is private; it stays in this terminal and is never written anywhere.
- It will also say the AI reader is not configured. That is expected (slip reading is OFF).
- **`STOP` or `REFUSE` = do not invite anyone.** Send the thread the verdict line only.

**B3 · Live two-account security battery against the real project**

In Supabase, click **Connect** (top of the project) → **Session pooler** → copy the URI. It looks like
`postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`.
Replace `[YOUR-PASSWORD]` with the database password **inside the prompt below** (if the password has `@`, `/`,
`:` or `%` in it, it must be URL-encoded; the simplest fix is a password of letters and digits).

```bash
read -rs -p "Session pooler connection string: " RLS_DB_URL && export RLS_DB_URL; echo
node scripts/accounts/rls-live.mjs --hosted
unset RLS_DB_URL SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_SUPABASE_ANON_KEY
```

- **Pass:** the last line is exactly `✓ RLS LIVE ISOLATION: PASS (hosted project)`.
- The whole battery runs inside one transaction that is **rolled back**: it leaves no user, row or file behind.
- A line containing `LEAK`, `NOT REFUSED`, `TAMPER`, `RLS DISABLED` or `REVOKED` is a real security failure:
  **do not invite anyone**; paste that one line (it contains no secret) into the thread.
- `permission denied` on `auth.users` or `storage.objects`, or a connection error, is a setup or platform
  difference, not a leak. Paste the line into the thread and we will fix the run, not the policies.

## Part C · Two-account acceptance (you, ~15 min, Friday)

Use two of your own email addresses (A and B) and a third you have **not** added (C). Use **two different
browsers** (or one normal and one private window) for A and B: follows and saves start on the device.

**How a person gets in (same for testers):** you create their login, then they sign in themselves with a link.

1. Allow A and B to write (emails live only in this table, never in the repository):
   ```sql
   insert into public.beta_access (email, tester_code) values
     (lower('<email A>'), 'T0A'), (lower('<email B>'), 'T0B');
   ```
   Then Authentication → Users → **Add user → Create new user**: the email, any long random password (nobody uses
   it), and tick **Auto Confirm User**. Do it for A and for B. No email is sent at this step.
2. In each browser open `https://gametimepicks.yashwantbalaji.com/account/`, enter the email, click **Email me a
   link**, and open the link **in that same browser**. A and B each land on `/account/` signed in. C tries the same
   and gets an error (sign-up is off). ✔ / ✘
3. A follows an NFL team and B follows an MLB team (follow buttons on team pages; then open `/account/` so the
   follow syncs). Their **My GameTime** pages order differently; the official forecasts and cards are identical. ✔ / ✘
4. A records a manual bet on `/account/`. B does not see it. ✔ / ✘
5. A's personal P/L shows staked / returned / net / open exposure that match the bet. ✔ / ✘
6. A sends one report from `/feedback`; it appears in Table editor → `beta_feedback`. ✔ / ✘
7. Revoke A: `update public.beta_access set revoked_at = now() where tester_code = 'T0A';`
   A can still see their bet, and recording a new bet or sending feedback now fails. ✔ / ✘
8. Clean up: Authentication → Users → delete A and B (this deletes their rows), then
   `delete from public.beta_access where tester_code in ('T0A','T0B');`

Post the eight ✔ / ✘ lines in the thread. Any ✘ pauses the beta until it is fixed.

## Part D · Invite the testers (3–5 friends)

For each friend, add a row (`T1`…`T5`) to `beta_access`, then **Add user → Create new user** with the same email
and **Auto Confirm User** ticked (as in Part C). In notes, logs
and feedback, refer to people only by tester code, never by name or email.

**The private-beta note** (send with the invite; adjust the greeting):

> Hey — I'd love your help testing GameTimePicks (gametimepicks.yashwantbalaji.com) for about a week, Oct 9–18.
> To sign in, go to gametimepicks.yashwantbalaji.com/account, type this email address and open the link it sends
> you (no password).
>
> What signing in stores, visible only to you: your email, the teams you follow, forecasts you save, any bets you
> choose to record by hand, and feedback you send. It's a free research site: it takes no bets and handles no
> money. There's no delete button yet; if you want anything removed, tell me and I'll delete it.
>
> This is a private test among friends. The site's full Terms and Privacy pages are still being written and will
> be published before the public launch. Please send anything confusing or broken through the Feedback link on
> your account page.

To remove a tester: `update public.beta_access set revoked_at = now() where tester_code = 'T3';` (they keep read
access to their own data). To delete their data on request: Storage → `slips` → their `<user id>/` folder first
(usually empty, since slip uploads are not part of this beta), then Authentication → Users → delete the user.

## Known non-blockers (founder-accepted)

Preferences have no screen · follows cover MLB teams, NFL teams and NFL players only · sync runs when `/account`
is opened · no in-site delete · AI slip reading off. Details: [`../SUPABASE_BETA_SETUP.md`](../SUPABASE_BETA_SETUP.md).

## Operational watch during the beta

- A free Supabase project **pauses after about a week with no activity**. If testers go quiet, open the dashboard
  once; a paused project makes sign-in fail for everyone until it is resumed.
- Supabase's built-in email sender allows only a few emails an hour. Invite testers a few at a time; if a link
  never arrives, wait an hour before resending.
