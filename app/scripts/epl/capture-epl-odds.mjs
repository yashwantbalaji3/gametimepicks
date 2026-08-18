/**
 * PREMIER LEAGUE PRICES — one bulk call, under the committed EPL authorization.
 *
 * Authorized by docs/receipts/ODDS_AUTHORIZATION_EPL.md: EPL only, h2h + totals, us region only,
 * bulk endpoint only, 500-credit cumulative ceiling. That receipt is parsed FAIL-CLOSED every run
 * and cannot be substituted by the NFL or UFC ones — the parser refuses a receipt whose scope names
 * a different sport key, in every direction.
 *
 * ── What this is FOR ────────────────────────────────────────────────────────────────────────────
 * The committed EPL model card names this snapshot as its own precondition: "research comparison
 * against three-way no-vig markets ONLY AFTER an authorized snapshot exists", with
 * publicActivation OFF. So the point of buying these prices is to find out whether the model is
 * worth publishing — and three MLB markets and two NFL models have already been rejected at exactly
 * that step. Capturing prices is not activating anything.
 *
 * ── The de-vig is not optional ──────────────────────────────────────────────────────────────────
 * A three-way book price sums to well over 1. Comparing a model probability against a raw implied
 * price scores the model against the bookmaker's margin as well as its opinion, which flatters or
 * punishes it for the wrong reason. The no-vig probabilities are computed here, once, so every
 * downstream comparison uses the same de-vigged numbers.
 *
 * Writes public   public/data/soccer/epl/odds/capture-<date>.json   (+ latest.json)
 *        private  data/internal/research/odds/epl/authorization-ledger.json
 *
 * Default is --dry-run: it plans, prices the worst case and refuses to spend unless --apply.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSportAuthorizationReceipt, emptyLedger, assertCallAllowed, recordRequest,
  assertNoSecretLeak, classifyProviderResult, isDuplicateRequest, LEDGER_RELPATH,
} from "../../src/lib/sports/odds/p171-authorization.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const RECEIPT = path.join(REPO, "docs", "receipts", "ODDS_AUTHORIZATION_EPL.md");
const LEDGER = path.join(REPO, LEDGER_RELPATH.epl);
const OUT = path.join(APP, "public", "data", "soccer", "epl", "odds");

const has = (f) => process.argv.includes(f);
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const APPLY = has("--apply");
const NOW = arg("--now", new Date().toISOString());

/* Fixed by the receipt. Constants, not options — a flag must not be able to widen the purchase. */
const SPORT_KEY = "soccer_epl";
const MARKETS = ["h2h", "totals"];
const REGIONS = ["us"];
const WORST_CASE_CREDITS = MARKETS.length * REGIONS.length;   // the provider's own cost formula

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const etDay = (iso) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(iso));

// ── 1 · AUTHORIZATION, BEFORE ANYTHING ELSE ─────────────────────────────────────────────────────
const receipt = (() => { try { return fs.readFileSync(RECEIPT, "utf8"); } catch { return null; } })();
if (!receipt) {
  console.error(`epl odds: no committed receipt at ${path.relative(REPO, RECEIPT)} — authorization is never inferred.`);
  process.exit(1);
}
const auth = parseSportAuthorizationReceipt(receipt, "epl");
if (!auth.ok) {
  console.error("epl odds: the receipt did not parse. Refusing to spend.");
  for (const e of auth.errors) console.error(`  · ${e}`);
  process.exit(1);
}

let ledger = readJson(LEDGER) ?? emptyLedger(path.relative(REPO, RECEIPT), { sport: "epl", program: "EPL" });
const allowed = assertCallAllowed({ authorization: auth, ledger, worstCaseCredits: WORST_CASE_CREDITS, purpose: "matchweek bulk h2h+totals" });
if (!allowed.ok) { for (const e of allowed.errors) console.error(`epl odds: ${e}`); process.exit(1); }
console.log(`authorization: epl ${MARKETS.join("+")}/${REGIONS.join(",")} · ceiling ${auth.ceiling} · spent ${allowed.cumulative} · worst case ${WORST_CASE_CREDITS} · remaining ${allowed.remaining}`);

if (!APPLY) {
  console.log(`DRY RUN — would call GET /v4/sports/${SPORT_KEY}/odds?regions=${REGIONS.join(",")}&markets=${MARKETS.join(",")} (worst case ${WORST_CASE_CREDITS} credits).`);
  console.log("Nothing was spent. Re-run with --apply to buy.");
  process.exit(0);
}

// ── 2 · THE CALL ────────────────────────────────────────────────────────────────────────────────
const KEY = (process.env.ODDS_API_KEY ?? "").trim();
if (!KEY) { console.error("epl odds: ODDS_API_KEY is not set in this environment."); process.exit(1); }

const fingerprint = `epl|${SPORT_KEY}|${MARKETS.join(",")}|${REGIONS.join(",")}`;
const dup = isDuplicateRequest(ledger, { fingerprint, nowIso: NOW, freshnessMinutes: 60 });
if (dup.duplicate) { console.log(`epl odds: ${dup.reason}`); process.exit(0); }

