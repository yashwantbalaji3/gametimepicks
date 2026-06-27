/**
 * PRODUCTION SMOKE TEST — post-deploy verification for the autonomous lifecycle.
 *
 * After a deploy, confirms the LIVE site is actually serving the five canonical pages AND that the money
 * it displays matches the canonical portfolio.json that was deployed (i.e. NO reconciliation drift between
 * the committed data and what production renders). Deployment is only considered successful if this passes.
 *
 *   node app/scripts/smoke-test-production.mjs [--base-url https://gametime-picks.vercel.app]
 *
 * Creditless (plain HTTPS GETs). Expected values are DERIVED from the local canonical portfolio.json —
 * never hardcoded — so the drift check stays honest as the bankroll grows. Exit non-zero on any failure.
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const BASE = (arg("--base-url", process.env.SMOKE_BASE_URL || "https://gametime-picks.vercel.app")).replace(/\/$/, "");

const fail = [];
const pass = [];
const usdVariants = (n) => {
  // prod HTML may render with or without the cents / thousands separators depending on the formatter.
  const v = Number(n);
  return [
    v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), // with cents + separators
    v.toLocaleString("en-US", { maximumFractionDigits: 0 }),                            // rounded, separators only
  ];
};

async function get(url) {
  // Follow redirects (prod 308s the no-trailing-slash form). Node fetch follows by default.
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "gtp-smoke/1.0" } });
  const body = await res.text();
  return { status: res.status, body };
}

async function main() {
  // Expected money — the canonical source that was deployed (NO hardcoding).
  let portfolio;
  try { portfolio = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "mr-dub", "portfolio.json"), "utf8")); }
  catch { console.error("✗ cannot read local canonical portfolio.json — run from app/"); process.exit(1); }
  const bankrollOK = usdVariants(portfolio.currentBankroll);
  const crownOK = usdVariants(portfolio.crownBankroll);

  // 1) the five canonical pages must serve 200.
  const PAGES = ["/", "/bank-builder", "/picks", "/mr-dub", "/methodology"];
  for (const p of PAGES) {
    try {
      const { status } = await get(`${BASE}${p}/`);
      if (status === 200) pass.push(`200 ${p}`);
      else fail.push(`${p} returned ${status}`);
    } catch (e) { fail.push(`${p} fetch error: ${e.message}`); }
  }

  // 2) NO reconciliation drift — Track Record must render the canonical bankroll + crown.
  try {
    const { body } = await get(`${BASE}/mr-dub/`);
    if (bankrollOK.some((v) => body.includes(v))) pass.push(`track-record shows canonical bankroll $${portfolio.currentBankroll}`);
    else fail.push(`track-record does NOT show canonical bankroll $${portfolio.currentBankroll} (drift between committed data and live render)`);
    if (crownOK.some((v) => body.includes(v))) pass.push(`track-record shows canonical crown $${portfolio.crownBankroll}`);
    else fail.push(`track-record does NOT show canonical crown $${portfolio.crownBankroll}`);
    // anti-marker: the historical reconciliation bug ($8,228) must never reappear.
    if (body.includes("8,228")) fail.push(`track-record shows the deprecated $8,228 lifetime-profit bug`);
    else pass.push(`no $8,228 regression`);
  } catch (e) { fail.push(`/mr-dub fetch error: ${e.message}`); }

  // 3) the homepage hero must show the same realized profit (the proof number).
  try {
    const { body } = await get(`${BASE}/`);
    const profitOK = usdVariants(portfolio.settledProfit);
    if (profitOK.some((v) => body.includes(v)) || bankrollOK.some((v) => body.includes(v))) pass.push(`home reflects canonical money`);
    else fail.push(`home does not reflect canonical money ($${portfolio.settledProfit} / $${portfolio.currentBankroll})`);
  } catch (e) { fail.push(`/ fetch error: ${e.message}`); }

  console.log(`\n=== PRODUCTION SMOKE · ${BASE} ===`);
  for (const p of pass) console.log(`  ✓ ${p}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  if (fail.length === 0) { console.log(`\n=== ✓ SMOKE PASSED (${pass.length} checks) — deploy verified live. ===\n`); process.exit(0); }
  console.error(`\n=== ✗ SMOKE FAILED (${fail.length}) — production does not match canonical data. ===\n`); process.exit(1);
}
main();
