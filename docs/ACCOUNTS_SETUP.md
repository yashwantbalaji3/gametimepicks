# Accounts and slip uploads — the founder's setup

**Status: BUILT AND OFF.** The schema, the config contract and their guards are in the repository. The
site behaves exactly as it does today until the two values below exist; every account surface reads
`app/src/lib/accounts/config.mjs` first and renders "accounts are not open yet" rather than a broken
control. Nothing here is live, and no account of yours has been created — I can't create one for you.

Four things need you. They take about twenty minutes in total.

---

## 1 · Create the Supabase project (~5 min)

1. Sign up at supabase.com and create a project. Any region near your users; the free tier is enough
   for a beta.
2. Project Settings → API. You need two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public key** — a long string labelled `anon` `public`
3. There is a third key on that page, **service_role**. Do not put it in Vercel yet and never paste it
   anywhere public. It bypasses every security policy in the schema. When the upload endpoint needs it,
   it goes in as a server-only variable (no `NEXT_PUBLIC_` prefix), and a guard in the test suite fails
   the build if it is ever referenced from browser code.

## 2 · Run the schema (~2 min)

Open the project's **SQL Editor**, paste the whole of [`db/accounts-schema.sql`](../db/accounts-schema.sql),
and run it. It is idempotent, so running it twice is harmless.

What it creates:

| Table | What it holds |
|---|---|
| `profiles` | one row per account: an optional display name, your stated risk level, bankroll and unit size (so the Parlay Center matches across devices), and any limits you set for yourself — most per slip, daily loss, monthly loss. All optional, all null by default; the site imposes none and blocks nothing. |
| `bet_slips` | the slips you upload or enter: book, stake, price, legs, status, and where the image lives |
| `slips` bucket | the screenshots themselves — **private**, one folder per person, no public URLs |

Every table has row-level security enabled with policies keyed to your own user id, so one person's
rows are unreadable by anyone else, including other signed-in users. `app/src/lib/accounts/schema-contract.test.mjs`
asserts exactly that against the SQL file, so a table added later without those policies fails CI.

## 2b · Tell Supabase where the sign-in link may send people (~1 min)

**Skip this and sign-in will not work**, in a way that looks like a bug in the site: the email
arrives, the link opens, and it lands on `localhost:3000`. Supabase only honours a redirect it has
been told to allow, and its default is a local development URL.

Authentication → **URL Configuration**:

```
Site URL       https://gametimepicks.yashwantbalaji.com
Redirect URLs  https://gametimepicks.yashwantbalaji.com/account/
```

Add `http://localhost:3000/account/` as a second redirect URL only if you want to try it against a
local build; it is not needed for the live site.

One more thing worth knowing before you test: Supabase's built-in email sender is rate-limited to a
handful of messages an hour on the free tier. If the third link never arrives, that is the limit, not
a fault — wait, or connect your own SMTP under Authentication → Emails.

## 3 · Add the two values to Vercel (~3 min)

Vercel → project **gametime-picks** → Settings → Environment Variables, **Production**:

```
NEXT_PUBLIC_SUPABASE_URL       = https://<your project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = <the anon public key>
```

Both are public by design: they ship to every browser and authorise nothing on their own, because the
policies above decide what a signed-in person can read. Redeploy, or wait for the next deploy.

The **Your bets** link appears in the site's own navigation on that deploy and not before: the
destination is built only when `NEXT_PUBLIC_SUPABASE_URL` is present, so a build without a project
never offers a link to a page that could not work. No further code from me is needed to switch it on —
the page is at `/account` either way if you want to look at it first.

**For AI slip reading** (step 3 of the plan), one more, server-only, no `NEXT_PUBLIC_` prefix:

```
ANTHROPIC_API_KEY = <a key from console.anthropic.com>
```

Roughly a cent or two per screenshot read. Set a low monthly limit on the key while we're testing.

## 4 · Prove it works (~1 min)

With the keys in your shell, run:

```bash
cd app && NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npm run accounts:verify
```

It reads only — creates nothing, signs in as nobody, prints no key — and answers the question the SQL
file cannot: does the project BEHAVE the way the schema says? It asks, as an anonymous stranger, for
other people's rows. An empty answer is the pass. **If any row comes back it stops with STOP and says
row-level security is off** — that is the one result you must not ignore, because it would mean every
reader could read every reader's bets. It also checks both tables exist and that the `slips` bucket is
private (that last one needs the service-role key in the shell; without it the check says so rather
than assuming).

Exit codes: 0 ready · 1 unsafe or incomplete · 2 could not prove · 3 no keys in the shell.

---

## What I build once those exist

1. **Sign in** with an email magic link — no password to store, no password to leak.
2. **My Bets**: upload a screenshot, the AI reads the legs, odds and stake, **you confirm it**, and it
   saves. An unconfirmed reading never counts toward anything.
3. **Automatic settlement** from the official results the site already grades against.
4. **Your record**: by sport, market, leg count and price band — including the things you asked for:
   legs you repeat across parlays, your real risk mix, and how your results trend.
5. **The model's read** on a slip you uploaded, with the same honesty rules as everywhere else.

## Before real users upload slips

- **Privacy policy must cover slip data.** It goes into the counsel review that is already blocking
  the legal pages (G1): what we store, where, for how long, and how someone deletes it.
- **21+ gate and account deletion.** Deleting an account cascades to every row; the images are removed
  by the application first, because storage has no cascade.
- **Sportsbook linking** (the Pikkit-style sync you asked about) needs a licensed bet-sync provider such
  as SharpSports — it is a paid service, and storing sportsbook passwords ourselves would breach most
  books' terms. I'll bring you the cost before anything is signed.

## The honesty line, unchanged

Your slips are your data. They are never folded into the site's public record, never used to move a
published number, and never leave the database except back to you. Suggestions stay framed as research
with bankroll arithmetic — not advice — until counsel says otherwise.