const url = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds?regions=${REGIONS.join(",")}&markets=${MARKETS.join(",")}&oddsFormat=american`;
let status = 0, body = null, headers = {};
try {
  const res = await fetch(`${url}&apiKey=${KEY}`, { signal: AbortSignal.timeout(25_000), headers: { accept: "application/json" } });
  status = res.status;
  headers = {
    "x-requests-last": res.headers.get("x-requests-last"),
    "x-requests-used": res.headers.get("x-requests-used"),
    "x-requests-remaining": res.headers.get("x-requests-remaining"),
  };
  body = await res.json().catch(() => null);
} catch (e) {
  console.error(`epl odds: request failed before a response (${e.name}). Not retrying.`);
  process.exit(1);
}

const cls = classifyProviderResult({ status, body });
ledger = recordRequest(ledger, {
  at: NOW, purpose: "matchweek bulk h2h+totals", endpoint: `/sports/${SPORT_KEY}/odds`,
  events: Array.isArray(body) ? body.length : null, markets: MARKETS, regions: REGIONS,
  status, headers, charged: status === 200, fingerprint, resultClass: cls.class,
});
fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + "\n");

if (cls.class !== "OK") {
  console.error(`epl odds: ${cls.class} — ${cls.action}`);
  console.error(`  provider status ${status}; cumulative spend now ${ledger.cumulativeCredits}/${auth.ceiling}`);
  process.exit(1);
}

// ── 3 · CONSENSUS + DE-VIG ──────────────────────────────────────────────────────────────────────
const median = (xs) => { const s = [...xs].sort((a, z) => a - z); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const toDec = (american) => (american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american));
const toAm = (dec) => (dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)));

const rows = [];
for (const ev of Array.isArray(body) ? body : []) {
  /* Consensus = the median across books per outcome. One book's number is that book's opinion. */
  const acc = new Map();  // `${marketKey}|${outcomeName}|${point ?? ""}` -> [decimal, ...]
  for (const bk of ev.bookmakers ?? []) {
    for (const m of bk.markets ?? []) {
      if (!MARKETS.includes(m.key)) continue;     // never record a market we did not buy
      for (const o of m.outcomes ?? []) {
        const k = `${m.key}|${o.name}|${o.point ?? ""}`;
        const d = toDec(Number(o.price));
        if (!Number.isFinite(d) || d <= 1) continue;
        acc.set(k, [...(acc.get(k) ?? []), d]);
      }
    }
  }
  if (!acc.size) continue;

  const h2h = [...acc.entries()].filter(([k]) => k.startsWith("h2h|"));
  const totals = [...acc.entries()].filter(([k]) => k.startsWith("totals|"));

  /*
   * De-vig proportionally across the THREE-way market as a set. Doing it per outcome, or treating
   * a draw as a two-way complement, is what makes a soccer comparison quietly wrong.
   */
  const devig = (entries) => {
    const raw = entries.map(([k, xs]) => ({ key: k, decimal: median(xs), books: xs.length }));
    const sum = raw.reduce((n, r) => n + 1 / r.decimal, 0);
    return raw.map((r) => ({
      outcome: r.key.split("|")[1],
      point: r.key.split("|")[2] === "" ? null : Number(r.key.split("|")[2]),
      american: toAm(r.decimal),
      books: r.books,
      impliedRaw: Number((1 / r.decimal).toFixed(4)),
      noVig: sum > 0 ? Number((1 / r.decimal / sum).toFixed(4)) : null,
    }));
  };

  rows.push({
    providerEventId: ev.id,
    kickoffIso: ev.commence_time,
    home: ev.home_team, away: ev.away_team,
    matchResult: h2h.length ? devig(h2h) : null,
    /* Totals de-vig per LINE, not across every line at once — over 2.5 and over 3.5 are separate
       markets and pooling them would produce a probability set that sums to nothing meaningful. */
    totalGoals: totals.length
      ? Object.values(totals.reduce((by, [k, xs]) => {
          const point = k.split("|")[2];
          (by[point] ??= []).push([k, xs]);
          return by;
        }, {})).map((group) => ({ line: Number(group[0][0].split("|")[2]), outcomes: devig(group) }))
      : null,
  });
}

const snapshot = {
  schemaVersion: 1,
  artifact: "epl-odds-capture",
  competition: "epl",
  dataClass: "ODDS_CAPTURE",
  generatedAt: NOW,
  sportKey: SPORT_KEY,
  markets: MARKETS,
  regions: REGIONS,
  eventCount: rows.length,
  rows,
  creditCost: ledger.requests.at(-1)?.creditsUsed ?? WORST_CASE_CREDITS,
  creditsRemaining: Number(headers["x-requests-remaining"]) || null,
  authorization: { receipt: "docs/receipts/ODDS_AUTHORIZATION_EPL.md", ceiling: auth.ceiling, cumulative: ledger.cumulativeCredits },
  note: "Consensus prices across posted US books, de-vigged proportionally within each market. No model claim is attached: the EPL model card requires this snapshot BEFORE its comparison can run, and that comparison is the bar it must still pass.",
};

/*
 * A STRING, and the verdict is READ. See the UFC capture for the incident: passing the object
 * crashed after the credit was spent, discarding a real capture inside the safeguard itself.
 */
const payload = JSON.stringify(snapshot, null, 1) + "\n";
const leak = assertNoSecretLeak(payload, [KEY]);
if (!leak.ok) { console.error(`epl odds: REFUSED — ${leak.reason}`); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "latest.json"), payload);
fs.writeFileSync(path.join(OUT, `capture-${etDay(NOW)}.json`), payload);

console.log(`epl odds: ${rows.length} fixtures priced · ${snapshot.creditCost} credit(s) · cumulative ${ledger.cumulativeCredits}/${auth.ceiling}`);
