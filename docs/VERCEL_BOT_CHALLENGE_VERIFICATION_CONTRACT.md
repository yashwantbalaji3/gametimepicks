# Vercel Bot-Challenge Verification Contract (Program 108-111 Lane F — SHIPPED)

On 2026-08-03 this session's own repeated `curl` probes tripped Vercel bot mitigation: HTTP 403
with `x-vercel-mitigated: challenge` and an `x-vercel-challenge-token`. The site was completely
healthy for real users (browser-verified). A checker that calls that an outage pages falsely —
and false pages are how real incidents get ignored.

**Nothing bypasses, disables, or spoofs around the challenge.** A challenge is simply not
evidence about site health, so it must not be reported as such.

## Classification (`app/src/lib/deployment-verification.mjs`)

| State | Meaning | Healthy? |
|---|---|---|
| `PRODUCTION_VERIFIED_METADATA` | trusted deployment metadata / build-info fingerprint matches the expected SHA | ✅ |
| `PRODUCTION_VERIFIED_BROWSER` | confirmed in a real browser when automated HTTP is challenged | ✅ |
| `VERCEL_BOT_CHALLENGE` | probe met mitigation — **absence of evidence, not evidence of failure** | ✅ (not an outage) |
| `DEPLOYMENT_UNVERIFIED` | no usable signal | ❌ (unknown) |
| `REAL_HTTP_FAILURE` | non-2xx/3xx **without** a mitigation signature | ❌ |
| `STALE_PRODUCTION` | a signal resolved, but to the wrong SHA | ❌ |

**Trust order (§10.2):** deployment metadata → public build-info fingerprint → real browser →
raw curl. Metadata outranks a challenged probe outright, because metadata is not subject to bot
mitigation at all.

## The property that matters most

A challenge must never *mask* staleness. `classifyDeployment` evaluates SHA agreement **before**
the challenge can excuse anything: an old SHA plus a challenge is `STALE_PRODUCTION`, not
"healthy — probably just the bot check." That is the dangerous failure this design is built to
refuse, and it is mutation-tested.

## Proofs (`deployment-verification.test.mjs`, 9 green)

Real observed challenge headers recognized (case-insensitive) · 403 **with** mitigation →
CHALLENGE/healthy · **MUTATION**: 403 **without** mitigation stays `REAL_HTTP_FAILURE` (the fix
cannot swallow genuine 403s) · metadata outranks a challenged probe · **MUTATION**: old SHA +
challenge → `STALE_PRODUCTION`, never falsely healthy · browser verification counts · stale
build-info on a 200 is still STALE · no signal → UNVERIFIED/not-healthy · 5xx → failure.

## Observer wiring

`public-beta-observe.mjs` detects the mitigation signature and reports **`BOT_CHALLENGE`** with
an explicit "says nothing about site health" reason, instead of the previous `unreachable`.
Existing stale-board and stale-deployment SLOs are untouched — a challenge changes only how an
*unreadable probe* is described, never whether staleness escalates.

**Operational note:** reduce automated polling frequency against the production domain. The
mitigation was triggered by this automation's own request rate, and metadata-based verification
is both cheaper and more trustworthy.
