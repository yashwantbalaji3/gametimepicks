/**
 * Challenge-lane prices (odds.mjs) with a FAKE fetch and a TEST receipt: no network, no credit, no real price.
 *   npx tsx --test src/lib/challenge-lanes/odds.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLegPool } from "../products/leg-pool/leg-pool.mjs";
import { dailySuggestedCards, sealSuggestedCards } from "../products/leg-pool/daily-cards.mjs";
import { selectLaneCards, runStarted, laneState } from "./lanes.mjs";
import { prepareLane, priceLane } from "./ops.mjs";
import { parseBbmOddsReceipt, captureBbmPrices, priceForCard, planBbmCapture, spentOnEtDay } from "./odds.mjs";
import { canonical, sha256, parseEvents, verifyChain } from "./chain.mjs";
import { lanePriceDisplay, encryptLanePriceDisplay, readLanePriceDisplay } from "./price-display.mjs";
import { laneProjection, serializeProjection } from "./projection.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const REPO = path.resolve(APP, "..");
const DATE = "2026-11-02";
const LANE = JSON.parse(fs.readFileSync(path.join(REPO, `app/public/data/nba/experimental-public/${DATE}.json`), "utf8"));
const DOC = sealSuggestedCards(dailySuggestedCards(buildLegPool({ repoRoot: REPO, date: DATE, evaluatedAt: LANE.generatedAt })));
const SEL = selectLaneCards(DOC, "bank-builder");
const KEY = "k".repeat(32);
const NOW = "2026-11-02T22:30:00Z";

/* A TEST receipt in the BBM shape. It authorizes nothing outside this file: the CLI reads only committed receipts. */
const RECEIPT = `# TEST receipt (not an authorization)
NBA-only (\`basketball_nba\`), Bank Builder & Moonshot V2 challenge lanes only.
Markets authorized: \`h2h\`
Effective cumulative ceiling: 600 credits
BBM daily ceiling: 120 credits
BBM weekly ceiling: 600 credits
Shared weekly ceiling: 3,500 credits
Shared weekly baseline: 306 used at 2026-11-04T04:15Z
Credit floor: 2000
| Failures | stop; do not retry blindly |
| Expiry | the 600-credit cumulative ceiling, or 2099-12-31 23:59 ET, whichever first |
Approved by: TEST 2026-11-04
`;

const card = SEL.A.card;
const legsOf = (c) => c.legs.map((l) => { const [away, home] = l.eventLabel.split(" @ "); return { gameId: l.gameId, home, away, startUtc: l.startUtc, market: l.market }; });
const NAMES = { NY: "New York Knicks", BKN: "Brooklyn Nets", DEN: "Denver Nuggets", POR: "Portland Trail Blazers" };
const listing = () => card.legs.map((l, i) => { const [away, home] = l.eventLabel.split(" @ "); return { id: `odds-${i}`, home_team: NAMES[home], away_team: NAMES[away], commence_time: new Date(Date.parse(l.startUtc)).toISOString() }; });
const oddsBody = (books = ["fanduel", "draftkings"]) => listing().map((e, i) => ({ ...e, bookmakers: books.map((key, j) => ({ key, last_update: "2026-11-02T22:20:00Z", markets: [{ key: "h2h", last_update: "2026-11-02T22:20:00Z", outcomes: [{ name: e.home_team, price: [-900, -240][i] - j * 10 }, { name: e.away_team, price: [600, 195][i] }] }] })) }));
const res = (status, body, h = {}) => ({ status, headers: { get: (k) => h[k] ?? null }, json: async () => body });
function fakeFetch({ used = 400, remaining = 19600, last = 1, body = oddsBody(), status = 200 } = {}) {
  const urls = [];
  const f = async (url) => { urls.push(url); return url.includes("/events?") ? res(200, listing(), { "x-requests-used": String(used), "x-requests-remaining": String(remaining), "x-requests-last": "0" }) : res(status, body, { "x-requests-used": String(used + last), "x-requests-remaining": String(remaining - last), "x-requests-last": String(last) }); };
  f.urls = urls; return f;
}
const run = (o = {}) => captureBbmPrices({ now: NOW, receiptText: RECEIPT, legs: legsOf(card), apply: true, apiKey: KEY, fetchImpl: fakeFetch(), clock: () => "2026-11-02T22:30:05Z", ...o });

