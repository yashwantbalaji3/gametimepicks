/**
 * UFC FIGHT-WINNER PRICES — one bulk call, under the committed UFC authorization.
 *
 * Authorized by docs/receipts/ODDS_AUTHORIZATION_UFC.md: UFC/MMA only, h2h only, us region only,
 * bulk endpoint only, 500-credit cumulative ceiling. That receipt is parsed FAIL-CLOSED on every
 * run and it cannot be substituted by the NFL one — the parser refuses a receipt whose scope names
 * another sport key, in both directions.
 *
 * ── Why bulk, and why the per-event route is out of scope ───────────────────────────────────────
 * The July 2026 capture used the per-event endpoint and paid 20 credits to price 20 bouts. The bulk
 * route prices the whole card for markets x regions = 1 x 1 = ONE credit. Same prices, same books.
 * The per-event route is therefore not merely more expensive, it is a defect, and the receipt names
 * it out of scope so a regression toward it trips the ceiling instead of quietly costing 20x.
 *
 * ── What it will not do ─────────────────────────────────────────────────────────────────────────
 * It buys h2h and nothing else. Our method and round heads were REJECTED on their preregistered
 * bars, so buying those markets would be paying for prices no validated read can stand beside.
 *
 * Writes public   public/data/ufc/odds-latest.json         (joined to the card; no raw payload)
 *        private  data/internal/research/odds/ufc/authorization-ledger.json
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
import { nameKey } from "./lib/fight-model.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const RECEIPT = path.join(REPO, "docs", "receipts", "ODDS_AUTHORIZATION_UFC.md");
const LEDGER = path.join(REPO, LEDGER_RELPATH.ufc);
const OUT = path.join(APP, "public", "data", "ufc");

const has = (f) => process.argv.includes(f);
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const APPLY = has("--apply");
const NOW = arg("--now", new Date().toISOString());

/* Every term below is fixed by the receipt. They are constants, not options, so a flag cannot
   widen the purchase past what was authorized. */
const SPORT_KEY = "mma_mixed_martial_arts";
const MARKETS = ["h2h"];
const REGIONS = ["us"];
const WORST_CASE_CREDITS = MARKETS.length * REGIONS.length;   // the provider's own cost formula

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// ── 1 · AUTHORIZATION, BEFORE ANYTHING ELSE ─────────────────────────────────────────────────────
const receipt = (() => { try { return fs.readFileSync(RECEIPT, "utf8"); } catch { return null; } })();
if (!receipt) {
  console.error(`ufc odds: no committed receipt at ${path.relative(REPO, RECEIPT)} — authorization is never inferred.`);
  process.exit(1);
}
const auth = parseSportAuthorizationReceipt(receipt, "ufc");
if (!auth.ok) {
  console.error("ufc odds: the receipt did not parse. Refusing to spend.");
  for (const e of auth.errors) console.error(`  · ${e}`);
  process.exit(1);
}

let ledger = readJson(LEDGER) ?? emptyLedger(path.relative(REPO, RECEIPT), { sport: "ufc", program: "UFC" });
const allowed = assertCallAllowed({ authorization: auth, ledger, worstCaseCredits: WORST_CASE_CREDITS, purpose: "fight-week bulk h2h" });
if (!allowed.ok) {
  for (const e of allowed.errors) console.error(`ufc odds: ${e}`);
  process.exit(1);
}
console.log(`authorization: ufc h2h/${REGIONS.join(",")} · ceiling ${auth.ceiling} · spent ${allowed.cumulative} · worst case ${WORST_CASE_CREDITS} · remaining ${allowed.remaining}`);

// ── 2 · THE CARD THIS IS PRICING ────────────────────────────────────────────────────────────────
const card = readJson(path.join(OUT, "card-latest.json"));
if (card?.state !== "SCHEDULED_CARD") {
  console.error(`ufc odds: no scheduled card to price (state ${card?.state ?? "absent"}) — nothing to buy.`);
  process.exit(1);
}
console.log(`card: ${card.event.name} · ${card.event.boutCount} bouts · ${card.event.slateDate}`);

if (!APPLY) {
  console.log(`DRY RUN — would call GET /v4/sports/${SPORT_KEY}/odds?regions=${REGIONS.join(",")}&markets=${MARKETS.join(",")} (worst case ${WORST_CASE_CREDITS} credit).`);
  console.log("Nothing was spent. Re-run with --apply to buy.");
  process.exit(0);
}

// ── 3 · THE CALL ────────────────────────────────────────────────────────────────────────────────
const KEY = (process.env.ODDS_API_KEY ?? "").trim();
if (!KEY) { console.error("ufc odds: ODDS_API_KEY is not set in this environment."); process.exit(1); }

const fingerprint = `ufc|${SPORT_KEY}|${MARKETS.join(",")}|${REGIONS.join(",")}|${card.event.providerEventId}`;
/* `.duplicate`, not the object — isDuplicateRequest returns {duplicate:false} on a clean ledger,
   which is truthy, so testing the return value blocked every capture forever. It failed in the safe
   direction (refusing to spend) but it refused unconditionally. */
