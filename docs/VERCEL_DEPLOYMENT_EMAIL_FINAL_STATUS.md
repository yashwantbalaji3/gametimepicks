# Vercel Deployment Email — Final Status (Program 092-095 Lane F)

**State: ENGINEERING-COMPLETE · BLOCKED_BY_ONE_FOUNDER_CLICK.** No authenticated Vercel access
exists in this environment (no CLI, no token; credentials were not requested per boundary), so
account-side toggles cannot be flipped from here. Everything else is done.

- **Root cause of "emails stopped"** (evidence-ranked) and the full native-event matrix:
  `VERCEL_DEPLOYMENT_EMAIL_NOTIFICATIONS_PROOF.md` — Vercel emails deployment **failures** and
  **promotions** (+ domain + usage events) only; there is no per-deploy success email in the
  product. Failure emails dried up because failures did (a healthy sign misread as breakage).
- **The founder click (~3 min):** team scope → Settings → My Notifications → verify Deployment
  Failures Email ON, enable Deployment Promotions Email, Domain group ON, Usage ON with
  75%/100% thresholds; confirm account email verified.
- **Delivery proof plan:** the next scheduled data deployment after the toggle is the natural
  success/promotion test (no forced failures; failure-class delivery is already historically
  proven by the June rate-limit emails). Receipt gets appended to the proof doc with the
  deployment fingerprint (`buildEtDate` + `builtAt`), no email headers.
- **No duplicate emails are possible from the dormant project**: `gametimepicks` is
  Git-disconnected and slug-skip-guarded — it cannot deploy, so it cannot email.
- Discord ops webhook remains the workflow-failure channel (5 workflows + WARNING kind for
  credit-budget/watchdog events); severity routing table lives in
  `PROGRAM_088_091_EXECUTION_LOG.md` and is unchanged by this lane.
