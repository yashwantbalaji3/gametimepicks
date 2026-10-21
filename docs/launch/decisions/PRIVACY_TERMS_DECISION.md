# Decision package 1: Privacy Notice and Terms of Use (F-1, FD-1, FD-2)

**Prepared:** Sat 2026-10-17, about 01:20–02:30Z, by a read-only Claude Code session. Docs only.
**Code read at:** `origin/main` = `8433d82bd9`, and #1077 (`claude/legal-drafts-accounts`, head `9de2f79bd2`).
**Production checks in this pass:**
- One GET of `/` at 01:19:37Z (deployment `dpl_Bw3YaTt4gJPn5pmVuWfmCJHovcV9`).
- The layout chunk, 4 shared JS chunks, and the site stylesheet that page references.
- Two GETs of `/api/ask/`; both returned 405 (see package 3).

No request was challenged.

> **Nothing in this document is legal advice, an approval or a signature.** Every `[FOUNDER: …]` or `[COUNSEL: …]` marker is a value only the founder or a qualified reviewer can supply. None was invented.

---

## 1. What the founder must supply

These are the parameters the gate reads. They live in `app/src/lib/legal/texts.mjs` (`LEGAL_PARAMETERS`).

| # | Parameter | Value on `main` today | Why it blocks | Founder must supply |
|---|---|---|---|---|
| 1 | **Operator: legal entity name** (`operator`) | `"GameTime Picks"`, `placeholder: true` (founder, 2026-09-10: "use … as a placeholder") | `legalReadiness()` refuses any placeholder: "a stand-in cannot be a party to the terms". It appears in Terms §About, §Our content and §Limitation of liability | `[FOUNDER: exact legal name of the person or entity that operates the site, e.g. an LLC's registered name or your own name as sole proprietor]` |
| 2 | **Contact address** | Not a parameter. `contact` renders as "the 'Contact support' link at the bottom of every page". It resolves only when the build has `GTP_SUPPORT_*` set; Production's footer shows "Contact support · We reply within 2 business days" (verified 01:19Z) | Counsel may require a postal or email address for the operator (state privacy laws, the Terms' notices clause). The text has no slot for one today, so adding it is a text change and gives a new hash | `[FOUNDER: postal address and/or monitored email for legal notices, or COUNSEL confirms the support link is sufficient]` |
| 3 | **Governing state** (`state`) | `null`, so it renders `[to be decided: state]` in Terms §Governing law | Unresolved parameter | `[FOUNDER: US state whose law governs the Terms; normally the entity's home state]` |
| 4 | **Minimum age** (`minimumAge`) | `"18"` (founder 2026-09-10; counsel question 7). `/responsible-use/` says "18 or older in the United States" | **Conflict:** `docs/ACCOUNTS_SETUP.md:127` says "21+ gate". **No age gate or attestation exists in the sign-in flow** (`sign-in-panel.tsx` sends a magic link with no age check) | `[FOUNDER: 18 or 21]`, plus `[COUNSEL: is an attestation or gate required at sign-in?]` |
| 5 | **Effective date** (`effectiveDate` parameter **and** the manifest `effectiveDate`) | Both `null` | Both are required. The parameter is rendered into the text, so it is part of the reviewed hash: set it *before* hashing | `[FOUNDER/COUNSEL: YYYY-MM-DD]` |
| 6 | **Jurisdictions and geo restrictions** (`audience`) | `"the United States"` | **Not enforced anywhere.** There is no IP-country logic in `app/src`, `app/api` or `app/vercel.json`. The text states the audience; it does not restrict it | `[FOUNDER: US-wide, or excluded states]`. `[COUNSEL: is a stated audience enough, or is geo-blocking needed?]` |
| 7 | **Site** (`site`) | `gametimepicks.yashwantbalaji.com` | If launch uses another domain, this value changes and so does the hash | `[FOUNDER: confirm the launch domain]` |
| 8 | Analytics retention (`analyticsRetentionDays`) | `"90"`. Enforced by the Vercel cron `/api/analytics-retention/` at `17 7 * * *` (`app/vercel.json`) | Already decided | No input needed |

## 2. The publication gate (by design, both routes are 404 until it opens)

**Code path:**
1. `app/src/lib/legal/texts.mjs` `legalReadiness(id)` calls `content-manifest.mjs` `canPublishLegal(manifest, id)`. It then adds:
   - unresolved parameters;
   - placeholder parameters;
   - "text changed after it was reviewed" (approved hash ≠ `legalContentHash(id)`).
2. Three places enforce it:
   - **The page:** `app/src/lib/legal/guard.ts` `guardLegalRoute()` calls `notFound()` in a production build unless the page is publishable. The only exception is the internal review build, `NEXT_PUBLIC_INTERNAL_ROUTES=1`.
   - **The export:** `app/scripts/prune-internal-routes.mjs:40` deletes `terms/` and `privacy/` from `out/` while `legalRouteIsPublic()` is false.
   - **The footer:** `app/src/components/footer.tsx:20` links to Terms and Privacy only when they are public.

