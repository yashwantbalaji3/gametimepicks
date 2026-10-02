# OPTIONAL — Supabase setup task packet (standalone)

**Optional.** The founder decides whether to hand this to someone. Nobody is assigned. It contains no product
or methodology decisions.

## Goal
Create the GameTime Picks Supabase project so the already-built accounts (off by default) can be switched on
for a ~10-person friends beta.

## Steps (about 20 minutes)

1. **Create the project.** At supabase.com → New project, name it `gametimepicks` and pick the US region.
   Save the database password in your own password manager, not in a file or chat.
2. **Record:**
   - the Project URL (`https://<ref>.supabase.co`);
   - the **anon / publishable** key (Settings → API).

   Do not copy the `service_role` key anywhere except Vercel (step 6).
3. **Auth settings.** In Authentication → Providers → Email: Email provider ON; "Allow new users to sign up"
   **OFF** (the beta is invite-only).
4. **Redirect URLs.** In Authentication → URL Configuration:
   - Site URL: `https://gametimepicks.yashwantbalaji.com`
   - Redirect URLs: `https://gametimepicks.yashwantbalaji.com/account/`
5. **Apply the schema.** In the SQL editor, paste the whole of `db/accounts-schema.sql` from the repository
   and Run. It is idempotent, so running it twice is safe. No other migration command is needed.
6. **Vercel env.** In Vercel project `gametime-picks` → Settings → Environment Variables → Production, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = the service_role key (server-only, **no** `NEXT_PUBLIC_` prefix), only if
     AI slip reading is wanted

   Then **redeploy**. Env vars bind at build time.
7. **RLS verification.** Run:
   ```
   cd app && NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… npm run accounts:verify
   ```
   The verdict must not be REFUSE (REFUSE means anonymous rows are readable or the bucket is public).
8. **One test account.** Insert yourself into the allowlist:
   ```sql
   insert into public.beta_access (email, tester_code) values (lower('<your email>'), 'T0');
   ```
   Then Authentication → Users → Invite user (same email). Open the link, land on `/account/`, record one
   manual test bet, and confirm it appears. Delete the test user afterwards; this cascades.

## Rules
- Commit no secrets. Keys go only into Vercel and your password manager.
- Read no tester's bets or feedback beyond your own test account.
- Make no changes to product, model or methodology.
- When done, send the founder: the Project URL (not the keys), the `accounts:verify` verdict, and the test
  account result.