test("receipt guard: every BBM term is required", () => {
  const a = parseBbmOddsReceipt(RECEIPT, { now: NOW });
  assert.ok(a.ok, JSON.stringify(a.errors));
  assert.deepEqual([a.daily, a.weekly, a.sharedWeekly, a.baseline.used, a.floor, a.ceiling], [120, 600, 3500, 306, 2000, 600]);
  for (const line of ["BBM daily ceiling", "Shared weekly baseline", "Credit floor", "Markets authorized", "Approved by", "Bank Builder & Moonshot"]) {
    const cut = RECEIPT.split("\n").filter((l) => !l.includes(line)).join("\n");
    assert.equal(parseBbmOddsReceipt(cut, { now: NOW }).ok, false, line);
  }
  assert.equal(parseBbmOddsReceipt(RECEIPT.replace("2099-12-31", "2026-11-01"), { now: NOW }).ok, false, "expired");
  assert.equal(parseBbmOddsReceipt(null).ok, false);
});

test("plan: one bulk h2h call for the slate; worst case 1 credit with the nine eligible operators", () => {
  const p = planBbmCapture({ eventCount: 2 });
  assert.equal(p.worstCaseCredits, 1);
  assert.equal(p.calls.length, 2);
  assert.equal(p.bookmakers.length, 9);
});

test("dry run spends nothing; refusals before any call", async () => {
  const f = fakeFetch();
  const d = await run({ apply: false, fetchImpl: f });
  assert.deepEqual([d.state, f.urls.length, d.plan.worstCaseCredits], ["DRY_RUN", 0, 1]);
  assert.equal((await run({ receiptText: null })).state, "REFUSED");
  assert.match((await run({ legs: [{ ...legsOf(card)[0], market: "player-prop" }] })).reasons[0], /^PROP_CAPTURE_NOT_APPROVED/);
  assert.match((await run({ now: "2026-11-03T05:00:00Z" })).reasons[0], /^STARTED/);
  assert.equal((await run({ apiKey: "" })).state, "REFUSED");
});

test("capture: free listing, ONE paid call with eventIds, ledger without prices, key never in the result", async () => {
  const f = fakeFetch();
  const r = await run({ fetchImpl: f });
  assert.equal(r.state, "CAPTURED", r.stoppedBecause);
  assert.equal(f.urls.length, 2);
  assert.match(f.urls[1], /\/odds\?bookmakers=draftkings,fanduel,.*&markets=h2h&.*&eventIds=odds-0,odds-1&apiKey=/);
  assert.deepEqual(r.ledger.requests.map((x) => [x.purpose, x.creditsUsed]), [["bbm · events listing (free)", 0], ["bbm · h2h", 1]]);
  assert.ok(!JSON.stringify(r).includes(KEY), "no key");
  assert.ok(!/fanduel|draftkings|-9[01]0|"price"|outcomes/.test(JSON.stringify(r.ledger)), "the ledger holds credits and status only");
  assert.deepEqual(Object.keys(r.snapshot.games).sort(), card.legs.map((l) => l.gameId).sort());
  assert.equal(spentOnEtDay(r.ledger, "2026-11-02"), 1);
});

test("credit ceilings stop before the paid call (daily, weekly, shared weekly, floor, unreadable balance)", async () => {
  const at = (n) => ({ requests: [{ at: NOW, creditsUsed: n }], cumulativeCredits: n });
  const stop = async (o) => { const f = o.fetchImpl ?? fakeFetch(); const r = await run({ ...o, fetchImpl: f }); return [r.state, r.stoppedBecause?.split(":")[0], f.urls.length]; };
  assert.deepEqual(await stop({ ledger: at(120) }), ["CEILING_REACHED", "BBM_DAILY_CEILING", 1]);
  assert.deepEqual(await stop({ ledger: { requests: [{ at: "2026-10-30T12:00:00Z", creditsUsed: 600 }], cumulativeCredits: 600 } }), ["CEILING_REACHED", "BBM_WEEKLY_CEILING", 1]);
  assert.deepEqual(await stop({ fetchImpl: fakeFetch({ used: 306 + 3500 }) }), ["CEILING_REACHED", "SHARED_WEEKLY_CEILING", 1]);
  assert.deepEqual(await stop({ fetchImpl: fakeFetch({ remaining: 2000 }) }), ["CEILING_REACHED", "CREDIT_FLOOR", 1]);
  const blind = async (url) => { blind.urls.push(url); return url.includes("/events?") ? res(200, listing(), {}) : res(200, []); };
  blind.urls = [];
  assert.deepEqual(await stop({ fetchImpl: blind }), ["CEILING_REACHED", "PROVIDER_BALANCE_UNREADABLE", 1], "only the free listing was called");
  const r = await run({ fetchImpl: fakeFetch({ status: 429 }) });
  assert.deepEqual([r.state, r.stoppedBecause], ["STOPPED", "RATE_OR_CREDIT_LIMITED on the h2h call"]);
});