**`canPublishLegal()` requires every one of these:**

| Manifest field (`LEGAL_CONTENT_MANIFEST.sections.<id>`) | Rule | Evidence the founder must hold |
|---|---|---|
| `status` | Must be `"APPROVED"`. Today: terms and privacy are `DRAFT_FOR_REVIEW`; responsible-use is `LEGAL_COUNSEL_REQUIRED` | — |
| `approval.reviewer` | A named human. "never inferred from a commit" | `[COUNSEL: reviewer's full name]` |
| `approval.role` | Required | `[COUNSEL: e.g. "Attorney, admitted in <state>", with firm]` |
| `approval.approvedOn` | A parseable ISO date | `[COUNSEL: YYYY-MM-DD]` |
| `approval.packetVersion` | A number: which packet version was reviewed. `LEGAL_MANIFEST_VERSION = 1`; the packet is `docs/LEGAL_SECTION3_DECISION_PACKET.md` | `[COUNSEL: packet version reviewed]` |
| `approval.contentHash` | 12–64 hex characters. It must **equal** `legalContentHash(id)` of the text as built | The sha256 printed in the exported draft counsel signed off on |
| `effectiveDate` | A parseable date | Same as §1 row 5 |

**The hash depends on the build environment.**
- The Privacy text has two variants, chosen by `ANALYTICS_LIVE` (`NEXT_PUBLIC_ANALYTICS_ENABLED === "1"` plus a non-empty `NEXT_PUBLIC_ANALYTICS_ENDPOINT`).
- `contact` resolves only when `GTP_SUPPORT_*` is set.
- **Analytics is ON in Production.** Verified 01:19Z: the shipped chunk `3972-01e499bf0759b758.js` inlines `NEXT_PUBLIC_ANALYTICS_ENABLED:"1"` and the endpoint `https://gametimepicks.yashwantbalaji.com/api/collect/`.
- This settles matrix O-19: `docs/legal/COUNSEL_REVIEW_BRIEF.md` ("on since 2026-09-10") is right. `docs/ANALYTICS_ACTIVATION_STATUS.md` and internal-alpha-day's local reading are stale.
- So the reviewed text must be exported with those two analytics values and the support variables set. Otherwise the approved hash will not match what Vercel renders, and the page stays 404.

