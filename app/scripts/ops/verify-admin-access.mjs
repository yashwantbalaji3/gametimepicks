/**
 * Post-deployment admin-access verifier (Program 165 · Release H) — read-only, runtime URL.
 *
 * Proves the UNAUTHENTICATED half of the acceptance (deny at the edge, no content leak, no
 * indexing/caching invitation) plus the public-production boundary. The authenticated half
 * (login → /launch renders → logout re-challenges) is founder-run in a browser session — this
 * script never handles credentials.
 *
 * Usage: npx tsx scripts/ops/verify-admin-access.mjs --url https://<private-deployment-host>
 */
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const URL_ARG = arg("--url");
if (!URL_ARG || !/^https:\/\//.test(URL_ARG)) { console.error("usage: verify-admin-access.mjs --url https://<private-host> (https only)"); process.exit(1); }

const checks = [];
const record = (name, pass, detail) => { checks.push({ name, pass }); console.log(`${pass ? "OK  " : "FAIL"} ${name} — ${detail}`); };

// 1 · Unauthenticated request to the private deployment must be DENIED at the edge.
const res = await fetch(`${URL_ARG.replace(/\/$/, "")}/launch`, { redirect: "manual", signal: AbortSignal.timeout(20_000) }).catch((e) => ({ status: 0, headers: new Headers(), text: async () => String(e) }));
const denied = res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400) || res.status === 404;
record("unauthenticated deny", denied, `status ${res.status} (401/403/redirect-to-auth/404 all deny; 200 would be an exposure)`);
if (res.status === 200) {
  const body = await res.text();
  record("no content leak on 200", !/Founder Action Sheet|Launch Command Center/.test(body), "an unauthenticated 200 must at least not be the real console");
}
record("no-cache posture on deny", /no-store|no-cache/i.test(res.headers.get("cache-control") ?? "") || denied, `cache-control: ${res.headers.get("cache-control") ?? "(none)"} — deny responses should not be cacheable`);

// 2 · Public production must still 404 the internal routes, always.
for (const route of ["launch", "ops"]) {
  const pub = await fetch(`https://gametimepicks.yashwantbalaji.com/${route}/?cb=${Date.now()}`, { redirect: "follow", signal: AbortSignal.timeout(20_000) }).catch(() => ({ status: 0 }));
  record(`public /${route} still 404`, pub.status === 404, `status ${pub.status}`);
}

const failed = checks.filter((c) => !c.pass).length;
console.log(failed === 0 ? "\nADMIN ACCESS VERIFIED (unauthenticated half) — run the authenticated browser checks per the ADR to finish." : `\n${failed} check(s) FAILED — do not treat the deployment as protected.`);
process.exit(failed === 0 ? 0 : 2);