test("price for a card: exact match, ONE book in the allowlist's fixed order, never shopped", async () => {
  const { snapshot } = await run();
  const p = priceForCard(card, snapshot);
  assert.ok(p.ok, JSON.stringify(p.refusals));
  assert.deepEqual([...new Set(p.price.legs.map((l) => l.book))], ["draftkings"], "draftkings comes first in eligible-operators@1, even though fanduel is shorter here");
  assert.deepEqual(p.price.legs.map((l) => [l.selectionCode, l.price, l.providerEventId, l.market]), [["home", -910, "odds-0", "h2h"], ["home", -250, "odds-1", "h2h"]]);
  assert.equal(p.price.priceSnapshotSha256, snapshot.snapshotSha256);
  const onlyFd = (await run({ fetchImpl: fakeFetch({ body: oddsBody(["fanduel"]) }) })).snapshot;
  assert.deepEqual([...new Set(priceForCard(card, onlyFd).price.legs.map((l) => l.book))], ["fanduel"]);
  const reseal = (d) => { const { snapshotSha256: _s, ...r } = d; return { ...r, snapshotSha256: sha256(canonical(r)) }; };
  const g0 = card.legs[0].gameId, g1 = card.legs[1].gameId;
  const split = reseal({ ...snapshot, games: { [g0]: { ...snapshot.games[g0], books: { draftkings: snapshot.games[g0].books.draftkings } }, [g1]: { ...snapshot.games[g1], books: { fanduel: snapshot.games[g1].books.fanduel } } } });
  assert.deepEqual(priceForCard(card, split).refusals, ["NO_SINGLE_BOOK_PRICES_EVERY_LEG"], "no cross-book mix");
  assert.deepEqual(priceForCard(card, reseal({ ...snapshot, games: { [g0]: snapshot.games[g0] } })).refusals, [`NO_PRICE_FOR_GAME ${g1}`]);
  assert.deepEqual(priceForCard(card, reseal({ ...snapshot, games: { ...snapshot.games, [g0]: { ...snapshot.games[g0], homeTeam: "Boston Celtics" } } })).refusals, [`EVENT_MISMATCH ${g0}`], "exact event match");
  const tampered = { ...snapshot, games: { ...snapshot.games, [card.legs[0].gameId]: { ...snapshot.games[card.legs[0].gameId], homeTeam: "Boston Celtics" } } };
  assert.deepEqual(priceForCard(card, tampered).refusals, ["SNAPSHOT_UNVERIFIED"]);
});

test("end to end on the 11-02 lane card: price → PAYOUT_COMPUTED with the real provider name and an eligible book", async () => {
  const { snapshot } = await run();
  const head = runStarted({ laneId: "bb-a", runId: "run-1", startedAt: DOC.evaluatedAt, approvedBy: "TEST" });
  const ev = [head, ...prepareLane([head], { date: DATE, at: DOC.evaluatedAt, selection: SEL, file: "t", docSha256: DOC.contentSha256 }).events];
  const p = priceForCard(laneState(ev).open.cardEvent.card, snapshot);
  const r = priceLane(ev, { date: DATE, at: snapshot.fetchedAt, price: p.price, suggestedCards: DOC, postScheduledAt: "2026-11-02T23:00:00Z" });
  assert.equal(r.action, "PAYOUT_COMPUTED", JSON.stringify(r.payout?.refusals));
  // draftkings −910 → 1010/910, −250 → 350/250: $100 × 1.10989 × 1.4 = $155.38 (floored)
  assert.deepEqual([r.payout.grossPayoutCents, r.payout.profitCents, r.payout.inputs.book, r.payout.inputs.method, r.payout.inputs.estimate], [15538, 5538, "draftkings", "LEG_PRODUCT", false]);
  assert.equal(r.payout.inputs.belowPace, true, "1.554 < 2.512: allowed, disclosed");
  const late = priceLane(ev, { date: DATE, at: snapshot.fetchedAt, price: p.price, suggestedCards: DOC, postScheduledAt: "2026-11-03T00:15:00Z" });
  assert.deepEqual(late.payout.refusals.map((x) => x.code), ["PRICE_TOO_EARLY"], "captured more than 90 min before the post");
});

