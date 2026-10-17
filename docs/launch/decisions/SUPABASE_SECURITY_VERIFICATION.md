# Decision package 2: hosted Supabase security verification (F-2, FD-3, O-10)

**Prepared:** Sat 2026-10-17, about 01:30–02:30Z, by a read-only Claude Code session.
- Nothing was run against the hosted project.
- No key was read or printed.
- Code was read at `origin/main` = `8433d82bd9`.

**Why it blocks:**
- The live RLS battery passes against a **local** Postgres on every `main` CI run: 82–84 PASS, plus the mutation suite (#1084, 10-14).
- The **hosted** project has never been checked. Nothing proves it was built from `db/accounts-schema.sql`, or that nobody changed a policy in the dashboard since.
- Accounts are live in Production.

---

## 1. What exists in the repository

| Tool | What it does | Credential | Coverage |
|---|---|---|---|
| `npm run accounts:verify`<br>`app/scripts/accounts/verify-setup.mjs` (package `app/`) | Anonymous REST probes | URL + **anon key** (optional service role) | **Reachability:** `profiles?select=id&limit=0`.<br>**Anon read** of `profiles` and `bet_slips` only.<br>**Bucket privacy:** only with `SUPABASE_SERVICE_ROLE_KEY`; otherwise `UNKNOWN`.<br>**Presence of `ANTHROPIC_API_KEY`:** reported as a WARN only.<br>**Never prints a key; creates nothing.** |
| `node app/scripts/accounts/rls-live.mjs --hosted` | Runs `db/rls-live/two-account-isolation.sql` (287 lines) through `psql`, as one transaction that ends in `ROLLBACK` | `RLS_DB_URL`: the project's **postgres connection string, including the database password** | Everything: every table and every verb, cross-user and anon, invite and revoke, storage, RLS on all `public` tables, no untested table, no definer view or matview, cascade on delete |
| `db/rls-live/*`, `app/src/lib/accounts/rls-live.test.mjs` | Local battery (CI) plus 15 injected mutations that must fail | None | Proves the **committed schema**, not the hosted project |

**Gap in `accounts:verify`.** It probes 2 of the 7 tables. It does not probe:
- `user_preferences`, `user_follows`, `saved_items`, `beta_feedback`, `beta_access`;
- anonymous writes;
- storage objects.

§3 Tier A2 covers those by hand. Extending the script is an engineering follow-up and does not block this run.

**Schema to expect** (`db/accounts-schema.sql`):
- **7 tables in `public`**, all with RLS:
  - `profiles`, `bet_slips`, `user_preferences`, `user_follows`, `saved_items` and `beta_feedback` each have 4 own-row policies (select / insert / update / delete) = **24 policies**. Insert and update also require `is_beta_member()`.
  - `beta_access` has **RLS on and no policy** (unreadable to every client).
- **Storage:** a private bucket `slips`, with 3 policies on `storage.objects`: `slips_read_own`, `slips_write_own` (requires invite) and `slips_delete_own`. There is **no** update policy.
- **Functions:**
  - `is_beta_member()`: SECURITY DEFINER; execute is granted to `authenticated` only.
  - `touch_updated_at()`: a trigger function.
- **No views.**

## 2. Minimum permissions (recommendation)

| Tier | Credential in the founder's shell | Needed? |
|---|---|---|
| A, A2: anonymous probes | Project URL + **anon (publishable) key**. This key already ships in every browser | **Yes** (minimum) |
| B: catalog read-out | None in a shell. A read-only `SELECT` in the **Supabase dashboard SQL editor**, signed in as the owner | **Yes**. It replaces the service-role bucket check and covers RLS flags, policies, definer views, grants and the bucket |
| C: two throwaway test accounts | Anon key + two test users **the founder creates** with passwords | **Yes**. It is the real cross-user attack path through the public API |
| D: full battery `--hosted` | Database password (`postgres`) | **Optional.** Only if B or C is inconclusive. It is the most privileged credential the project has |
| Service-role key | — | **Not needed. Do not put it in a shell for this.** Tier B's `storage.buckets` query answers the only question `accounts:verify` used it for |

**Rules for every tier:**
- Read keys with `read -rs` (no echo, no shell history). Never pass a key as a literal on the command line.
- `unset` the variables at the end.
- Evidence files must contain **no keys, tokens, passwords or real emails**. Replace the project ref with `<ref>`.

## 3. Procedure (founder's shell, macOS zsh, about 30–40 minutes)

**Setup:**
- Use a checkout at current `origin/main`, in your normal clone.
- Requires `node` ≥ 20, `curl` and `jq` (`brew install jq`).

```zsh
cd ~/Downloads/gametimepicks && git fetch -q origin && git checkout -q --detach origin/main
EVID=~/gtp-evidence/uat-2026-10-18/supabase; mkdir -p $EVID
read -rs "SB_URL?Supabase project URL (https://<ref>.supabase.co): "; echo
read -rs "SB_ANON?Anon / publishable key: "; echo
# The key must be the ANON key, never service_role. Prints only the role claim (legacy JWT keys)
# or the key's type (new-format keys), never the key itself:
K=$SB_ANON node -e 'const k=process.env.K,p=k.split(".");console.log(p.length===3?JSON.parse(Buffer.from(p[1],"base64url")).role:k.startsWith("sb_publishable_")?"sb_publishable":k.startsWith("sb_secret_")?"sb_secret  <-- STOP":"unknown key format")'
```
**Expected:** `anon`, or `sb_publishable_…`. **If it says `service_role` or `sb_secret`, stop.** That key must never ship to browsers. Check the Vercel value of `NEXT_PUBLIC_SUPABASE_ANON_KEY` immediately.

### Tier A: `accounts:verify` (anon only)
```zsh
(cd app && NEXT_PUBLIC_SUPABASE_URL=$SB_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$SB_ANON npm run --silent accounts:verify; echo "exit=$?") | tee $EVID/A-accounts-verify.txt
```
**Expected output** with anon only. Every line is exact text from `setup-check.mjs`:
```
[  ok  ] project: the project answers and accepts the anon key
[  ok  ] table:profiles: profiles exists and returns nothing to an anonymous reader      (or "…refuses an anonymous reader")
[  ok  ] table:bet_slips: bet_slips exists and returns nothing to an anonymous reader    (or "…refuses…")
[  ?   ] bucket:slips: no SUPABASE_SERVICE_ROLE_KEY in this shell, so the bucket's privacy was not checked — …
[ warn ] reader: ANTHROPIC_API_KEY is not set — accounts work, but a screenshot cannot be read yet

Could not prove it either way — see the unknown lines.
exit=2
```
`exit=2` / UNPROVEN is the **expected** result without the service-role key. Tier B closes the bucket line.

**Results that stop everything:**
- any `[ STOP ]` line ("RETURNED n ROW(S) to an anonymous reader");
- headline "STOP — the project is reachable but not safe…";
- `exit=1`.

### Tier A2: the tables, writes and storage the script skips (anon)
```zsh
NIL=00000000-0000-0000-0000-000000000000   # no such user: even a wrongly-allowed insert cannot persist (FK)
anon=(-H "apikey: $SB_ANON" -H "Authorization: Bearer $SB_ANON")
{ for t in profiles bet_slips user_preferences user_follows saved_items beta_feedback beta_access; do
    r=$(curl -s -w ' HTTP%{http_code}' "$SB_URL/rest/v1/$t?select=*&limit=1" $anon); print -r -- "read  $t ${r:0:140}"; done
  for pair in "bet_slips|{\"user_id\":\"$NIL\",\"source\":\"manual\"}" "profiles|{\"id\":\"$NIL\"}" \
              "user_preferences|{\"user_id\":\"$NIL\"}" "user_follows|{\"user_id\":\"$NIL\",\"kind\":\"sport\",\"entity_id\":\"x\"}" \
              "saved_items|{\"user_id\":\"$NIL\",\"kind\":\"game\",\"ref\":\"x\"}" "beta_feedback|{\"user_id\":\"$NIL\",\"route\":\"/\"}"; do
    t=${pair%%|*}; b=${pair#*|}
    r=$(curl -s -w ' HTTP%{http_code}' -X POST "$SB_URL/rest/v1/$t" $anon -H 'content-type: application/json' -H 'Prefer: return=minimal' -d "$b")
    print -r -- "write $t ${r:0:140}"; done
  n=$(curl -s -X POST "$SB_URL/storage/v1/object/list/slips" $anon -H 'content-type: application/json' -d '{"prefix":"","limit":100}' | jq 'if type=="array" then length else "non-list: "+(.|tostring|.[0:80]) end')
  print -r -- "storage anon list slips → $n"
} | tee $EVID/A2-anon-probes.txt
```
**Expected:**
- Every `read` line is `[] HTTP200`, or `{"code":"42501",…} HTTP401/403`.
- Every `write` line is HTTP401/403 with code `42501`: "new row violates row-level security policy", or "permission denied for function is_beta_member".
- The storage line is `0` or a `non-list` error.

**STOP if:**
- any read returns a non-empty array;
- any write returns HTTP201, or HTTP409 with `23503` (a foreign-key error means RLS let the insert through);
- the storage list is > 0.

### Tier B: catalog read-out (dashboard → SQL editor; read-only SELECTs)
Paste and run each query. Export each result as CSV into `$EVID/B-*.csv`. Counts only; no personal data is selected.

```sql
-- B1  RLS on every table in public (expect exactly 7 rows, rls = true on all)
select c.relname, c.relkind, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r','p') order by 1;

-- B2  Policies (expect 24 public policies: 4 per table x 6 tables, none on beta_access;
--     storage: slips_read_own, slips_write_own, slips_delete_own and nothing else touching bucket 'slips')
select schemaname, tablename, policyname, cmd, roles, qual, with_check from pg_policies
 where schemaname in ('public','storage') order by 1, 2, 3;

-- B3  Policies that are open (expect 0 rows): a USING/WITH CHECK of plain true, or a policy not keyed to auth.uid()
select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies
 where schemaname in ('public','storage')
   and (coalesce(qual,'') in ('true','(true)') or coalesce(with_check,'') in ('true','(true)')
        or (coalesce(qual,'') || coalesce(with_check,'')) not ilike '%auth.uid()%');

-- B4  Views / materialized views in public (expect 0 rows; any row must be security_invoker=true)
select c.relname, c.relkind, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('v','m');

-- B5  The bucket (expect one row: slips, public = false)
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;

-- B6  RLS on storage.objects (expect true)
select relrowsecurity from pg_class where oid = 'storage.objects'::regclass;

-- B7  SECURITY DEFINER functions in public and who may run them
--     (expect is_beta_member: definer = true, anon_exec = false, auth_exec = true)
select p.proname, p.prosecdef as definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1;

-- B8  Sign-ups that bypassed the invite list (counts only). A non-zero "uninvited" means sign-up was open.
select count(*) as auth_users,
       count(*) filter (where not exists (select 1 from public.beta_access b where b.email = lower(u.email))) as uninvited
  from auth.users u;
```
**Also record from the dashboard** (screenshots, project ref blurred):
- **Authentication → Providers → Email:** "Allow new users to sign up" = **OFF** (`docs/SUPABASE_BETA_SETUP.md:50`), unless FD-2 chooses public sign-up.
- **Authentication → URL Configuration:**
  - Site URL = `https://gametimepicks.yashwantbalaji.com`;
  - the redirect allow-list contains only `https://gametimepicks.yashwantbalaji.com/account/` (and preview URLs you intend).
- **Authentication → Emails / SMTP:** which sender delivers magic links. This answers Privacy package question 8.

**STOP if:**
- B1 has a `false`, or any table beyond the 7;
- B3 or B4 return rows;
- B5 shows `public = true`;
- B6 is false;
- B7 shows `anon_exec = true`.

### Tier C: two founder-created throwaway accounts (the real cross-user path)

**Setup (dashboard):**
1. **Authentication → Users → Add user → Create new user**, twice. Use two addresses you control (for example plus-addresses), each with a strong one-off password and **Auto Confirm** on.
2. In the SQL editor: `insert into public.beta_access (email, tester_code) values (lower('<A email>'),'UAT-A'), (lower('<B email>'),'UAT-B');`

**In the shell:**
```zsh
read -r "EA?UAT-A email: "; read -rs "PA?UAT-A password: "; echo
read -r "EB?UAT-B email: "; read -rs "PB?UAT-B password: "; echo
tok() { curl -s "$SB_URL/auth/v1/token?grant_type=password" -H "apikey: $SB_ANON" -H 'content-type: application/json' \
          -d "$(jq -nc --arg e "$1" --arg p "$2" '{email:$e,password:$p}')"; }
RA=$(tok $EA $PA); TA=$(print -r -- $RA | jq -r .access_token); UA=$(print -r -- $RA | jq -r .user.id)
RB=$(tok $EB $PB); TB=$(print -r -- $RB | jq -r .access_token); UB=$(print -r -- $RB | jq -r .user.id)
unset RA RB PA PB; print "A token ${#TA} chars, B token ${#TB} chars"   # lengths only
A=(-H "apikey: $SB_ANON" -H "Authorization: Bearer $TA"); B=(-H "apikey: $SB_ANON" -H "Authorization: Bearer $TB")
J=(-H 'content-type: application/json' -H 'Prefer: return=representation')
R=$SB_URL/rest/v1; S=$SB_URL/storage/v1/object
{
SID=$(curl -s -X POST $R/bet_slips $A $J -d "{\"user_id\":\"$UA\",\"source\":\"manual\",\"book\":\"UAT\",\"stake\":1}" | jq -r '.[0].id')
print "C1  A records a bet → id ${SID:0:8}… (expect a uuid)"
print "C2  B reads A's bet        → $(curl -s "$R/bet_slips?id=eq.$SID" $B)   (expect [])"
print "C3  B updates A's bet      → $(curl -s -X PATCH "$R/bet_slips?id=eq.$SID" $B $J -d '{"stake":999}')   (expect [])"
print "C4  B blanket-updates A    → $(curl -s -X PATCH "$R/bet_slips?user_id=eq.$UA" $B $J -d '{"stake":999}')   (expect [])"
print "C5  B deletes A's bet      → $(curl -s -X DELETE "$R/bet_slips?id=eq.$SID" $B -H 'Prefer: return=representation')   (expect [])"
print "C6  B writes as A          → $(curl -s -w ' HTTP%{http_code}' -X POST $R/bet_slips $B $J -d "{\"user_id\":\"$UA\",\"source\":\"manual\"}" | cut -c1-120)   (expect 42501 HTTP401/403)"
print "C7  A still has stake 1    → $(curl -s "$R/bet_slips?id=eq.$SID&select=stake" $A)   (expect [{\"stake\":1}])"
for t in profiles user_preferences user_follows saved_items beta_feedback beta_access; do
  print "C8  B reads $t → $(curl -s "$R/$t?select=*" $B | jq 'if type=="array" then length else . end')   (expect 0)"; done
printf '\x89PNG\r\n\x1a\n' > /tmp/uat.png
print "C9  A uploads own image    → $(curl -s -o /dev/null -w '%{http_code}' -X POST "$S/slips/$UA/uat.png" $A -H 'content-type: image/png' --data-binary @/tmp/uat.png)   (expect 200)"
print "C10 B reads A's image      → $(curl -s -o /dev/null -w '%{http_code}' "$S/slips/$UA/uat.png" $B)   (expect 400 or 404)"
print "C11 B writes A's folder    → $(curl -s -o /dev/null -w '%{http_code}' -X POST "$S/slips/$UA/b.png" $B -H 'content-type: image/png' --data-binary @/tmp/uat.png)   (expect 400 or 403)"
print "C12 B lists A's folder     → $(curl -s -X POST "$S/list/slips" $B -H 'content-type: application/json' -d "{\"prefix\":\"$UA\"}" | jq 'if type=="array" then length else . end')   (expect 0)"
print "C13 B deletes A's image    → $(curl -s -X DELETE "$S/slips" $B -H 'content-type: application/json' -d "{\"prefixes\":[\"$UA/uat.png\"]}" | jq 'if type=="array" then length else . end')   (expect 0)"
print "C14 A still reads image    → $(curl -s -o /dev/null -w '%{http_code}' "$S/slips/$UA/uat.png" $A)   (expect 200)"
print "C15 A deletes own image    → $(curl -s -X DELETE "$S/slips" $A -H 'content-type: application/json' -d "{\"prefixes\":[\"$UA/uat.png\"]}" | jq 'length')   (expect 1)"
print "C16 A deletes own bet      → $(curl -s -X DELETE "$R/bet_slips?id=eq.$SID" $A -H 'Prefer: return=representation' | jq 'length')   (expect 1)"
} | tee $EVID/C-two-account.txt
```

**Clean-up** (the same day; record it):
1. **Authentication → Users:** delete UAT-A and UAT-B. This cascades every row.
2. `delete from public.beta_access where tester_code in ('UAT-A','UAT-B');`
3. Confirm with:
   ```sql
   select (select count(*) from storage.objects where bucket_id='slips' and name like '<UA>/%') as objs,
          (select count(*) from public.beta_access where tester_code like 'UAT-%') as invites;
   ```
   Expect `0, 0`.
4. In the shell: `unset SB_URL SB_ANON TA TB UA UB EA EB SID; rm -f /tmp/uat.png`.

**STOP if** any line differs from its expectation in a way that grants access, specifically C2–C6, C8, C10–C13. A C9, C14 or C15 failure (own access refused) is a product defect, not a leak. Record it as a finding.

### Tier D (optional): full battery, `--hosted`
Use it only if B or C is inconclusive, or if the founder wants the complete proof. Two routes:
- `read -rs "RLS_DB_URL?postgres connection string (Session pooler): "; export RLS_DB_URL; node app/scripts/accounts/rls-live.mjs --hosted | tee $EVID/D-battery.txt; unset RLS_DB_URL`
  - Needs `psql` (`brew install libpq && brew link --force libpq`).
  - **Expected last line:** `✓ RLS LIVE ISOLATION: PASS (hosted project)`.
- Or paste `db/rls-live/two-account-isolation.sql` into the dashboard SQL editor, **after deleting line 16** (`\set ON_ERROR_STOP on`, a psql-only command).
  - **Expected result row:** `RLS LIVE ISOLATION: PASS`.
  - No credential leaves the dashboard.
  - This route was not tested.

Either route is one transaction ending in `ROLLBACK`. It inserts 4 fixture users, 3 invites and 2 storage rows, then rolls them back.

**Platform caveat** (not verified here): the hosted platform restricts what `postgres` may do in the `auth` and `storage` schemas. If the run stops at the fixture setup (`insert into auth.users` / `storage.objects`) with a permission error, or with a storage message forbidding direct table writes, that is **INCONCLUSIVE, not a leak**. Record the message; Tiers B + C stand.

## 4. Evidence checklist (redacted)

| File | Contents |
|---|---|
| `A-accounts-verify.txt` | Full script output and exit code |
| `A2-anon-probes.txt` | 7 reads, 6 writes, 1 storage line |
| `B1…B8.csv` + 3 dashboard screenshots | Catalog output; sign-up toggle; URL configuration; email sender |
| `C-two-account.txt` | C1–C16, plus the clean-up confirmation query result |
| `D-battery.txt` (optional) | The PASS line |
| `README.txt` | Date and time (UTC), checkout SHA (`git rev-parse HEAD`), who ran it, and the statement "no keys or tokens in these files" |

Post the summary to the matrix as O-10: PRODUCTION VERIFIED, with date, SHA, and Tier A/A2/B/C results.

## 5. Decision rule

- **All tiers as expected:** F-2 closes; O-10 becomes PRODUCTION VERIFIED.
- **Any STOP:** do not invite or launch with accounts. Take the L-06 disable option (package 1 §5 B) until the schema is re-applied (`db/accounts-schema.sql` is idempotent) and the tiers re-run clean.
- **B8 `uninvited` > 0:** sign-up was open at some point. Those users can sign in but cannot write (policies). FD-2 must say whether that is acceptable, and the Privacy text must cover them (package 1 row 2).

## 6. Exact founder questions

1. **FD-3 (revised):** Do you authorize Tiers A, A2, B and C as written: anon key in your shell, catalog SELECTs in the SQL editor, and two throwaway accounts you create and then delete? This means **no service-role key** and, unless needed, **no database password**.
2. Do you also want Tier D (database password or SQL editor), or only if B or C is inconclusive?
3. When will you run it? The proposal is Sat 10-17 or Sun 10-18 morning, before the go/no-go. It does not touch Vercel and needs no NFL-window restriction.
4. Confirm the outcome of the dashboard checks: is "Allow new users to sign up" OFF? Which email sender is used?

---

## 7. Tier summary for the founder (added Sat 2026-10-17 ~06:45Z)

Nothing in this section was run against the hosted project. Code was re-read at `origin/main` = `2c617c780c`. `db/`, `app/src/lib/accounts/` and `app/scripts/accounts/` are unchanged since `8433d82bd9`.

| Tier | Purpose | Required permissions | Test identities | Expected results | Risks | Cleanup | Evidence to retain (redacted) |
|---|---|---|---|---|---|---|---|
| **A**: `accounts:verify` | The project answers, the anon key is accepted, and `profiles` and `bet_slips` give an anonymous reader nothing | Project URL + **anon key**. Not privileged: it ships in every browser | None (anonymous) | `ok` on project, `profiles` and `bet_slips`; `?` on the bucket; `exit=2` (UNPROVEN) is the expected headline without the service-role key | Very low. Read-only, creates nothing. The one real risk is pasting the **service-role** key by mistake; the role check in §3 catches it | `unset SB_URL SB_ANON` | `A-accounts-verify.txt` (script output; it never prints a key) |
| **A2**: anon probes of the rest | The 5 tables `accounts:verify` skips, anonymous **writes** on 6 tables, and an anonymous storage listing | Same as A | None (anonymous). Writes use the nil UUID, which no user has, so even a wrongly allowed insert cannot persist (FK) | Reads `[]` or `42501`; writes HTTP 401/403 `42501`; storage list `0` or an error | Low. If RLS were open, a write could be accepted and fail only on the FK (`23503`), which is itself the STOP signal | None needed | `A2-anon-probes.txt` |
| **A3** (new, optional): sign-up toggle | Answers "is sign-up open?" from outside, before Tier B. Supabase Auth publishes its settings to any holder of the anon key: `curl -s "$SB_URL/auth/v1/settings" -H "apikey: $SB_ANON" \| jq '{disable_signup, mailer_autoconfirm}'` | Same as A | None | `disable_signup: true` for invite-only (FD-2). Endpoint behaviour is from Supabase's documented Auth API; **not run or verified here** | None; a GET of public settings | None | `A3-auth-settings.json` (two booleans) |
| **B**: catalog read-out | Proves the **hosted** schema matches `db/accounts-schema.sql`: RLS on all 7 tables, exactly the expected policies, none open, no definer views, bucket private, `is_beta_member` not executable by anon, and how many users bypassed the invite list | Founder signed in to the Supabase dashboard as owner, using the **SQL editor** with read-only SELECTs. No key in any shell | None. B8 returns **counts only** | B1: 7 rows, all `rls = true`. B2: 24 public policies + 3 storage. B3, B4: 0 rows. B5: `slips`, `public = false`. B6: true. B7: `anon_exec = false`. B8: `uninvited = 0`. Dashboard: sign-up OFF; redirect allow-list = `/account/` only | Low. SELECTs only. B8 reads `auth.users` but selects only counts. Risk of accidentally running a write in the editor: paste only the listed queries | None | `B1…B8.csv` + 3 dashboard screenshots with the project ref blurred |
| **C**: two throwaway accounts | The real attack path: a signed-in user B tries to read, change, delete or impersonate user A's rows and images through the public API | Dashboard owner, to create 2 users with Auto Confirm and add 2 `beta_access` rows; then anon key + those two users' passwords in the shell | **UAT-A and UAT-B**: two addresses the founder controls (plus-addresses), one-off strong passwords, tester codes `UAT-A`, `UAT-B`. **Never a real tester's account** | C1 uuid; C2–C5 `[]`; C6 `42501`; C7 `[{"stake":1}]`; C8 `0` ×6; C9 200; C10 400/404; C11 400/403; C12, C13 `0`; C14 200; C15, C16 `1` | Low to medium. It creates real rows and one storage object in Production's project. Leftovers would sit in the real database, and the two users count as accounts. Passwords and tokens exist in the shell until unset | **Same day:** delete UAT-A and UAT-B in Authentication → Users (cascades all rows); `delete from public.beta_access where tester_code in ('UAT-A','UAT-B')`; confirm query = `0, 0`; `unset …; rm -f /tmp/uat.png` | `C-two-account.txt` (C1–C16 outputs: ids truncated to 8 characters; token **lengths** only) + the clean-up query result |
| **D** (optional): full battery `--hosted` | Every table × every verb, cross-user and anon, invite and revoke, storage, cascade: the same battery CI runs locally, against the hosted database | **Database password** (`postgres` connection string). The most privileged credential the project has. Or paste the SQL into the dashboard editor (no credential leaves it) | 4 fixture users, 3 invites and 2 storage rows created **inside one transaction** | Last line `✓ RLS LIVE ISOLATION: PASS (hosted project)`. A permission error at fixture setup on `auth` or `storage` = **INCONCLUSIVE**, not a leak | Medium: the credential's power. The transaction ends in `ROLLBACK`, so nothing persists. The editor route is untested | `unset RLS_DB_URL`; nothing in the database (rolled back) | `D-battery.txt` (PASS line or the exact inconclusive message) |
| Service-role key | — | **Not used by any tier.** Tier B answers the only question `accounts:verify` used it for (bucket privacy) | — | — | It bypasses RLS entirely. Keep it out of shells | — | — |

**What can be checked with no privileged credentials:**

| Check | Credential | Who may run it | Status |
|---|---|---|---|
| The **committed** schema's isolation: local RLS battery (82–84 PASS) plus 15 mutations that must fail | None | CI on every `main` run | **Done (CI).** It proves the file, not the hosted project |
| Tiers A, A2, A3 | The anon key, public by design | The founder's shell, per UAT ground rule 3 (Claude sessions enter no keys) | Not run |
| The shipped key is the anon role, not service-role | None: decode the role claim from the key inlined in Production's JS. Never print the key | Founder in DevTools, or Eng in a real browser, printing the role claim only | Not run |
| Production surfaces: "Your bets" link present, `/account/` "Checking your session…", `/api/slip-read` 503 | None | Eng in a browser | Verified 10-16 (matrix P-24) |
| Tiers B, C and D | Dashboard owner, or the database password | Founder only | Not run |

**Bottom line:**
- Nothing that proves **hosted** isolation can be done without at least the anon key (A–A3), the dashboard (B, C) or the database password (D).
- The minimum set that closes F-2 is **A + A2 + B + C**: no service-role key and no database password.
