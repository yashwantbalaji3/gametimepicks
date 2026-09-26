/**
 * THE LIVE-MARKET TRUTH CONTRACT, AND THE PROBE THAT SPENDS ON IT (Phase H).
 *
 * Run: npx tsx --test src/lib/sports/odds/live-market-contract.test.mjs
 *
 * The founder authorized ONE 3-credit probe, during a genuinely live NFL game, for team markets
 * only, with a 90-credit pilot budget behind it. Four numbers and one adjective, each of which is a
 * control here rather than a sentence someone has to remember.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { IN_PLAY_TEAM_MARKETS, eventIsGenuinelyLive, gradeLiveMarketEvidence, linesOf } from "./live-market-contract.mjs";
import { inPlayAuthorization, purposeBudget, spentOnPurpose, supersededBy } from "./p171-authorization.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const RECEIPTS_DIR = path.join(ROOT, "docs/receipts");
const CORPUS = Object.fromEntries(fs.readdirSync(RECEIPTS_DIR).filter((f) => f.endsWith(".md")).map((f) => [f, fs.readFileSync(path.join(RECEIPTS_DIR, f), "utf8")]));
/* The receipt that actually governs NFL spend — NOT P171, which it replaced. */
const RECEIPT = CORPUS["ODDS_AUTHORIZATION_NFL_2026.md"];
const PROBE_SRC = fs.readFileSync(path.resolve(process.cwd(), "scripts/nfl/probe-nfl-live-odds.mjs"), "utf8");

const KICK = "2026-09-27T17:00:00Z";
const AFTER = "2026-09-27T19:30:00Z";

const book = (over = {}) => ({
  key: "draftkings", title: "DraftKings", last_update: "2026-09-27T19:29:00Z",
  markets: [{ key: "spreads", outcomes: [{ name: "Buffalo Bills", point: -3.5, price: -110 }, { name: "Los Angeles Chargers", point: 3.5, price: -110 }] }],
  ...over,
});
const event = (over = {}) => ({
  id: "odds-evt-1", commence_time: KICK,
  home_team: "Buffalo Bills", away_team: "Los Angeles Chargers",
  bookmakers: [book()],
  ...over,
});

/* ── IS IT GENUINELY LIVE — decided BEFORE the credit ──────────────────────────────────────────── */

test("⚠ A PREGAME SLATE IS NOT A LIVE GAME, whatever the feed says", () => {
  // Kickoff in the future: refused even if a feed claims LIVE. Two sources, and they must agree.
  assert.equal(eventIsGenuinelyLive({ liveState: "LIVE", kickoffUtc: "2026-09-27T17:00Z", nowIso: "2026-09-26T06:00:00Z" }).live, false);
  assert.match(eventIsGenuinelyLive({ liveState: "LIVE", kickoffUtc: "2026-09-27T17:00Z", nowIso: "2026-09-26T06:00:00Z" }).reason, /in the future/);

  // Kickoff passed but the feed says PRE: still refused. A clock alone is not evidence of play.
  for (const state of ["PRE", "FINAL", "POSTPONED", "CANCELLED", "UNKNOWN", null]) {
    assert.equal(eventIsGenuinelyLive({ liveState: state, kickoffUtc: KICK, nowIso: AFTER }).live, false, `${state} must not read as live`);
  }

  // Both agree: live.
  for (const state of ["LIVE", "DELAYED"]) {
    const v = eventIsGenuinelyLive({ liveState: state, kickoffUtc: KICK, nowIso: AFTER });
    assert.equal(v.live, true, state);
    assert.equal(v.minutesSinceKickoff, 150);
  }

  // Unreadable inputs refuse rather than default.
  assert.equal(eventIsGenuinelyLive({ liveState: "LIVE", kickoffUtc: "nonsense", nowIso: AFTER }).live, false);
  assert.equal(eventIsGenuinelyLive({ liveState: "LIVE", kickoffUtc: KICK, nowIso: "nonsense" }).live, false);
});

/* ── THE SIX-PART CONTRACT ─────────────────────────────────────────────────────────────────────── */

