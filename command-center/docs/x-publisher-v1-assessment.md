# X Publisher V1: fastest safe path (assessment, 2026-10-28)

**Status:** assessment only.
- Nothing was bought, connected or posted, and no X account or developer app was opened.
- The repo has no X handle, credentials or developer app, so there is **no existing X API connection** to reuse.

## 1. What is actually available

| Option | Can it post with an image? | Cost | Allowed? | Verdict |
|---|---|---|---|---|
| **Official X API, pay-per-use** (OAuth 2.0 user context) | Yes: media upload, then create post | About $0.010–0.015 per post. Our pricing check on 10-27 read $0.015 on docs.x.com; third-party reports since Feb 2026 say $0.010. Media-upload price is not listed. Prepaid credits, with a spend cap in the Developer Console. No free tier for new apps | Yes. Posts carry the "Automated" label if you enable it | **Recommended.** About $1–2/month at 3–4 posts a day |
| Grok / Grok Bot X connector | **No.** Read-only (search, timelines, mentions) | — | — | Not usable for posting |
| Grok "computer use" / browser driving x.com | Technically | — | **No.** X prohibits non-API automation; risk of an account lock | Never |
| Third-party scheduler (Blotato, Postiz, Buffer, OpenTweet…) | Yes | About $15–30/month, or your own X API app anyway | Yes, but a vendor holds write tokens | Slower to set up, costs more, adds a party |
| Manual hand-off (today) | You post | $0 | Yes | About 30 s per post; what we use until you approve the API |

**Scheduling:** the X API has no native scheduled posts. Our scheduler sends each approved post at its time, after the pre-publish checks.

## 2. The target pipeline, and what already exists

Verified prediction → graphic → checked caption → founder approval → scheduled/published → recorded URL → performance.

| Step | State |
|---|---|
| Verified prediction, graphic, caption checks | Done: the freeze-time verifier, renderer and `checkCaption` |
| Founder approval bound to the exact caption + image + evidence | Done: the publish-bundle digest |
| **Send boundary**: pause → approval digest → budget → once-only claim | Done in `publishers/publisher.mjs` (mock provider only) |
| Freshness re-check at publish (latest version, before start) | Done at approval and on "Check before posting". **To add:** run it again inside the send boundary |
| Scheduler, X adapter, OAuth, URL capture, metrics | **To build** (below) |

## 3. Plan: build at $0, go live only on your approval

**Step 1: dry-run X adapter ($0, no account needed).** Build `publishers/x-api.mjs` behind the existing send boundary:
- exact v2 requests: the media upload for the 1080×1350 PNG (about 1.1 MB, under the 5 MB limit), then create post with `media.media_ids` and alt text;
- dry-run mode writes the full request to the ledger and returns `state: DRY_RUN` with no network;
- a scheduler with these checks: pause, approval digest, start-time guard, freshness re-check, once-only claim;
- retries that reconcile before retrying, so an unknown result is never re-sent blind;
- receipts with the X URL; a metrics poll is off by default because reads cost money.

**Step 2: your one-time setup (you, about 20 minutes).**
1. Confirm the handle (@GameTimePicksHQ) and turn on the "Automated" account label.
2. Create the X developer app on that account.
3. Set a spend cap (I suggest $5), then buy the minimum credits. **That purchase is yours to approve.**
4. Run the OAuth sign-in in your own browser. The token goes into the macOS Keychain, never into the repo or chat. Scopes: `tweet.write`, `tweet.read`, `users.read`, `media.write`, `offline.access`.

**Step 3: first live post.** One approved post that you trigger, then a check that its receipt URL resolves. Unattended scheduling comes after that, with a daily cap.

**Security note:** on this Mac, local agents run with your GitHub token, and a console click is not strong proof that you approved. A live send should therefore require you to be present: a passkey or TOTP step-up for each approval batch. This is already the design for the hosted console (CP-H1).

## 4. What I need from you

- A go-ahead to build Step 1 (dry run, $0).
- When you're ready: do the Step 2 setup and approve the credit purchase.

Sources:
[docs.x.com pricing](https://docs.x.com/x-api/getting-started/pricing) (checked 10-27) ·
[Open Terms Archive memo](https://opentermsarchive.org/en/memos/x-replaces-its-dollar200-entry-level-api-plan-with-a-pay-per-use-model/) ·
[postproxy X API pricing 2026](https://www.postproxy.dev/blog/x-api-pricing-2026/) ·
[Blotato on the Grok Bot X connector](https://www.blotato.com/blog/grok-bot-x-connector) ·
[OpenTweet: can Grok post to X](https://opentweet.io/answers/can-grok-post-to-x)