**How the gate is opened.** This is one code PR, reviewed and merged by the founder, and only after counsel signs:
1. Merge or rebase the accurate text (#1077, plus the corrections in §4 below) into `texts.mjs`.
2. Set `LEGAL_PARAMETERS`:
   - `operator.value` = entity, and remove `placeholder`;
   - `state.value`;
   - `minimumAge.value`;
   - `effectiveDate.value`.
3. Export with the Production-equivalent env:
   - `cd app && NEXT_PUBLIC_ANALYTICS_ENABLED=1 NEXT_PUBLIC_ANALYTICS_ENDPOINT=https://gametimepicks.yashwantbalaji.com/api/collect/ GTP_SUPPORT_DESTINATION=… GTP_SUPPORT_OWNER=… GTP_SUPPORT_RESPONSE=… node scripts/legal/export-legal-drafts.mjs`
   - It writes `docs/legal/{terms,privacy}-draft.md`, each headed by its sha256.
   - The support values are the founder's own; they are not printed in the drafts.
4. Counsel reviews **those exact files**. Any edit means re-export and re-review.
5. Set the manifest `status: "APPROVED"`, the `approval {reviewer, role, approvedOn, packetVersion, contentHash}` and `effectiveDate`.
6. Before merging, run `node -e` with `legalReadiness('terms')` and `legalReadiness('privacy')` in the same env. Both must say `publishable: true`, `reasons: []`.
7. After the Production build:
   - `/terms/` and `/privacy/` return 200;
   - the footer shows both links;
   - `legal-route-gating.test.mjs` passes on the built export.

Responsible-use stays `PUBLISH_AS_PROTECTIVE` and is not gated. It is in `REQUIRED_SECTIONS`, so the *set* (`canPublishLegalSet`) also needs it approved; only `lib/beta/access.mjs` invitation prerequisites read that.

## 3. Legal-review requirements

- **A qualified reviewer** must be named in the manifest. No counsel engagement is recorded anywhere (matrix L-05).
- **Scope to send:**
  - counsel brief questions 6–11 (`docs/LEGAL_SECTION3_DECISION_PACKET.md` Part B);
  - matrix L-05 (a)–(d);
  - every row of the table in §4 marked **COUNSEL**.
- **Re-issue the counsel brief.** `docs/legal/COUNSEL_REVIEW_BRIEF.md:9` on `main` still says "No … accounts, logins". That is false in Production.
- **Deliverable from counsel:** the approved text (as exported hashes), reviewer name and role, date, packet version and effective date. No email thread or verbal "looks fine" satisfies the gate, by design.

## 4. Discrepancy table: draft text vs Production capability (verified from code)

**Columns:**
- **Main** = `texts.mjs` on `origin/main`.
- **#1077** = `9de2f79bd2`.
- **Verdict:**
  - OK = accurate.
  - **WRONG** = false today.
  - **GAP** = a true flow that is not disclosed.
  - **COUNSEL** = needs a legal judgement.

| # | Area | Draft says (Main / #1077) | Production capability (evidence) | Verdict |
|---|---|---|---|---|
| 1 | Accounts exist | Main Terms: the Site does not "operate user accounts". Main Privacy: "has no user accounts". #1077: "Optional accounts" | Supabase magic-link accounts are live: "Your bets" nav, `/account/` (matrix P-24). `lib/accounts/client.mjs` `createClient(..., {persistSession, flowType:"pkce"})` | Main **WRONG**; #1077 OK |
| 2 | Who can have an account | #1077: "If you choose to create one, you sign in with a one-time link" | It is invite-only by design. `db/accounts-schema.sql` `beta_access` allowlist + `is_beta_member()` on every write policy. `docs/SUPABASE_BETA_SETUP.md:50` says to turn **off** "Allow new users to sign up". A stranger cannot write anything. Whether sign-up is actually off in the hosted project is **unverified** (package 2) | **GAP**: the text implies open sign-up. `[FOUNDER: are accounts public at launch, or still invite-only?]` |
| 3 | What an account stores | #1077: email; display name, risk, bankroll, unit size, limits; follows and saves; bets (book, stake, price, legs, status) and screenshots | Schema matches, plus: `bet_slips.placed_at/settled_at/returned/official_card_id/source/confirmed_at`; `saved_items.snapshot` (≤16 KB copy of the forecast); `user_follows.label` | #1077 OK at the level of detail; field list not exhaustive (COUNSEL: is "bets you enter" enough?) |
| 4 | Feedback form | Neither draft mentions it | `/feedback` (`beta-feedback-form.tsx:45`) inserts into `beta_feedback`: route, sport, product, action, **free-text expected/actual**, severity, link, kind. The founder reads it in the Supabase dashboard | **GAP** in both |
| 5 | Invite allowlist | Neither | `beta_access` stores invited **emails** + tester code + invite/revoke times. It does not cascade on account deletion (battery line 268) | **GAP**: #1077 says email is used "only to sign you in and to reply" |
| 6 | `user_preferences` table | Neither | Exists with RLS; **nothing writes it today** (`SUPABASE_BETA_SETUP.md` "Preferences have no screen") | OK to omit while unused; becomes a GAP when wired |
| 7 | Sign-in metadata held by Supabase | #1077: "held by Supabase, our database and sign-in provider" | Supabase Auth also keeps its own sign-in records (sessions, audit log, which can include IP address and user agent) and sends the magic-link email (Supabase's mailer or a custom SMTP; which one is unknown) | **GAP/COUNSEL**: `[FOUNDER: which email sender does the project use?]` |
| 8 | Browser storage | Main and #1077 name: prefs, follows, slip picks, saved forecasts, My GameTime observation record, arrival session value, account sync baseline. #1077 adds "sign-in session in its local storage" | `texts.test.mjs` FACT guard pins 7 storage-using files. Supabase-js keeps the session and the PKCE verifier in localStorage (default storage). The `gtp_src` sessionStorage value is confirmed in the Production layout chunk | #1077 OK; main lacks the session (**GAP**, closed by #1077) |
| 9 | Cookies | Both: "sets no cookies" | No `document.cookie=` / `cookies().set` / `Set-Cookie` in `src` (FACT guard). Supabase client uses localStorage, not cookies | OK. Third-party hosts (row 12) may set their own; COUNSEL |
| 10 | Analytics | Both render the variant chosen by the build flag | **ON in Production** (§2). `/api/collect` keeps only allowlisted enum fields, no IP/UA/referrer (`_collect-core.mjs`). Stored in Vercel Blob (private) when `BLOB_READ_WRITE_TOKEN` is set, else a log line. Deleted after 90 days by cron | The text is OK **if hashed with the Production flag**. COUNSEL Q10 (consent basis). `[FOUNDER: is BLOB_READ_WRITE_TOKEN set? (decides "stored" vs "logged only")]` |
| 11 | Ask GameTime: what is sent | #1077: "your question and the earlier messages in that conversation are sent to Google's Gemini API" | It also sends the **risk style and "entertainment bankroll"** the user sets in Ask's wagering bar or types (`ask-app.tsx:102`, `conversation.mjs` `normalisePreferences`, `writer.mjs:137-140` puts them in the model prompt), plus the page context (page type, id, sport). Up to the last 12 messages, ≤2,000 chars each | **GAP** in #1077. Main: **GAP** (no Ask disclosure at all) |
| 12 | Ask: storage of questions | #1077: "We do not store your questions or the answers. Our server logs record only technical details" | Confirmed: `askAuditLine` (`_ask-core.mjs:149`) logs status, tools, timings and tokens; no question or answer text (#1077 adds a guard test). Vercel's own request logs (IP, path) still exist | OK. COUNSEL: Google's retention under the Gemini API terms. `[FOUNDER: confirm the Gemini project is on a paid/billing-enabled tier]`; free-tier terms let Google use content to improve its products |
| 13 | Third parties the browser contacts | Both: Vercel; mlbstatic.com, espncdn.com, nba.com images; Gmail for support | **Google Fonts is loaded on every page.** Production CSS `b6b54e1a9036c7be.css` begins `@import url("https://fonts.googleapis.com/css2?family=Geist…")` (from `app/src/app/globals.css:10`); CSP allows `fonts.googleapis.com` / `fonts.gstatic.com`. **Supabase** (`*.supabase.co`, REST, auth, storage, websocket per CSP `connect-src`) is contacted by the browser on `/account` and `/feedback` | **WRONG** in both (Fonts omitted). #1077 names Supabase as holder, not as a host the browser contacts (minor) |
| 14 | Live scores | Neither | Browsers call first-party `/api/live`; ESPN and MLB are called server-side (`app/api/_live-core.mjs`). No browser contact with ESPN APIs | OK |
| 15 | Slip screenshots | #1077: "any screenshot of a bet slip you upload … kept in private storage" and "Reading slip screenshots automatically is not currently switched on" | Upload happens **before** reading: `slip-upload.tsx:47` stores the image in `slips/<uid>/`, then `/api/slip-read` answers 503. The image **stays stored with no bet row** (orphaned) and the UI shows the 503 reason. On `main` that reason names config variables (#1090 fixes it) | Text OK. **Behaviour GAP**: users are not told the image was kept. `[FOUNDER: accept, or hide upload while reading is off (code change)]` |
| 16 | Deletion and retention | #1077: "until you delete it or ask us to … contact us … we will confirm" | No in-site delete. The manual runbook (`SUPABASE_BETA_SETUP.md:60`) deletes the `slips/<uid>/` folder first, then the auth user (cascade), then the `beta_access` row. Vercel logs and the Gmail support thread are outside it | OK as written; COUNSEL L-05(d) (is manual deletion acceptable?). Add `beta_access` and feedback to the deletion scope |
| 17 | Access and export rights | #1077: "ask us for a copy … correct or delete" | No export tooling. The founder would query the dashboard by hand | OK as a promise; it is an operational duty |
| 18 | "No real money" vs entered bets | Terms (both): "No real money is involved." #1077 adds: entering a bet "records it for your own tracking only" | `bet_slips` holds "a slip the user actually placed" (`accounts-schema.sql`): real-money wagers made elsewhere, with stake/returned and self-set loss limits | **COUNSEL** (L-05 b): the sentences sit side by side; wording needs review |
| 19 | Sportsbook links | Terms (both): does not "link to or partner with any sportsbook" | No sportsbook hrefs found in `src` (only `provider-fake.mjs`, a test fake) | OK |
| 20 | Age | Both: "adults aged {{minimumAge}}" | No age gate (row §1-4). `ACCOUNTS_SETUP.md` says 21+ | **COUNSEL** Q7 + FD-1(c) |
| 21 | Audience | "located in the United States" | Not enforced (§1-6) | **COUNSEL** |
| 22 | Support channel | "Support email is handled by Google (Gmail)" | Production footer has a `mailto:` support link and the 2-business-day promise (01:19Z) | OK |
| 23 | Newsletter | #1077: "no newsletter or mailing list" | `NEXT_PUBLIC_BUTTONDOWN_USERNAME` must be unset (FACT test) | OK while unset |
| 24 | Ask answers can be wrong | #1077 Terms adds a sentence | — | OK |

**Corrections #1077 still needs before export:** rows 2, 4, 5, 7, 11 and 13; the row 15 notice wording; and the row 16 deletion scope. Each is a text change, so each produces a new hash. Do them before counsel review, not after.

## 5. Options for the founder (FD-1, FD-2)

| Option | What happens | Unblocks F-1? |
|---|---|---|
| **A. Publish:** counsel-approved text with real operator data | §2 procedure; one code PR + one Production build | Yes |
| **B. Disable accounts for launch** (matrix §4 L-06) | Remove the two `NEXT_PUBLIC_SUPABASE_*` vars from Vercel Production plus one build. `/account` says "Accounts are not open yet". Existing data stays and obligations continue | It removes the "while accounts are enabled" reason. **It does not remove** Ask→Gemini, analytics, or Google Fonts. Counsel may still want a notice |
| **C. Launch with neither** | Accounts live, no notice | Not recommended by any record; the founder would have to accept it in writing |

## 6. Exact founder questions

1. **FD-1(a):** What is the operator's exact legal entity name?
2. **FD-1(b):** Which US state governs the Terms?
3. **FD-1(c):** Is the minimum age 18 or 21? Should sign-in carry an age attestation (a code change)?
4. **New:** What contact address for legal notices should the documents carry, if counsel requires more than the support link?
5. **New:** Is the audience US-wide, or are any states excluded? Is geo-blocking wanted (none exists)?
6. **FD-1(d):** Who is the reviewer (name, role, firm)? By what date will they return approved hashes? The effective date follows from that.
7. **FD-2:** At launch, are accounts public sign-up, invite-only (as built), or disabled (L-06)?
8. **New:** In the hosted Supabase project:
   - Is "Allow new users to sign up" OFF?
   - Which email sender delivers magic links?
   - Is `BLOB_READ_WRITE_TOKEN` set in Vercel Production?
9. **New:** Is the Gemini API project billing-enabled (paid tier)?
10. **New:** Orphaned slip images (row 15): accept and disclose, or hide the upload control while slip reading is off?
11. **New:** Should Google Fonts be disclosed, or self-hosted? Self-hosting is an engineering change that removes the third-party contact.

---

## 7. Classification of the 24 rows (re-verified Sat 2026-10-17 ~06:30Z)

**Re-verified against:**
- `origin/main` = `2c617c780c`. Production serves the same commit: `/data/build-info.json` read once at 06:26:50Z, `builtAt` 06:07:54Z. `/privacy/` returned 404 at the same time.
- #1077 = `claude/legal-drafts-accounts` `9de2f79bd2` (unchanged since §4).
- `git diff 8433d82bd9 origin/main -- app/src app/api db app/vercel.json app/scripts` is **empty**, so every code fact in §4 still holds. Each row below was also re-read at the file and line cited.

**Basis.** Each row is classified by the state of the **#1077 draft**, because that is the text that would be exported for counsel. `main`'s text is superseded by #1077 on every row. On `main`, rows 1, 2, 3, 8 and 11 are also false or missing until #1077 merges.

**The five categories:**
- **Incorrect factual description:** the draft states something the code does not do.
- **Missing disclosure:** a real flow the draft does not mention.
- **Legal decision required:** the facts are settled; counsel or the founder must judge whether or how to say it.
- **Product functionality requiring clarification:** the right text depends on a product choice that has not been made.
- **Already resolved:** accurate in #1077; no text change needed.

| # | Area | Category | Re-verification (2026-10-17) | Proposed exact wording for #1077 (proposal only; not applied) |
|---|---|---|---|---|
| 1 | Accounts exist | Already resolved | #1077 has "Optional accounts" (Terms) and "If you create an account" (Privacy). `main` still says "operate user accounts" (Terms) and "has no user accounts" (Privacy), which is false | — |
| 2 | Who can have an account | Product functionality requiring clarification | The schema is invite-only: `is_beta_member()` sits in the WITH CHECK of every insert and update policy, and in `slips_write_own` (`db/accounts-schema.sql:184-230, 249`). `sign-in-panel.tsx:22` calls `signInWithOtp` **without** `shouldCreateUser: false`. So whether a stranger can create a Supabase Auth user depends only on the hosted dashboard toggle, which is unverified (package 2, B8). See §9 for the three modes | Depends on FD-2. **Invite-only:** "Accounts are currently available by invitation only. If you have been invited, you sign in with a one-time link sent to your email address." **Public:** the current #1077 sentence is accurate |
| 3 | What an account stores | Missing disclosure | `bet_slips` also stores `placed_at`, `settled_at`, `returned`, `official_card_id`, `source` and `confirmed_at`. `profiles` holds `max_stake_per_slip`, `daily_loss_limit` and `monthly_loss_limit` (`my-bets-record.tsx:41`) and `risk`, `bankroll` and `unit_pct` (`style-sync-panel.tsx:50`) | Replace "the sportsbook, stake, price, legs, and status" with "the sportsbook, stake, price, legs, when you placed it, its status and result, and the amount returned" |
| 4 | Feedback form | Missing disclosure | `beta-feedback-form.tsx:45` inserts into `beta_feedback`: page, type, severity, optional sport and product, the free-text "What happened" and "What you expected", and the tester's user id. The form's own notice (line 60) already lists these | Add to "If you create an account": "If you send feedback through the feedback form, we store the page, the choices you made on the form, what you wrote, the time and your account, and only the GameTime Picks team can read it." |
| 5 | Invite allowlist | Missing disclosure | `beta_access` holds the email, tester code, `invited_at` and `revoked_at` (`accounts-schema.sql:87-92`). There is **no foreign key to `auth.users`**, so deleting the user does not remove it (`SUPABASE_BETA_SETUP.md` §"Inviting" step 3 omits it) | Add: "While accounts are by invitation, we also keep a list of invited email addresses, used only to decide who can save to an account. Deleting your account removes your address from that list." The second sentence is true only once the deletion procedure removes the `beta_access` row (row 16) |
| 6 | `user_preferences` table | Already resolved | Still no writer: the only `.from("…")` writers in `app/src` are `profiles`, `bet_slips`, `user_follows`, `saved_items`, `beta_feedback` and the `slips` bucket. It becomes a Missing disclosure the day something writes it | — |
| 7 | Sign-in records held by Supabase; magic-link sender | Missing disclosure | Supabase Auth keeps its own sign-in records (sessions and an audit log). Which mailer sends the link (Supabase's own or custom SMTP) is not visible in the repository | Add after the Supabase sentence: "Supabase also keeps records of sign-ins, such as when they happened and the device's IP address, to secure your account. The sign-in email is sent by `[FOUNDER: Supabase's email service, or the named SMTP provider]`." Confirm the IP claim against the project's settings before export |
| 8 | Browser storage | Already resolved | #1077 names the sign-in session in local storage. The FACT guard in `texts.test.mjs` pins the storage-using files | — |
| 9 | Cookies | Already resolved | Still no `document.cookie=`, `cookies().set` or `Set-Cookie` in `app/src`. The Supabase client uses local storage. Third-party hosts are row 13 | — |
| 10 | Analytics | Legal decision required | Production inlines `NEXT_PUBLIC_ANALYTICS_ENABLED:"1"` (§2, verified 01:19Z), so the `ANALYTICS_LIVE` variant renders. The open item is counsel Q10 (consent basis for cookieless counts). **Also see N-1**, a contradiction inside that variant | See N-1 |
| 11 | Ask GameTime: what is sent | Missing disclosure | `ask-app.tsx:101-106` sends `messages`, `preferences` (risk style and entertainment bankroll), `entities` (canonical ids) and `context` (page type, id, sport). `writer.mjs:137-140` puts the preferences into the model prompt | Replace the first Ask sentence with: "If you use Ask GameTime, your question, the earlier messages in that conversation, the page you asked from, and any risk style or entertainment bankroll you set in Ask are sent to Google's Gemini API to write an answer from the Site's own published data, under Google's terms for that service." |
| 12 | Ask GameTime: storage | Legal decision required | Our side is accurate: `askAuditLine` (`_ask-core.mjs:149`) logs no question or answer text. Google's own retention depends on whether the Gemini project is billing-enabled, which is a founder fact (§6 Q9). Counsel decides whether the notice must say more than "under Google's terms" | — until the founder supplies the tier |
| 13 | Third parties the browser contacts | **Incorrect factual description** | `globals.css:10` still has `@import url("https://fonts.googleapis.com/css2?family=Geist…")`. `app/vercel.json` CSP `connect-src` allows `https://*.supabase.co` and `wss://*.supabase.co`. #1077's "Services your browser contacts" names Vercel, MLB, ESPN, NBA and Gmail only | Add to that section: "Every page loads fonts from Google Fonts (fonts.googleapis.com and fonts.gstatic.com), so your browser sends Google the same standard request information. On the account and feedback pages your browser also connects to Supabase (supabase.co)." Or self-host the fonts (an engineering change) and leave the text as it is |
| 14 | Live scores | Already resolved | The browser calls first-party `/api/live`; ESPN and MLB are called server-side | — |
| 15 | Slip screenshots kept with no bet | Product functionality requiring clarification | `slip-upload.tsx:47` uploads to `slips/<uid>/` **before** calling `/api/slip-read`, which answers 503 in Production. The image stays stored. When the 503 body has no `reason`, the UI says "Nothing was saved" (line 58), which is false (N-2) | Depends on the founder's §6 Q10 answer. **If upload stays:** add "If you upload a screenshot while automatic reading is switched off, the image is still kept in your private storage until you delete your account or ask us to remove it." **If upload is hidden:** no text change |
| 16 | Deletion and retention | Legal decision required | The procedure (`SUPABASE_BETA_SETUP.md` step 3) deletes the storage folder, then the auth user. `beta_feedback`, `profiles`, `bet_slips`, `user_follows` and `saved_items` all `on delete cascade` from `auth.users`, so feedback is covered (this corrects §4 row 16). **`beta_access` is not covered.** Supabase Auth logs, Vercel logs and the Gmail thread are outside it. Open: counsel L-05(d), is a manual, by-request deletion acceptable at launch? | Keep #1077's wording. Add the `beta_access` delete to the runbook so "everything stored with it" stays true |
| 17 | Access and export rights | Already resolved | A promise; fulfilled by hand from the dashboard. An operational duty, not a text issue | — |
| 18 | "No real money" vs entered real bets | Legal decision required | Terms in #1077 still says "No real money is involved" two paragraphs before "Entering a bet records it for your own tracking only" | Candidate for counsel: "The Site's own records are paper records of hypothetical positions; the Site never handles money. Bets you choose to enter in an account are real wagers you placed elsewhere, recorded for your own tracking only." |
| 19 | Sportsbook links | Already resolved | 0 sportsbook hrefs in `app/src` outside tests and fakes | — |
| 20 | Minimum age | Legal decision required | `minimumAge` = "18"; `docs/ACCOUNTS_SETUP.md` says 21+; there is no age gate or attestation in the sign-in flow | — (FD-1c) |
| 21 | Audience and geography | Legal decision required | "the United States"; no geo restriction in `app/src`, `app/api` or `app/vercel.json` | — |
| 22 | Support channel | Already resolved | Production footer link and the 2-business-day promise (verified 10-16 and 10-17) | — |
| 23 | Newsletter | Already resolved | `newsletter.ts:57` reads `NEXT_PUBLIC_BUTTONDOWN_USERNAME`; the FACT test requires it unset | — |
| 24 | Ask answers can be wrong | Already resolved | The #1077 Terms sentence is present | — |

**Counts (24 rows, one category each):**

| Category | Rows | Count |
|---|---|---:|
| Incorrect factual description | 13 | 1 |
| Missing disclosure | 3, 4, 5, 7, 11 | 5 |
| Legal decision required | 10, 12, 16, 18, 20, 21 | 6 |
| Product functionality requiring clarification | 2, 15 | 2 |
| Already resolved | 1, 6, 8, 9, 14, 17, 19, 22, 23, 24 | 10 |

**New findings in this pass** (not in the original 24):

| # | Finding | Category | Evidence | Proposed exact wording |
|---|---|---|---|---|
| N-1 | In #1077's **analytics-on** variant (the one Production would render), "What we collect" says the Site "does not ask for or collect your name, email address, or any other personal information". That contradicts "If you create an account" in the same notice. The analytics-off variant has the same sentence | Incorrect factual description | `texts.mjs` on #1077, lines 109 (on) and 114 (off) vs 126–127 | "Without an account, the Site does not ask for or collect your name, email address, or any other personal information." |
| N-2 | Slip upload error copy says "Nothing was saved" after the image **was** stored | Incorrect factual description (product UI copy, not a legal page) | `slip-upload.tsx:47` (upload) then `:58` (reader refusal) and `:63` (a throw after the upload) | Product copy fix, or hide upload (row 15). Engineering change; not made here |

**Corrections #1077 needs before export (revised):** rows 2 (after FD-2), 3, 4, 5, 7, 11 and 13, N-1, and the row 15 sentence if upload stays. Each changes the hash, so do them all before counsel sees the export.

## 8. Exact information the founder must supply

Every value is a placeholder. None has been chosen, inferred or approved by this session.

| # | Item | Where it goes | Value |
|---|---|---|---|
| 1 | Operator identity: the exact legal name of the person or entity that operates the site | `LEGAL_PARAMETERS.operator.value`, and remove `placeholder` | `[FOUNDER: legal name]` |
| 2 | Contact address for legal notices, if counsel requires more than the support link | New text slot (a text change, so a new hash) | `[FOUNDER: postal address and/or monitored email]` or `[COUNSEL: support link sufficient]` |
| 3 | Governing state | `LEGAL_PARAMETERS.state.value` | `[FOUNDER: US state]` |
| 4 | Minimum age, and whether sign-in needs an attestation | `LEGAL_PARAMETERS.minimumAge.value`; an attestation is a code change | `[FOUNDER: 18 or 21]`; `[COUNSEL: attestation yes/no]` |
| 5 | Legal reviewer: full name, role, firm or admission | Manifest `approval.reviewer`, `approval.role` | `[COUNSEL: name]`, `[COUNSEL: role]` |
| 6 | Approval date | Manifest `approval.approvedOn` | `[COUNSEL: YYYY-MM-DD]` |
| 7 | Packet version reviewed | Manifest `approval.packetVersion` | `[COUNSEL: number]` |
| 8 | Effective date (both the parameter and the manifest field) | `LEGAL_PARAMETERS.effectiveDate.value` and manifest `effectiveDate` | `[FOUNDER/COUNSEL: YYYY-MM-DD]` |
| 9 | Approved text hash, one per section | Manifest `approval.contentHash` for `terms` and `privacy` (and `responsible-use` for the set) | `[sha256 of the exported terms draft counsel approved]`, `[sha256 of the exported privacy draft counsel approved]` |
| 10 | Account mode at launch (§9) | FD-2; decides row 2's sentence | `[FOUNDER: public / invite-only / disabled]` |
| 11 | Magic-link email sender | Row 7 sentence | `[FOUNDER: Supabase mailer or SMTP provider name]` |
| 12 | Gemini project billing tier | Row 12; counsel's input | `[FOUNDER: paid / free]` |
| 13 | Slip upload while reading is off | Row 15 | `[FOUNDER: keep and disclose / hide]` |
| 14 | Google Fonts | Row 13 | `[FOUNDER: disclose / self-host]` |
| 15 | Launch domain | `LEGAL_PARAMETERS.site.value` | `[FOUNDER: confirm gametimepicks.yashwantbalaji.com or name another]` |

Items 1, 3, 4, 5, 6, 8 and 9 are what `legalReadiness()` checks. Items 2 and 10–15 change the text, so they must be settled **before** the export that counsel hashes.

## 9. Account launch strategy: public registration vs invite-only vs temporarily disabled

**How each mode is configured** (verified at `2c617c780c`):

| Mode | Configuration | Code change? |
|---|---|---|
| **Invite-only (current build)** | **Two locks.** (1) Supabase dashboard: "Allow new users to sign up" OFF, so only users the founder creates can sign in (`SUPABASE_BETA_SETUP.md` step 1). This is **unverified** in the hosted project. (2) `beta_access` allowlist: `is_beta_member()` is in the WITH CHECK of every **insert and update** policy on the 6 user tables and in the storage upload policy. **Select and delete never require it**, by design, so a revoked tester can still read and delete their own data | None |
| **Public registration** | Turn sign-up ON, **and** remove the allowlist from writes: redefine `is_beta_member()` or drop it from 13 policies (a schema migration). Otherwise new users can sign in but every save fails. Copy also assumes testers: "Feedback is for invited testers" (`beta-feedback-form.tsx`), "Testing the beta?" (`account-experience.tsx:126`) | **Yes**: schema migration plus copy changes, then RLS battery re-run |
| **Temporarily disabled** | Remove `NEXT_PUBLIC_SUPABASE_URL` **and** `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Vercel Production, then one Production build (they are inlined at build). Removing only the anon key leaves the nav link (it tests only the URL, `navigation.ts:254`) and shows "Accounts are temporarily unavailable" (MISCONFIGURED) | None; env change and one build |

**What the disabled mode hides and what stays visible** (from code):
- **Hidden:** the "Your bets" link in the rail and footer (`navigation.ts:254-259`, built only when the URL is set). No sign-in form, upload, sync or feedback form renders anywhere.
- **Still reachable:**
  - `/account/` stays a public 200 route (`route-inventory.mjs:94`). It shows "Accounts are not open yet. Everything on this page works without one, and your choices stay in this browser.", then a paragraph describing what accounts will do.
  - `/feedback/` stays a 200 route (noindex) and shows the same notice plus "The feedback form opens with tester accounts."
  - Ask's help source still names `/feedback/` as a route (`ask/help-source.mjs:410`).
- **Unaffected:** follows, saved forecasts and My GameTime stay in browser storage. `/api/slip-read` is already 503.
- **Existing sessions:** a signed-in browser keeps its Supabase session in local storage, but no page builds a client any more, so nothing reads or writes the account.

**Comparison:**

| Dimension | Public registration | Invite-only (current) | Temporarily disabled |
|---|---|---|---|
| **Legal disclosure** | Full Privacy and Terms needed before launch (F-1). Row 2's "If you choose to create one" is accurate. Age attestation (FD-1c) matters most here, because anyone can enter | Full Privacy and Terms needed (F-1): accounts are live, so invited people's data is collected. Row 2 needs "by invitation" wording. Counsel may accept a lighter posture for a closed cohort; that is **counsel's call**, not engineering's | Removes the "while accounts are enabled" reason. Does **not** remove Ask→Gemini, analytics or Google Fonts, so counsel may still want a notice (package 1 §5 B). Obligations to existing account holders continue |
| **Privacy** | Largest data set: any visitor's email, bets, bankroll and limits | Bounded to the cohort (T1–T10 per the setup doc) | No new collection. Existing rows stay in Supabase |
| **User functionality** | Everyone gets cross-device sync, the bet record and feedback | Invited users get everything; others see the sign-in form, and the error Supabase returns when sign-up is off (shown verbatim, `sign-in-panel.tsx:26`) | Everyone gets browser-local features only |
| **Security** | Largest attack surface: anyone can obtain an `authenticated` JWT, and isolation rests entirely on own-row RLS. No CAPTCHA, no per-user upload quota (8 MB per image). Needs F-2 to pass **plus** abuse controls | Same RLS, but a stranger without an invite cannot write even if sign-up was left open (the second lock). F-2 still required | Smallest: no client talks to Supabase. Hosted RLS still matters for data already there, but no new path is exposed |
| **Launch readiness** | **Not ready.** Needs a schema migration, copy changes, the RLS battery, F-1 and F-2. Not achievable safely by Oct 20 | **Ready in code.** Blocked only by F-1 (legal) and F-2 (hosted verification, about 40 min of the founder's time) | **Ready.** One env change and one build (about $0.15–0.28), verified at zero cost by loading `/account/` |
| **Future migration** (what happens to existing invited users' data) | Moving here later: existing rows stay and keep working; the allowlist becomes moot | Baseline. Moving to public later keeps all rows. Moving to disabled keeps all rows, inaccessible from the site | Data stays in Supabase, untouched and not deleted. Re-enabling (restore both vars, one build) restores access; users sign in again with a new link. Deletion and access requests must still be served by hand while disabled |

**Recommendation (technical and compliance readiness only):**
- **Launch with accounts invite-only only if F-1 and F-2 both close by the go/no-go.** It is the only enabled mode that is ready in code. Its second lock contains the damage if the sign-up toggle turns out to be on.
- **If either F-1 or F-2 is still open at Mon 17:00 ET, choose temporarily disabled for launch.** It is ready, reversible with one build, collects nothing new, and keeps existing data intact.
- **Public registration is not ready for Oct 20** under any outcome, because of the schema change, copy and abuse controls.

**Counsel matters, not engineering's to decide:**
- whether an invite-only cohort still needs the full notice;
- what existing account holders must be told if accounts are disabled;
- whether manual deletion is acceptable;
- the age attestation.

**Founder action only:** no availability was changed in this pass.