test("a genuine in-play response passes, with its movement recorded", () => {
  const pregame = event({ bookmakers: [book({ markets: [{ key: "spreads", outcomes: [{ name: "Buffalo Bills", point: -6.5, price: -110 }, { name: "Los Angeles Chargers", point: 6.5, price: -110 }] }] })] });
  const g = gradeLiveMarketEvidence({ providerEvent: event(), pregame, capturedAt: AFTER, kickoffUtc: KICK });

  assert.equal(g.ok, true, `expected a pass, failed: ${g.failed.join(", ")}`);
  assert.deepEqual(g.marketKeys, ["spreads"]);
  assert.equal(g.books[0].key, "draftkings");
  assert.equal(g.moved.length, 2, "both sides of the spread moved");
  assert.deepEqual(g.moved[0], { key: "draftkings|spreads|Buffalo Bills", pregame: -6.5, live: -3.5 });
});

test("⚠ AN UNCHANGED LINE WITH NO FRESHNESS STAMP IS A REPLAYED SNAPSHOT, NOT A LIVE MARKET", () => {
  /*
   * The check the whole probe exists for. A feed that has stopped updating a started game does not
   * announce it: the event is in progress, the payload is well-formed, a book is named, and the
   * commence_time is in the past. Every superficial signal of liveness is present.
   */
  const stale = event({ bookmakers: [book({ last_update: "2026-09-27T16:40:00Z" })] });   // BEFORE kickoff
  const identicalPregame = event({ bookmakers: [book({ last_update: "2026-09-27T16:40:00Z" })] });
  const g = gradeLiveMarketEvidence({ providerEvent: stale, pregame: identicalPregame, capturedAt: AFTER, kickoffUtc: KICK });

  assert.equal(g.ok, false);
  assert.ok(g.failed.includes("notPregameReplay"));
  const c = g.checks.find((x) => x.id === "notPregameReplay");
  assert.match(c.detail, /identical to the pregame capture/);

  // Everything ELSE about it looked fine — which is precisely why this check has to exist.
  for (const id of ["eventInProgress", "capturePostKickoff", "sportsbookAttribution", "marketIdentity"]) {
    assert.equal(g.checks.find((x) => x.id === id).pass, true, `${id} passed — the response looks live`);
  }
});

test("a post-kickoff last_update proves freshness when no comparable pregame line exists", () => {
  const g = gradeLiveMarketEvidence({ providerEvent: event(), pregame: null, capturedAt: AFTER, kickoffUtc: KICK });
  assert.equal(g.ok, true, `failed: ${g.failed.join(", ")}`);
  assert.match(g.checks.find((x) => x.id === "notPregameReplay").detail, /last_update after kickoff/);
});

test("⚠ NO PREGAME LINE AND NO FRESHNESS STAMP FAILS — absence is not a pass", () => {
  const g = gradeLiveMarketEvidence({
    providerEvent: event({ bookmakers: [book({ last_update: null })] }),
    pregame: null, capturedAt: AFTER, kickoffUtc: KICK,
  });
  assert.equal(g.ok, false);
  assert.match(g.checks.find((x) => x.id === "notPregameReplay").detail, /freshness is unproven/);
});

test("an unnamed book, a missing market, or an unauthorized market each fail on their own terms", () => {
  const noBook = gradeLiveMarketEvidence({ providerEvent: event({ bookmakers: [{ markets: [] }] }), pregame: null, capturedAt: AFTER, kickoffUtc: KICK });
  assert.ok(noBook.failed.includes("sportsbookAttribution"), "an aggregate with no named book is not attribution");

  // A prop ALONE: there is no authorized market at all.
  const propOnly = gradeLiveMarketEvidence({
    providerEvent: event({ bookmakers: [book({ markets: [{ key: "player_pass_yds", outcomes: [{ name: "Over", point: 250.5, price: -110 }] }] })] }),
    pregame: null, capturedAt: AFTER, kickoffUtc: KICK,
  });
  assert.ok(propOnly.failed.includes("marketIdentity"), "a prop market must never be accepted in this phase");
  assert.match(propOnly.checks.find((x) => x.id === "marketIdentity").detail, /no authorized team market returned/);

  /*
   * A prop SMUGGLED IN BESIDE a legitimate spread is the more dangerous shape: the response is
   * otherwise exactly what we asked for, so a check that only looked for "at least one authorized
   * market" would wave it through and we would hold prop pricing we are not authorized to buy.
   */
  const propSmuggled = gradeLiveMarketEvidence({
    providerEvent: event({ bookmakers: [book({ markets: [
      { key: "spreads", outcomes: [{ name: "Buffalo Bills", point: -3.5, price: -110 }] },
      { key: "player_pass_yds", outcomes: [{ name: "Over", point: 250.5, price: -110 }] },
    ] })] }),
    pregame: null, capturedAt: AFTER, kickoffUtc: KICK,
  });
  assert.ok(propSmuggled.failed.includes("marketIdentity"), "an authorized market alongside an unauthorized one is still a refusal");
  assert.match(propSmuggled.checks.find((x) => x.id === "marketIdentity").detail, /unauthorized markets: player_pass_yds/);
});

