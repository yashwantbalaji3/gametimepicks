/**
 * Deployment verification classification (Program 108-111 Lane F).
 *
 * On 2026-08-03 repeated scripted `curl` checks against the production domain began returning
 * HTTP 403 with `x-vercel-mitigated: challenge` — Vercel's bot mitigation, triggered by the
 * automation's own polling. The site was completely healthy for real users (verified in a
 * browser). A naive checker calls that an outage and pages; that is a false incident, and false
 * pages are how real ones get ignored.
 *
 * This classifies verification signals instead of collapsing them to up/down. It never attempts
 * to bypass, disable, or spoof around the challenge — a challenge simply is not evidence about
 * the site's health, so it must not be reported as such.
 */

export const VERIFY_STATES = Object.freeze({
  METADATA: "PRODUCTION_VERIFIED_METADATA",
  BROWSER: "PRODUCTION_VERIFIED_BROWSER",
  CHALLENGE: "VERCEL_BOT_CHALLENGE",
  UNVERIFIED: "DEPLOYMENT_UNVERIFIED",
  HTTP_FAILURE: "REAL_HTTP_FAILURE",
  STALE: "STALE_PRODUCTION",
});

/** True when a response carries Vercel's bot-mitigation signature. */
export function isBotChallenge({ status, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), String(v)]));
  if (h["x-vercel-mitigated"] === "challenge") return true;
  // Belt-and-braces: the challenge page is served as 403 with a challenge token header.
  return status === 403 && typeof h["x-vercel-challenge-token"] === "string" && h["x-vercel-challenge-token"].length > 0;
}

/**
 * Classify production verification from the signals actually available.
 *
 * Trust order (§10.2): deployment metadata > public build-info fingerprint > browser > raw curl.
 *
 * @param {object} o
 * @param {string|null} o.expectedSha        the app/data SHA that SHOULD be live
 * @param {string|null} o.metadataSha        SHA from trusted deployment metadata (GitHub/Vercel)
 * @param {string|null} o.buildInfoSha       SHA from a readable public build-info fingerprint
 * @param {object|null} o.httpProbe          {status, headers} from an automated request
 * @param {string|null} o.browserSha         SHA confirmed via real-browser verification
 * @returns {{state:string, healthy:boolean, detail:string}}
 */
export function classifyDeployment({ expectedSha = null, metadataSha = null, buildInfoSha = null, httpProbe = null, browserSha = null } = {}) {
  const short = (s) => (typeof s === "string" ? s.slice(0, 8) : s);
  const matches = (a) => a && expectedSha && short(a) === short(expectedSha);

  // 1. Trusted metadata wins outright — it is not subject to bot mitigation at all.
  if (metadataSha) {
    if (!expectedSha) return { state: VERIFY_STATES.METADATA, healthy: true, detail: `deployment metadata reports ${short(metadataSha)}` };
    if (matches(metadataSha)) return { state: VERIFY_STATES.METADATA, healthy: true, detail: `deployment metadata confirms ${short(expectedSha)}` };
    return { state: VERIFY_STATES.STALE, healthy: false, detail: `deployment metadata reports ${short(metadataSha)}, expected ${short(expectedSha)}` };
  }

  // 2. A readable public fingerprint.
  if (buildInfoSha) {
    if (!expectedSha || matches(buildInfoSha)) return { state: VERIFY_STATES.METADATA, healthy: true, detail: `build-info fingerprint ${short(buildInfoSha)}` };
    return { state: VERIFY_STATES.STALE, healthy: false, detail: `build-info reports ${short(buildInfoSha)}, expected ${short(expectedSha)}` };
  }

  // 3. Real-browser verification (what a user actually experiences).
  if (browserSha) {
    if (!expectedSha || matches(browserSha)) return { state: VERIFY_STATES.BROWSER, healthy: true, detail: `browser-verified ${short(browserSha)}` };
    return { state: VERIFY_STATES.STALE, healthy: false, detail: `browser shows ${short(browserSha)}, expected ${short(expectedSha)}` };
  }

  // 4. Only now does the raw HTTP probe get a say — and a challenge is NOT evidence of an outage.
  if (httpProbe) {
    if (isBotChallenge(httpProbe)) {
      return {
        state: VERIFY_STATES.CHALLENGE,
        healthy: true, // not an outage: absence of evidence, not evidence of failure
        detail:
          "automated request met Vercel bot mitigation (x-vercel-mitigated: challenge) — this says nothing about site health; " +
          "verify via deployment metadata or a real browser, and reduce polling frequency",
      };
    }
    const s = Number(httpProbe.status);
    if (s >= 200 && s < 400) return { state: VERIFY_STATES.UNVERIFIED, healthy: true, detail: `HTTP ${s} but no SHA signal to compare` };
    return { state: VERIFY_STATES.HTTP_FAILURE, healthy: false, detail: `HTTP ${s} with no mitigation signature — a real failure candidate` };
  }

  return { state: VERIFY_STATES.UNVERIFIED, healthy: false, detail: "no verification signal available" };
}