const dup = isDuplicateRequest(ledger, { fingerprint, nowIso: NOW, freshnessMinutes: 30 });
if (dup.duplicate) {
  console.log(`ufc odds: ${dup.reason}`);
  process.exit(0);
}

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
  // A transport failure is not a charged call, but it is also not a reason to retry blindly.
  console.error(`ufc odds: request failed before a response (${e.name}). Not retrying.`);
  process.exit(1);
}

const cls = classifyProviderResult({ status, body });
ledger = recordRequest(ledger, {
  at: NOW, purpose: `fight-week bulk h2h · ${card.event.name}`, endpoint: `/sports/${SPORT_KEY}/odds`,
  events: Array.isArray(body) ? body.length : null, markets: MARKETS, regions: REGIONS,
  status, headers, charged: status === 200, fingerprint, resultClass: cls.class,
});
fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + "\n");

if (cls.class !== "OK") {
  console.error(`ufc odds: ${cls.class} — ${cls.action}`);
  console.error(`  provider status ${status}; cumulative spend now ${ledger.cumulativeCredits}/${auth.ceiling}`);
  process.exit(1);
}

// ── 4 · JOIN TO THE CARD ────────────────────────────────────────────────────────────────────────
/*
 * Fighters are matched through nameKey on BOTH sides — the same fold the model uses. The provider
 * writes "Kaue Fernandes" where the schedule writes "Kauê Fernandes", and matching raw strings
 * silently drops those bouts into "no price", which reads as the book not offering one.
 *
 * A bout that does not join is REPORTED, never dropped: an unpriced bout is a fact about our join,
 * not about the market.
 */
const priced = new Map();
for (const ev of Array.isArray(body) ? body : []) {
  const h2h = (ev.bookmakers ?? []).flatMap((b) => (b.markets ?? []).filter((m) => m.key === "h2h").map((m) => ({ book: b.key, outcomes: m.outcomes ?? [] })));
  if (!h2h.length) continue;
  priced.set([nameKey(ev.home_team), nameKey(ev.away_team)].sort().join("|"), { providerEventId: ev.id, commenceUtc: ev.commence_time, books: h2h });
}

const bouts = [], unjoined = [];
for (const b of card.bouts ?? []) {
  const key = [nameKey(b.red?.name), nameKey(b.blue?.name)].sort().join("|");
  const p = priced.get(key);
  if (!p) { unjoined.push(`${b.red?.name} vs ${b.blue?.name}`); continue; }

  /* Consensus per fighter = the median posted price across books. A single book's number is that
     book's opinion; the median is the market's, and it is what a reader can actually shop. */
  const byFighter = new Map();
  for (const bk of p.books) for (const o of bk.outcomes) {
    const arr = byFighter.get(nameKey(o.name)) ?? [];
    arr.push(Number(o.price));
    byFighter.set(nameKey(o.name), arr);
  }
  const median = (xs) => { const s = [...xs].sort((a, z) => a - z); return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2); };
  const side = (name) => {
    const xs = (byFighter.get(nameKey(name)) ?? []).filter(Number.isFinite);
    return xs.length ? { american: median(xs), books: xs.length } : null;
  };

  bouts.push({
    boutId: b.boutId, eventId: card.event.providerEventId,
    red: { name: b.red?.name ?? null, price: side(b.red?.name) },
    blue: { name: b.blue?.name ?? null, price: side(b.blue?.name) },
  });
}

const snapshot = {
  generatedAt: NOW,
  sportKey: SPORT_KEY,
  event: { providerEventId: card.event.providerEventId, name: card.event.name, slateDate: card.event.slateDate },
  eventCount: bouts.length,
  marketCount: bouts.length,
  markets: MARKETS,
  regions: REGIONS,
  bouts,
  /* Named, not silently absent — see the join note above. */
  unjoinedBouts: unjoined,
  oddsReady: bouts.length > 0,
  blockers: bouts.length ? [] : ["the provider returned no h2h market that joined to this card"],
  creditCost: ledger.requests.at(-1)?.creditsUsed ?? WORST_CASE_CREDITS,
  creditsRemaining: Number(headers["x-requests-remaining"]) || null,
  authorization: { receipt: "docs/receipts/ODDS_AUTHORIZATION_UFC.md", ceiling: auth.ceiling, cumulative: ledger.cumulativeCredits },
  note: "Fight-winner prices only, median across posted US books. Paper-only; no wagers are placed.",
};

/* Nothing leaves this process carrying the key or the account. */
assertNoSecretLeak(snapshot, [KEY]);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "odds-latest.json"), JSON.stringify(snapshot, null, 1) + "\n");
fs.writeFileSync(path.join(OUT, `odds-${card.event.slateDate}.json`), JSON.stringify(snapshot, null, 1) + "\n");

console.log(`ufc odds: ${bouts.length}/${card.bouts.length} bouts priced · ${snapshot.creditCost} credit(s) · cumulative ${ledger.cumulativeCredits}/${auth.ceiling}`);
if (unjoined.length) console.log(`  unjoined: ${unjoined.join(" · ")}`);