test("a pregame commence_time or a pre-kickoff capture fails the first two checks", () => {
  const future = gradeLiveMarketEvidence({ providerEvent: event({ commence_time: "2026-09-27T21:00:00Z" }), pregame: null, capturedAt: AFTER, kickoffUtc: KICK });
  assert.ok(future.failed.includes("eventInProgress"));

  const early = gradeLiveMarketEvidence({ providerEvent: event(), pregame: null, capturedAt: "2026-09-27T16:00:00Z", kickoffUtc: KICK });
  assert.ok(early.failed.includes("capturePostKickoff"));
});

test("lines are keyed by BOOK as well as market — two books disagreeing is not one book moving", () => {
  const two = event({ bookmakers: [book(), book({ key: "fanduel", title: "FanDuel", markets: [{ key: "spreads", outcomes: [{ name: "Buffalo Bills", point: -4.5, price: -110 }] }] })] });
  const lines = linesOf(two);
  assert.equal(lines.get("draftkings|spreads|Buffalo Bills"), -3.5);
  assert.equal(lines.get("fanduel|spreads|Buffalo Bills"), -4.5);

  // A moneyline's VALUE is its price; a spread's is its point.
  const ml = linesOf(event({ bookmakers: [book({ markets: [{ key: "h2h", outcomes: [{ name: "Buffalo Bills", price: -180 }] }] })] }));
  assert.equal(ml.get("draftkings|h2h|Buffalo Bills"), -180);
});

/* ── THE AUTHORIZATION IS A CONTROL, NOT A SENTENCE ────────────────────────────────────────────── */

test("⚠ IN-PLAY AUTHORIZATION IS PARSED FROM THE RECEIPT AND FAILS CLOSED", () => {
  /*
   * This module has made the same mistake twice: the expiry term went unread for two programs, and
   * the Markets row was "documentation wearing the costume of a control" until 2026-09-24.
   * `assertCallAllowed` still checks only the ceiling, so the permitted-purposes row was the third
   * of the same kind. In-play is the first purpose added since, and it gets a real control.
   */
  const live = inPlayAuthorization(RECEIPT);
  assert.equal(live.authorized, true, "the committed amendment authorizes in-play capture");
  assert.deepEqual(live.markets, ["h2h", "spreads", "totals"]);
  assert.equal(live.propsAuthorized, false, "props are refused in this phase, by the receipt");

  // Absent, empty, or NO ⇒ refused. A receipt that authorizes nothing must not read as one that
  // authorizes everything.
  for (const md of ["", "no such row", "| In-play capture authorized | NO |", "| In-play capture authorized | YES |"]) {
    assert.equal(inPlayAuthorization(md).authorized, false, JSON.stringify(md.slice(0, 40)));
  }
  // Prose mentioning in-play elsewhere cannot widen it.
  assert.equal(inPlayAuthorization("we discussed in-play capture of `h2h` at length and said YES eventually").authorized, false);
});

test("⚠ THE 90-CREDIT PHASE H BUDGET IS ENFORCED, not remembered", () => {
  assert.equal(purposeBudget(RECEIPT), 90, "the founder's hard incremental budget");
  assert.equal(purposeBudget(""), null, "absent ⇒ null ⇒ the caller must refuse, never fall back to the 3,000 ceiling");
  assert.equal(purposeBudget("| Phase H incremental budget | unlimited |"), null, "unparseable ⇒ refuse");

  // Spend is computed from what the ledger actually recorded, not from a counter.
  const led = { requests: [
    { purpose: "phase-h in-play probe on X", creditsUsed: 3 },
    { purpose: "phase-h in-play pilot on Y", creditsUsed: 3 },
    { purpose: "bulk team ML/spread/total", creditsUsed: 3 },
  ] };
  assert.equal(spentOnPurpose(led, "phase-h in-play"), 6, "only Phase H calls count against the Phase H budget");
  assert.equal(spentOnPurpose(led, "phase-h in-play probe"), 3);
});

