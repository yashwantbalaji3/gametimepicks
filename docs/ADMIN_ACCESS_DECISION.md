# Admin Access — Architecture Decision Record (Program 164 · Release 7)

Problem: the founder has no safe way to read /launch without a local checkout. The public export
prunes it (proven every gate; production 404s), and that boundary never moves. What is missing is
a PRIVATE, authenticated destination — and casually exposing the internal build is the failure
mode this record exists to prevent.

## Why URL-hiding and client-side prompts are insufficient

An unlisted URL is discoverable (logs, referrers, history sync, crawlers); a client-side password
ships the page content to every browser that asks and merely hides it; "encrypted in the bundle"
still delivers the ciphertext and the decryption code together. The bar is **server-side denial**:
unauthenticated requests never receive the content at all.

## Options

| Option | How | Security properties | Cost/complexity | Verdict |
|---|---|---|---|---|
| **1 · Host-level protection on a separate internal deployment (RECOMMENDED)** | a second project deploying the internal build (`NEXT_PUBLIC_INTERNAL_ROUTES=1`), with the host's built-in deployment protection (password or SSO) in front — requests are denied at the edge before any content is served | server-side deny; no public DNS needed (host-issued URL); sessions managed by the host; zero custom auth code to get wrong | minutes to set up; typically a paid-tier feature — confirm plan | **Recommended** — smallest correct thing |
| 2 · Zero-trust proxy (e.g. an access product) in front of a private deployment | same internal deployment; a zero-trust layer enforces identity with per-email policies | strong (SSO, device rules, audit logs) | account + DNS + policy setup; more moving parts | good later, more than needed now |
| 3 · Status quo (local checkout only) | founder runs the internal build locally | perfectly private | requires a dev environment | the honest fallback; costs founder time |

Rejected outright: public route + client-side gate (see above); committing any credential to git;
basic-auth secrets pasted into chat.

## Founder action (non-secret fields only)

1. Choose option 1, 2, or 3.
2. For option 1: confirm the hosting plan supports deployment protection; create the second
   project pointing at the same repository with the internal-build env flag; enable protection;
   set the password/SSO **in the host's dashboard only** (never chat, never git); record the
   recovery owner.
3. Reply with: the option chosen + the host-issued private URL's existence (not the URL itself in
   any public artifact).

## Acceptance (binary, run after setup)

Unauthenticated request → denied at the edge (no content bytes) → authenticated → /launch
renders → logout/expiry re-challenges → wrong user denied → response carries
noindex/no-store (see `ADMIN_RESPONSE_HEADERS` in `src/lib/admin/access-contract.mjs`) → public
production /launch and /ops still 404 → rollback = disable the private deployment; the public
site never carried it.
