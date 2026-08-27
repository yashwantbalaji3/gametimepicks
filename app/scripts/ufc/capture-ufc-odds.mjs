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
import { classifyCardCoverage, coverageReconciles } from "../../src/lib/sports/ufc/card-coverage.mjs";
import { findLooseMatch } from "../../src/lib/sports/ufc/fighter-alias.mjs";
import { buildUfcOddsSnapshot } from "../../src/lib/sports/ufc/odds-snapshot.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const RECEIPT = path.join(REPO, "docs", "receipts", "ODDS_AUTHORIZATION_UFC.md");
const LEDGER = path.join(REPO, LEDGER_RELPATH.ufc);
const OUT = path.join(APP, "public", "data", "ufc");
/* Per-book prices are research input, not a public surface — they live beside the credit ledger. */
const PRIVATE_OUT = path.join(REPO, "data", "internal", "research", "odds", "ufc");

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

const boutKey = (b) => [nameKey(b.red?.name), nameKey(b.blue?.name)].sort().join("|");
/* Which provider events a bout on THIS card actually claimed. A provider event nobody claimed is
   evidence a market exists that we failed to recognise, and that is what separates a book that has
   not opened a fight from a join that missed one. */
const consumed = new Set();
const bouts = [];
const rescued = [];
for (const b of card.bouts ?? []) {
  const key = boutKey(b);
  let p = priced.get(key);
  let joinMethod = "exact";
  /*
   * SECOND CHANCE, never a first one. The exact fold is always tried first and always preferred;
   * only when it fails do we ask whether some unconsumed provider event names these same two
   * fighters under a different spelling. Five of thirteen bouts on the Aug-29 card were sitting
   * behind exactly that — reversed CJK name order, a dropped "Jr.", and single names the book
   * writes as two — with prices we had already bought. Ambiguity refuses rather than guesses.
   */
  let matchedKey = key;
  if (!p) {
    const alt = findLooseMatch(
      [nameKey(b.red?.name), nameKey(b.blue?.name)],
      [...priced.keys()].filter((k) => !consumed.has(k)),
    );
    if (alt) {
      p = priced.get(alt);
      matchedKey = alt;
      joinMethod = "alias";
      rescued.push({ boutId: b.boutId, matchup: `${b.red?.name} vs ${b.blue?.name}`, providerKey: alt });
    }
  }
  // Unpriced bouts are classified in one place after the loop — see lib/sports/ufc/card-coverage.mjs
  // for why "no price" is two different facts and why a sentence is not a bout identity.
  if (!p) continue;
  consumed.add(matchedKey);

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
    /*
     * `eventId` IS THE BOUT, not the card.
     *
     * Downstream, "one event per card" means one BOUT per card — two legs from the same fight are
     * the same event twice, which is the correlation a parlay must not contain. Stamping the card's
     * id on every bout collapsed twelve priced fights into a single "game" and read as a card too
     * thin to build a ladder from. The card's own id is on the snapshot, once, where it belongs.
     */
    boutId: b.boutId, eventId: b.boutId,
    /* "exact" or "alias". A rescued join is a fact about our matching, and hiding it would make the
       fold look healthier than it is — the aliases below are how we learn the fold needs work. */
    joinMethod,
    /* Per-book markets ride along in memory only — they are stripped before the PUBLIC write below
       and persisted to the private research path, where the model reads them. */
    _books: p.books,
    red: { name: b.red?.name ?? null, price: side(b.red?.name) },
    blue: { name: b.blue?.name ?? null, price: side(b.blue?.name) },
    /*
     * `sides` as well as red/blue, because this artifact has TWO consumers.
     *
     * The prediction engine behind /ufc's report indexes bouts by `sides[].name`. Publishing only
     * the corner-named shape replaced an artifact it could read with one it could not, and the
     * report silently fell back to zero market-backed moneylines — the page still rendered, just
     * without the market read it exists to show. Same data, in the shape each consumer already
     * expects; a rename here is a silent regression somewhere else.
     */
    /* `price` is the field the prediction engine reads (EngineOddsSide.price). `american` is kept
       alongside it because that is what every other artifact here calls an American number — one
       consumer's field name is not a reason to rename it for the rest. */
    sides: [
      { name: b.red?.name ?? null, price: side(b.red?.name)?.american ?? null, american: side(b.red?.name)?.american ?? null, books: side(b.red?.name)?.books ?? 0 },
      { name: b.blue?.name ?? null, price: side(b.blue?.name)?.american ?? null, american: side(b.blue?.name)?.american ?? null, books: side(b.blue?.name)?.books ?? 0 },
    ],
  });
}

/*
 * THE PRIVATE PER-BOOK SNAPSHOT — built BEFORE the public artifact, from the same paid response.
 *
 * The public artifact publishes the MEDIAN across books, which is the right read for a person. The
 * model needs the per-book markets it was written against: runUfcShadow de-vigs each bookmaker
 * separately and quarantines any two-way market that does not de-vig. Until now the capture threw
 * those rows away, so the de-vig path had no input and every bout reported READY_EXCEPT_ODDS while
 * the capture itself reported success.
 *
 * Private, not public: these are per-book prices, and the public surface already has the consensus.
 */