/* ── THE PROBE SPENDS ONCE, AND ONLY ON A LIVE GAME ────────────────────────────────────────────── */

test("⚠ THE LIVE CHECK PRECEDES THE PAID PATH — a pregame slate cannot cost a credit", () => {
  /*
   * Ordering, read as a fact about the file. `--authorized` with no live game must still spend
   * nothing, and it does because the refusal returns before the key is even read. Deciding this
   * after the call would mean the credit is gone either way.
   */
  const refusal = PROBE_SRC.indexOf("NO LIVE NFL GAME");
  const keyRead = PROBE_SRC.indexOf("classifyOddsSecret(process.env)");
  const paidCall = PROBE_SRC.indexOf("await fetch(`${BASE}${endpoint}");
  assert.ok(refusal > 0 && keyRead > 0 && paidCall > 0, "all three landmarks exist — otherwise this guard is vacuous");
  assert.ok(refusal < keyRead, "the live refusal must precede reading the key");
  assert.ok(keyRead < paidCall, "and the key check must precede the call");
});

test("⚠ ONE PROBE MEANS ONE — a recorded probe closes the script", () => {
  /* "Do not attempt repeated probes merely to obtain a favorable result" — enforced, not remembered. */
  assert.match(PROBE_SRC, /ALREADY PROBED/, "a prior probe short-circuits the run");
  assert.match(PROBE_SRC, /startsWith\(`\$\{PURPOSE_PREFIX\} probe`\)/, "detected from the ledger, whatever the verdict was");

  // Exactly one paid call site, and it is the bulk team-market endpoint.
  const paidCalls = PROBE_SRC.match(/await fetch\(`\$\{BASE\}/g) ?? [];
  assert.equal(paidCalls.length, 1, `the probe must have exactly one paid call site, found ${paidCalls.length}`);
  assert.match(PROBE_SRC, /\/sports\/\$\{SPORT_KEY\}\/odds\//, "and it is the bulk slate endpoint, which costs markets × regions once");
  assert.equal(/events\/\$\{[^}]+\}\/odds/.test(PROBE_SRC), false, "never the per-event endpoint — that is the prop shape, and props are refused");
});

test("the probe refuses a receipt that does not authorize exactly the three team markets", () => {
  assert.match(PROBE_SRC, /inPlay\.authorized/, "it reads the parsed authorization");
  assert.match(PROBE_SRC, /inPlay\.propsAuthorized/, "and refuses outright if props were ever authorized");
  assert.match(PROBE_SRC, /markets\.length !== IN_PLAY_TEAM_MARKETS\.length/, "and refuses a partial market allowance");
  assert.deepEqual(IN_PLAY_TEAM_MARKETS, ["h2h", "spreads", "totals"]);
});

test("the probe records the evidence the amendment asked for, either way", () => {
  for (const field of ["providerEventId", "matchup", "kickoffUtc", "creditsCharged", "checks", "books", "movement", "pregameSnapshotUsed"]) {
    assert.ok(PROBE_SRC.includes(field), `the verdict must record \`${field}\``);
  }
  assert.match(PROBE_SRC, /LIVE_MARKET_SUPPORTED|LIVE_MARKET_UNSUPPORTED/, "a named verdict, not a boolean");
  assert.match(PROBE_SRC, /assertNoSecretLeak\(verdict/, "and it is scanned for the key before it is written");
  assert.match(PROBE_SRC, /assertNoSecretLeak\(ledger/);
});


/* ── THE RECEIPT THAT GOVERNS ──────────────────────────────────────────────────────────────────── */

test("⚠ A SUPERSEDED RECEIPT IS DETECTED FROM THE REPLACEMENT'S OWN CLAIM", () => {
  /*
   * On 2026-09-26 a live-odds decision package was written against `ODDS_AUTHORIZATION_P171.md` and
   * reported "3,000 ceiling, 2,606 remaining" to the founder, who decided on those numbers. P171 had
   * been replaced on 2026-09-10 by `ODDS_AUTHORIZATION_NFL_2026.md` — whose own header says so — and
   * the real position was 1,160 effective with 766 remaining. Nothing was overspent, because P171's
   * lapsed expiry refuses every call anyway; the REPORTING was wrong.
   *
   * A superseded document does not announce itself at the point of use, so the fact is read off the
   * replacement rather than off the old file's silence.
   */
  assert.equal(supersededBy("ODDS_AUTHORIZATION_P171.md", CORPUS), "ODDS_AUTHORIZATION_NFL_2026.md");
  for (const current of ["ODDS_AUTHORIZATION_NFL_2026.md", "ODDS_AUTHORIZATION_UFC.md", "ODDS_AUTHORIZATION_EPL.md"]) {
    assert.equal(supersededBy(current, CORPUS), null, `${current} must read as current`);
  }
  // A file cannot supersede itself, and an empty corpus supersedes nothing.
  assert.equal(supersededBy("X.md", { "X.md": "this replaces `X.md`" }), null);
  assert.equal(supersededBy("X.md", {}), null);
});

test("the probe refuses a superseded receipt BEFORE reading its terms", () => {
  const src = PROBE_SRC;
  const refusal = src.indexOf("was superseded by");
  const parse = src.indexOf("parseSportAuthorizationReceipt(receiptMd");
  assert.ok(refusal > 0 && parse > 0, "both landmarks exist — otherwise this guard is vacuous");
  assert.ok(refusal < parse, "a replaced allowance must be refused before its ceiling is read");
  assert.match(src, /ODDS_AUTHORIZATION_NFL_2026\.md/, "and the default receipt is the operative one");
  assert.equal(/arg\("--receipt", "docs\/receipts\/ODDS_AUTHORIZATION_P171\.md"\)/.test(src), false, "P171 must not be the default");
});

test("the operative receipt's ceiling is unchanged by the Phase H amendment", () => {
  /* An amendment that buys scope must not quietly buy headroom. */
  assert.match(RECEIPT, /Effective cumulative ceiling: 1,160 credits/, "the effective ceiling term");
  assert.match(RECEIPT, /## AMENDMENT 3 — 2026-09-26/, "the Phase H amendment is in the governing document");
  assert.match(RECEIPT, /1,160 credits — UNCHANGED/, "and states plainly that it bought scope, not headroom");
});

/* ── THE BOUNDED PILOT, AND ITS OWNER ──────────────────────────────────────────────────────────── */

const PILOT_SRC = fs.readFileSync(path.resolve(process.cwd(), "scripts/nfl/capture-nfl-live-odds.mjs"), "utf8");
const WORKFLOW = fs.readFileSync(path.join(ROOT, ".github/workflows/nfl-live-props.yml"), "utf8");

test("⚠ THE PILOT CANNOT START UNTIL THE PROBE HAS PASSED", () => {
  /*
   * "only if the 3-credit probe proves that the provider is actually returning valid post-kickoff
   * market movement" — a precondition read from the committed verdict, not from memory. Verified by
   * running it: no verdict file refuses, a failed verdict closes the lane, and neither spends.
   */
  const verdictRead = PILOT_SRC.indexOf("const probe = read(VERDICT_PATH)");
  const paidCall = PILOT_SRC.indexOf("await fetch(`${BASE}${endpoint}");
  assert.ok(verdictRead > 0 && paidCall > 0, "both landmarks exist — otherwise this guard is vacuous");
  assert.ok(verdictRead < paidCall, "the probe's verdict must be read before anything is bought");

  assert.match(PILOT_SRC, /NOT STARTED: no probe verdict on disk/, "an absent verdict refuses");
  assert.match(PILOT_SRC, /probe\.verdict !== "LIVE_MARKET_SUPPORTED"/, "and anything other than a pass closes the lane");
  assert.match(PILOT_SRC, /forbids spending further to obtain a better answer/, "stated where a reader will meet it");
});

test("⚠ THREE BOUNDS, ALL ON THE LEDGER RATHER THAN ON THE SCHEDULE", () => {
  /*
   * The workflow hosting this runs every FIFTEEN minutes and the founder authorized a THIRTY-minute
   * cadence. Sizing the spend by how often the cron is supposed to fire would be sizing it by a
   * number this repository has measured to be wrong by up to five hours, so each bound is checked
   * against what was actually recorded.
   */
  assert.match(PILOT_SRC, /spent \+ WORST_CASE > budget/, "the 90-credit Phase H budget");
  assert.match(PILOT_SRC, /assertCallAllowed\(/, "the receipt's cumulative ceiling");
  assert.match(PILOT_SRC, /gap < MIN_INTERVAL_MS/, "and the interval, against the LAST RECORDED CALL");
  assert.match(PILOT_SRC, /MIN_INTERVAL_MS = 28 \* 60_000/, "~30 minutes with slack for cron jitter");

  // The budget is summed from the ledger's own records for this purpose, not from a counter.
  assert.match(PILOT_SRC, /spentOnPurpose\(ledger, PURPOSE_PREFIX\)/);
  // And exactly one paid call site, on the bulk endpoint — never per-event, which is the prop shape.
  assert.equal((PILOT_SRC.match(/await fetch\(`\$\{BASE\}/g) ?? []).length, 1);
  assert.equal(/events\/\$\{[^}]+\}\/odds/.test(PILOT_SRC), false, "never the per-event endpoint");
});

test("a terminal game leaves the loop — the slate empties itself", () => {
  /* `eventIsGenuinelyLive` already refuses FINAL, so the last capture of the day costs nothing. */
  assert.equal(eventIsGenuinelyLive({ liveState: "FINAL", kickoffUtc: KICK, nowIso: AFTER }).live, false);
  assert.match(PILOT_SRC, /eventIsGenuinelyLive\(/, "the pilot uses that same predicate");
  assert.match(PILOT_SRC, /no NFL game in play/, "and says so rather than calling");
});

test("⚠ WHAT THE PILOT WRITES IS A THIRD LAYER, NOT THE FROZEN LINE", () => {
  /*
   * The receipt requires three things kept apart. This artifact is the CURRENT sportsbook market,
   * stamped with its own capture instant and the book's own last_update. It must say which layer it
   * is, because a consumer rendering it where "the line you were shown before kickoff" is claimed
   * would merge two of them.
   */
  assert.match(PILOT_SRC, /layer: "CURRENT_SPORTSBOOK_MARKET"/, "the artifact names its own layer");
  assert.match(PILOT_SRC, /NOT the frozen pregame line, and not a GameTimePicks forecast/, "and says so in its disclaimer");
  assert.match(PILOT_SRC, /lastUpdate: b\.last_update/, "the provider's own freshness stamp, never inferred");

  // It must not write anywhere the frozen pregame block lives.
  for (const frozenPath of ["player-board", "live-props/", "forecasts", "markets/latest"]) {
    assert.equal(new RegExp(`writeFileSync[^;]*${frozenPath}`).test(PILOT_SRC), false, `the pilot must never write ${frozenPath}`);
  }
  assert.match(PILOT_SRC, /live-markets/, "it writes its own directory");
});

test("⚠ BOTH PHASE H WRITERS HAVE A SCHEDULED OWNER AND ARE COMMITTED BY IT", () => {
  /*
   * A writer with no owner is an artifact that is built and never published, and a writer whose
   * output is outside its job's commit allowlist is the same thing with extra steps. This repository
   * has lost three days of a research archive to exactly that.
   */
  assert.match(WORKFLOW, /probe-nfl-live-odds\.mjs/, "the probe runs on a schedule");
  assert.match(WORKFLOW, /capture-nfl-live-odds\.mjs/, "and so does the pilot");
  assert.match(WORKFLOW, /data\/internal\/research\/odds\/nfl\//, "the verdict and credit ledger are committed");
  assert.match(WORKFLOW, /app\/public\/data\/nfl\/live-markets\//, "and so is the current-market artifact");
  assert.match(WORKFLOW, /ODDS_API_KEY: \$\{\{ secrets\.ODDS_API_KEY \}\}/, "both are given the key they need");
  assert.match(WORKFLOW, /schedule:/, "the job itself is scheduled");
});
