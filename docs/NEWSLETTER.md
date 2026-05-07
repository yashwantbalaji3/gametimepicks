# Newsletter — provider integration guide

The newsletter signup component (`app/src/components/newsletter-signup.tsx`) is **provider-agnostic** and works with **static export** (no API routes, no secrets in the bundle).

How it works:
- The form lives entirely in the client.
- A single config constant (`NEWSLETTER_CONFIG` in `app/src/lib/newsletter.ts`) decides what happens when the user submits.
- By default the constant is `{ provider: "none", endpoint: null }` — the form shows a graceful "daily slate alerts aren't live yet" state. **No email is captured. We don't pretend to subscribe the user.**

To enable real signups, edit one constant. No build flags. No env vars. No secrets.

## Decision tree — which provider should you use?

This site is exported as static HTML (`output: "export"` in `next.config.mjs`). That means **no Next.js API routes** — only providers with a CORS-friendly public form endpoint work without adding a separate server.

| Provider | Static-export friendly? | Free tier | Notes |
|---|---|---|---|
| **Buttondown** | ✅ Yes (CORS POST) | 100 subscribers free | **Recommended for portfolio scale.** Simple, indie, transparent. |
| **Mailchimp (classic form)** | ✅ Yes (no-cors POST) | 500 subs free | Heavier UI, more setup. Works but overkill. |
| Beehiiv | ❌ Requires server | Free tier | Needs a serverless function (out of Phase 13 scope) |
| Loops | ❌ Requires server | Free tier | API key required server-side |
| Resend | ❌ Email-sending only | — | Not a list provider; you'd still need a list manager |
| ConvertKit | Partial | Free up to 1k | Form embed works but renders their HTML, breaks our design |

**Recommendation: use Buttondown.** It's the simplest path that respects the static-export constraint, has clean transactional emails, and doesn't lock you into a complicated tier system. You can switch later — the adapter accepts a different provider with a one-line change.

---

## How to enable Buttondown (recommended)

1. Sign up at [buttondown.email](https://buttondown.email/) and create your newsletter. Pick your username (e.g. `gametimepicks`).

2. Open `app/src/lib/newsletter.ts` and edit the `NEWSLETTER_CONFIG` constant:

   ```ts
   export const NEWSLETTER_CONFIG: NewsletterConfig = {
     provider: "buttondown",
     endpoint: "https://buttondown.email/api/emails/embed-subscribe/<your-username>",
   };
   ```

   Replace `<your-username>` with whatever you registered. **No API key is needed for this endpoint** — it's the public embed endpoint, designed for client-side forms.

3. Commit the change and push.

4. After Vercel redeploys, the form is live. Submissions are sent directly from the user's browser to Buttondown. Buttondown sends a confirmation email (double opt-in is on by default).

5. Configure your "from" address and welcome email inside Buttondown's dashboard. **Set the welcome email to clearly identify itself as GametimePicks** and remind subscribers it's educational analytics, not betting advice.

### Daily slate alerts — sending the actual emails

The signup form just collects emails. The daily email itself is a separate step. Three options:

**Option A — Buttondown's native scheduler (simplest).** Manually paste the daily slate into a Buttondown draft and schedule it. Good for the first 1–2 weeks while you confirm the model is producing reasonable boards.

**Option B — GitHub Actions cron + Buttondown API (recommended once stable).** Add a step to `daily-refresh.yml` that, after the board export succeeds, generates an email body from the new board JSON and POSTs it to Buttondown's `/api/emails` endpoint with your API key (this part is server-side, runs in CI, never touches the client). This is the path I'd take in Phase 14 once the model has settled data.

**Option C — Vercel Cron** would also work but you'd need a non-static-export deployment for that.

---

## How to enable Mailchimp (classic form)

If you already have a Mailchimp account or want their analytics:

1. In Mailchimp, go to **Audience → Signup forms → Embedded forms**.

2. Copy the form's `action` URL. It looks like `https://yashwantbalaji.us21.list-manage.com/subscribe/post?u=<id>&id=<list_id>`.

3. Edit `NEWSLETTER_CONFIG`:

   ```ts
   export const NEWSLETTER_CONFIG: NewsletterConfig = {
     provider: "mailchimp_form",
     endpoint: "https://yashwantbalaji.us21.list-manage.com/subscribe/post?u=<id>&id=<list_id>",
   };
   ```

4. Mailchimp's classic form endpoint accepts `no-cors` form-encoded POSTs from the browser. The response is opaque (we can't read it) but the absence of a network error means the email was accepted.

5. Mailchimp will send a confirmation email (double opt-in).

**Important caveat**: because the Mailchimp response is opaque, the form will say "subscribed" even if Mailchimp later silently rejects the email (e.g., already subscribed, blocked domain). This is a fundamental limitation of static-export forms with CORS-strict providers. Buttondown's CORS support is more permissive and avoids this caveat.

---

## How to test locally

Default (no provider) state:

```bash
cd app
npm run dev
# Visit http://localhost:3000
# Type any email; click subscribe.
# Expected: "Daily slate alerts aren't live yet — we'll announce when they are."
```

With a provider configured, edit `NEWSLETTER_CONFIG` to point to your real endpoint, then:

```bash
cd app
npm run dev
# Submit a real email you control
# Expected: "Subscribed. Check your email for a confirmation link from <provider>."
```

The Playwright e2e tests (`app/e2e/newsletter.spec.ts`) cover the default no-provider state. Once you wire a real provider, run the tests against a staging build to confirm the success path is unchanged. Or wire `NEWSLETTER_CONFIG` to a fake test endpoint that 200s without storing.

---

## Privacy + unsubscribe

- **No localStorage, no cookies, no tracking.** The form fires a single fetch to your provider on submit and forgets the email.
- **Double opt-in is on by default** for both Buttondown and Mailchimp — the user must click a confirmation link before they're added to your list.
- **Unsubscribe links** are generated automatically by the provider and included in every email they send. This is required by US CAN-SPAM and EU GDPR, and both providers handle it without configuration.
- **No third-party scripts loaded.** The form is a 50-line React component, not an embedded widget.

If a user emails you asking to unsubscribe, the provider's dashboard has a one-click suppress action. Keep that audit trail clean.

---

## What this docs DOESN'T cover

- **A/B testing different newsletter copy** — defer until you have 100+ subs.
- **Segmenting subscribers by sport / market preference** — defer until multi-sport.
- **Custom email design** — both providers ship reasonable defaults.
- **Email deliverability tuning (SPF, DKIM, DMARC)** — both providers handle this when you authenticate your sending domain. Follow their setup docs.

---

## Why no API route?

`next.config.mjs` has `output: "export"`, which produces a fully-static site (no Node runtime in production). API routes require a server runtime. We could remove `output: "export"` and switch to a Vercel-only deployment, but that would lock us out of Cloudflare Pages, S3, Netlify, and other static hosts. The form-endpoint pattern is provider-friendly without that tradeoff.

If a future provider doesn't support CORS POSTs (Beehiiv, Loops), the cleanest path is a small Cloudflare Worker or Vercel Function as a CORS proxy. Out of Phase 13 scope.
