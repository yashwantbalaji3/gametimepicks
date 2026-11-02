# Action confirmation contract

Hold release and replace-held need founder confirmation on every surface. Both surfaces use one interface,
`createActionConfirmer` in `auth/action-confirmation.mjs`. There is no opt-out.

## Interface

`confirm(action, post)` returns `{ ok: true }` or `{ ok: false, code: "NOT_CONFIRMED", detail }`.
The request carries `action`, `decisionId` and `contentSha`. A missing confirmer, unknown action, missing identity
or thrown error is a refusal.

## Local (built)

A native macOS dialog through `confirmOnMac`. Anything but the action button is a no, including the 120-second timeout.
The dialog names the post and the version.

## Hosted (built on the branch, not deployed)

Hosted hold and replace-held are in `hosted/app.mjs`. Hosted replace refuses when the Launch Readiness file is absent. They meet these:

1. A passkey (WebAuthn) step-up for this one action, with user verification required.
2. The server issues the challenge. It binds `action`, `decisionId`, `contentSha`, the signed-in founder and the session.
3. Single use: the challenge is consumed atomically in the database before the action runs.
4. Short-lived: it expires within 2 minutes.
5. Before acting, the server re-reads the post. A different `contentSha` refuses the action.
6. The assertion is verified on the server. A session cookie alone never authorizes the action.
7. Each attempt, allowed or refused, is written to the append-only ledger, with no secret material.
8. Only the founder role can complete it. The publisher role and the system actor cannot.

Pending tests are listed in `tests/action-confirmation.test.mjs`.