const shadowSnapshot = buildUfcOddsSnapshot({
  capturedAt: NOW,
  bouts: bouts.map((b) => ({ boutId: b.boutId, books: b._books })),
});
/*
 * A priced card that yields no rows is a WIRING failure, not an empty market — the first cut of this
 * shipped `_books` to an adapter reading `books` and wrote a 0-row snapshot while the run reported
 * success. Fail loudly rather than persist an empty file that reads as "the market had nothing".
 */
if (bouts.length > 0 && shadowSnapshot.rows.length === 0) {
  console.error(`ufc odds: REFUSED — ${bouts.length} bout(s) priced but 0 per-book rows built (per-book markets did not reach the snapshot builder)`);
  process.exit(1);
}
const shadowPayload = JSON.stringify(shadowSnapshot, null, 1) + "\n";
const shadowLeak = assertNoSecretLeak(shadowPayload, [KEY]);
if (!shadowLeak.ok) { console.error(`ufc odds: REFUSED — ${shadowLeak.reason}`); process.exit(1); }
fs.mkdirSync(PRIVATE_OUT, { recursive: true });
fs.writeFileSync(path.join(PRIVATE_OUT, "shadow-snapshot-latest.json"), shadowPayload);
fs.writeFileSync(path.join(PRIVATE_OUT, `shadow-snapshot-${card.event.slateDate}.json`), shadowPayload);
console.log(`ufc odds: private per-book snapshot → ${shadowSnapshot.rows.length} h2h row(s) across ${bouts.length} bout(s)`);

/* The per-book markets are the model's input, not the reader's — strip them from the public shape. */
for (const b of bouts) delete b._books;

const {
  coverage, unpriced, unmatchedProviderEvents, blockers, oddsReady, partiallyPriced,
} = classifyCardCoverage({
  cardBouts: card.bouts ?? [],
  pricedByKey: priced,
  matchedKeys: consumed,
  // The keys a bout CLAIMED, which for an aliased join is the provider's spelling rather than the
  // card's — otherwise a rescued bout would still count as unpriced.
  keyOf: (b) => {
    const k = boutKey(b);
    if (priced.has(k)) return k;
    const hit = rescued.find((r) => r.boutId === b.boutId);
    return hit ? hit.providerKey : k;
  },
  // The authorised call is the BULK MMA endpoint, so `priced` holds every upcoming fight the book
  // lists — including other promotions running the same weekend. Fighter identity is what says
  // which of them could possibly be a missed join on THIS card; a time window is not (it left
  // eleven regional-circuit bouts looking like our own).
  fighterKeys: (b) => [nameKey(b.red?.name), nameKey(b.blue?.name)],
});

if (!coverageReconciles(coverage)) {
  console.error(`ufc odds: REFUSED — coverage does not reconcile: ${JSON.stringify(coverage)}`);
  process.exit(1);
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
  /* Typed and identity-bearing — see the coverage note above. */
  unpricedBouts: unpriced,
  coverage,
  /* Bouts joined only by the alias pass. An empty list is the healthy state; a growing one names
     exactly which fighters our fold cannot spell the way the book does. */
  aliasJoins: rescued,
  /*
   * Ready means the WHOLE card is priced. A partially priced card is still useful and still
   * publishes its eight fights; it is simply not a state anything downstream should treat as
   * complete, and the difference has to be legible without counting array lengths.
   */
  oddsReady,
  partiallyPriced,
  blockers,
  creditCost: ledger.requests.at(-1)?.creditsUsed ?? WORST_CASE_CREDITS,
  creditsRemaining: Number(headers["x-requests-remaining"]) || null,
  authorization: { receipt: "docs/receipts/ODDS_AUTHORIZATION_UFC.md", ceiling: auth.ceiling, cumulative: ledger.cumulativeCredits },
  note: "Fight-winner prices only, median across posted US books. Paper-only; no wagers are placed.",
};

/* Nothing leaves this process carrying the key or the account. */
/*
 * assertNoSecretLeak takes a STRING and RETURNS a verdict — it does not throw, and it cannot scan
 * an object. Passing the snapshot itself crashed on `payload.includes` AFTER the paid call had
 * already succeeded and the credit was already spent, so a real capture was discarded by the very
 * check meant to protect it. Calling a fail-closed helper without reading its answer is a no-op
 * wearing the shape of a safeguard.
 */
const payload = JSON.stringify(snapshot, null, 1) + "\n";
const leak = assertNoSecretLeak(payload, [KEY]);
if (!leak.ok) { console.error(`ufc odds: REFUSED — ${leak.reason}`); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "odds-latest.json"), payload);
fs.writeFileSync(path.join(OUT, `odds-${card.event.slateDate}.json`), payload);

console.log(`ufc odds: ${bouts.length}/${card.bouts.length} bouts priced · ${snapshot.creditCost} credit(s) · cumulative ${ledger.cumulativeCredits}/${auth.ceiling}`);
for (const r of rescued) console.log(`  ALIAS JOIN: ${r.boutId} ${r.matchup} ← provider "${r.providerKey}"`);
for (const u of unpriced) console.log(`  ${u.state}: ${u.boutId} ${u.matchup} — ${u.reason}`);
for (const u of unmatchedProviderEvents) console.log(`  UNMATCHED PROVIDER EVENT: ${u.providerEventId} (${u.key})`);