test("site prices: encrypted envelope bound to the lane, decrypts to the payout; the plain projection still has no price", async () => {
  const { snapshot } = await run();
  const head = runStarted({ laneId: "bb-a", runId: "run-1", startedAt: DOC.evaluatedAt, approvedBy: "TEST" });
  const ev0 = [head, ...prepareLane([head], { date: DATE, at: DOC.evaluatedAt, selection: SEL, file: "t", docSha256: DOC.contentSha256 }).events];
  const p = priceForCard(laneState(ev0).open.cardEvent.card, snapshot);
  const ev = [...ev0, ...priceLane(ev0, { date: DATE, at: snapshot.fetchedAt, price: p.price, suggestedCards: DOC, postScheduledAt: "2026-11-02T23:00:00Z" }).events];
  const key = Buffer.alloc(32, 7);
  const env = encryptLanePriceDisplay("bb-a", [ev], key);
  assert.equal(env, encryptLanePriceDisplay("bb-a", [ev], key), "deterministic");
  assert.doesNotMatch(env, /draftkings|-910|15538/);
  const d = readLanePriceDisplay("bb-a", env, key);
  assert.deepEqual([d.runs[0].days[0].book, d.runs[0].days[0].grossPayoutCents, d.runs[0].days[0].legs.map((l) => l.price)], ["draftkings", 15538, [-910, -250]]);
  assert.equal(readLanePriceDisplay("bb-a", env, Buffer.alloc(32, 8)), null, "another key: not available");
  assert.throws(() => readLanePriceDisplay("bb-b", env, key), /identity/);
  assert.doesNotMatch(serializeProjection(laneProjection("bb-a", [ev])), /draftkings|-910|15538|the-odds-api/, "plain public JSON stays price-free");
  assert.deepEqual(lanePriceDisplay("bb-a", [ev]), d);
});

test("CLI: lanes-price prices open cards from a private snapshot (no call), all legs one book", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lanes-price-"));
  const cards = path.join(root, "cards.json"); fs.writeFileSync(cards, JSON.stringify(DOC));
  const { snapshot } = await run();
  const snap = path.join(root, "snap.json"); fs.writeFileSync(snap, JSON.stringify(snapshot));
  const cli = (name, args) => spawnSync("npx", ["tsx", path.join(APP, "scripts/challenge-lanes", `lanes-${name}.mjs`), ...args], { cwd: APP, encoding: "utf8" });
  assert.equal(cli("prepare", ["--root", root, "--date", DATE, "--cards", cards, "--approved-by", "TEST"]).status, 0);
  const r = cli("price", ["--root", root, "--date", DATE, "--snapshot", snap, "--post-at", "2026-11-02T23:00:00Z", "--cards", cards]);
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(r.stdout);
  assert.deepEqual([rep.lanes["bb-a"].action, rep.lanes["bb-a"].book], ["PAYOUT_COMPUTED", "draftkings"]);
  assert.match(rep.lanes["bb-b"].reason, /^NO_PRICE_FOR_GAME/, "a lane whose games are not in the snapshot stays open, unpriced");
  assert.ok(!r.stdout.includes("15538"), "totals are never printed");
  const ev = parseEvents(fs.readFileSync(path.join(root, "bb-a", "run-1.jsonl"), "utf8"));
  assert.ok(verifyChain(ev).ok);
  assert.deepEqual(ev.slice(-3).map((e) => e.type), ["PRICE_VERIFIED", "STAKE_SET", "PAYOUT_COMPUTED"]);
  fs.rmSync(root, { recursive: true, force: true });
});
