# Approval security

## The finding (verified 2026-10-27)

On the founder's Mac, `gh auth status` reports the founder's own GitHub account with `repo` and `workflow` scopes,
and local Claude Code sessions use that token. As a result:

- Any local agent session can dispatch a GitHub workflow **as the founder**.
- A workflow that checks `github.actor == founder` therefore **does not prove a human approved**.

## What each channel proves

| Channel | Can a local agent forge it? | Use |
|---|---|---|
| Local console button (Phase 1) | **Yes.** Anything on this machine can POST to 127.0.0.1 | Demo only. It can reach only the mock publisher |
| GitHub `workflow_dispatch` (actor check) | **Yes** (the founder's token) | Never sufficient on its own |
| GitHub Environment required reviewers | Likely yes (the review API accepts the same token); private-repo environments may also need a paid plan | Not relied on |
| **TOTP code + exact draft digest**, verified in the private ops repo against a seed held only in Actions secrets; used codes are recorded to stop replay | **No.** Agents can read neither Actions secrets nor the founder's authenticator | Recommended for Phase 2 |
| **Discord button** (the interaction is Ed25519-signed by Discord and carries the clicking user's ID) | **No.** A bot token cannot fabricate a user's interaction | Phase 2, once a public HTTPS endpoint exists |

## Rules the code already enforces

1. An approval binds `approvedExactDigest`, the sha256 of the canonical publish bundle. A stale page or a swapped
   caption fails with `APPROVAL_DIGEST_MISMATCH`.
2. Founder-only actions (approve, reject, pause, resume, change seat) are checked against the authenticated
   identity of the surface, never against message text. An agent identity gets `NOT_FOUNDER`.
3. The send boundary re-checks pause, approval, digest and budget immediately before the provider is called. Pause
   blocks even an already-approved draft.
4. Idempotency: the claim key is (platform, account, event, content kind, snapshot). A second approval, retry or
   concurrent worker returns the first receipt and never posts twice. The test runs 12 racing processes and
   expects exactly one winner.

## Optional hardening for the founder

Give Claude Code sessions a fine-grained GitHub token that excludes the private ops repo. Agents then cannot even
dispatch its workflows.
