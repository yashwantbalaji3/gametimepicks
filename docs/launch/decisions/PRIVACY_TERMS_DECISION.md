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
