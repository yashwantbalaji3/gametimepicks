# X Publisher V1: your one-time setup

**Status:** written 2026-10-28.
- Nothing here is done for you, and nothing here costs money until step 5.
- Secrets never pass through chat, files, the repository or logs. You type them into hidden prompts or into the hosting providers' secret settings.

## 1. X Developer Console: app settings

Go to developer.x.com → your Project → your App → **User authentication settings → Set up / Edit**.

| Setting | Value |
|---|---|
| App permissions | **Read and write**. Media upload and posting need write. "Read and write and Direct message" is not needed |
| Type of App | **Native App** (public client, PKCE, no client secret). Recommended: there is no secret to store. A "Web App, Automated App or Bot" also works; then step 2 asks for its secret |
| Callback URI / Redirect URL | Add **both**, exactly as written (X requires an exact match, trailing slash included). See below |
| Website URL | the public GameTimePicks website's address (X shows it on the authorization screen) |

Callback URLs, each verified against the code that serves it:
1. `http://127.0.0.1:4190/oauth/x/callback`
   - The local Command Center.
   - Served by `surfaces/console/server.mjs`; checked live on 2026-10-28 (it rejects a bad state with 400).
   - X's docs ask for the loopback IP, **not** `localhost`.
2. `https://team.gametimepicks.yashwantbalaji.com/oauth/x/callback`
   - The hosted Command Center.
   - Served by `hosted/app.mjs`; tested in `tests/hosted-accounts.test.mjs`.
   - Works once the hosted app is deployed (section 6).

Scopes the Command Center asks for:
- `tweet.read`
- `tweet.write`
- `users.read`
- `media.write`
- `offline.access` (gives a refresh token, so you don't reconnect every two hours)

## 2. Save the app's Client ID (and secret, if any) on your Mac

Run this in your own Terminal:

```bash
node command-center/scripts/x-setup.mjs
```

1. Paste the **OAuth 2.0 Client ID** (Keys and tokens → OAuth 2.0 Client ID and Client Secret). Typing is hidden.
2. Paste the **Client Secret** only if the app type is Web App / Bot; press Enter for a Native App.
3. Both go to the macOS Keychain (service `gtp-command-center`).
4. Check what is saved with `--status` (shows no values); remove everything with `--forget`.

Do **not** paste any key, secret or token into chat.

## 3. Connect the GameTimePicks X account

1. Restart the Command Center so it reads the Keychain.
2. Open it, then **Queue → Connect X account**.
3. X asks you to sign in **as the GameTimePicks account** (check the handle) and to authorize the app.
4. You come back to `http://127.0.0.1:4190/oauth/x/callback`, which shows "X account connected" and the granted permissions.
5. The tokens are stored in the Keychain only.
6. To undo it: **Disconnect X** (revokes the token), or revoke at x.com/settings/connected_apps.

Account hygiene on X:
- In the GameTimePicks account's settings, label it as automated (**Settings → Your account → Account information → Automation**, managing account = your personal account).
- Keep posts to approved content only. X's automation rules prohibit non-API automation, which this does not use.

## 4. Test in dry run ($0)

Dry run is the default. In the Queue, on an **approved** NBA game post:
- **Dry run now** runs the full gate: approval, fingerprint, both images, tip-off window, fresh data, and the re-check of winner, stat lines, featured players and tip time.
- It shows exactly what would be sent. Nothing is sent and nothing is spent.
- **Schedule for … (45 min before tip)** makes the scheduler run it at that time, still as a dry run.

## 5. Credits and the first live post (your approval)

1. **In the X Developer Console: buy credits and set a spending cap.**
   - Pay-per-use: about $0.010–0.015 per post. The media-upload price isn't listed, so the Command Center assumes $0.015 per image.
   - That makes one NBA game post (2 images) $0.045 at most.
   - **This purchase is yours to approve and make.**
2. **In the Command Center: Authorize scheduled live publishing…**
   - Choose a monthly cap ($1–25).
   - Type the exact sentence it shows ("I authorize live X publishing up to $N per month").
   - Click **Publish live** in the macOS dialog.
   - Until then, every scheduled job stays a dry run.
3. **First post: Live test post… on one approved game post.**
   - Confirm in the browser, then confirm again in the macOS dialog.
   - The receipt records the X post ID and link, and the post shows as **Published**.
4. **Turning it off: Switch scheduled publishing to dry run** always works with no confirmation, and so does **Pause publishing**.

## 6. Hosted (later, with your approval)

The same steps on `https://team.gametimepicks.yashwantbalaji.com`, with these differences:
- The Client ID is a Vercel/GitHub *variable* (not secret).
- A confidential app's secret and the tokens are stored encrypted in the database (AES-256-GCM, key `GTP_CC_SECRET_KEY` held only in Vercel/GitHub secret settings).
- Connecting X, authorizing live publishing and live tests each need Face ID / Touch ID.

See `docs/p0-p1-hosted-and-publisher.md`.
