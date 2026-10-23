/**
 * NBA game-winner tiers, §9 step 2: the real display accessor (sports/nba/elo-win-probability.mjs) → the rule → the
 * Parlay Center block → the record. The lane day is REAL; its switch-ON Elo field is built with the display's OWN
 * publisher (laneEloWinProbability) from the REAL frozen receipts, so every probability here is the receipt's exact
 * stored number. Run: npx tsx --test src/lib/products/level-a/nba-game-winner-step2.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";

import { ELO_WIN_PROBABILITY_LABEL, eloWinProbabilityOf, eloWinProbabilityText, laneEloWinProbability } from "../../sports/nba/elo-win-probability.mjs";
import { nbaGameWinnerDisplay } from "./nba-game-winner-source.mjs";
import { NBA_GW_POLICY, NBA_GAME_WINNER_TIERS_PUBLIC } from "./nba-game-winner-tiers.mjs";
import { NBA_GW_LEG_NOTE, buildLevelAModel, LEVEL_A_SERVED_SCHEMA, modelSha256 } from "./model.mjs";
import { recordEntries } from "./record.mjs";
import { jointShownFor } from "./suggestions.mjs";
import { PAGE_FOR, verifyServed } from "../../../../scripts/products/record-level-a-from-deployment.mjs";

globalThis.React = React;
const { default: LevelASuggestions } = await import("../../../components/products/level-a-suggestions.tsx");
const REPO = path.resolve(process.cwd(), "..");
const laneDir = path.join(REPO, "app/public/data/nba/experimental-public");
const DAY = fs.readdirSync(laneDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1).slice(0, 10);
const LANE = JSON.parse(fs.readFileSync(path.join(laneDir, `${DAY}.json`), "utf8"));
const RECEIPTS = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nba/experimental-v0.1/forecasts", `${DAY}.json`), "utf8"));
const SRC = new Map(RECEIPTS.games.map((g) => [String(g.providerEventId), g]));
/** The lane as the display's publisher writes it with its switch ON (real receipts, its own function). */
const LANE_ON = { ...LANE, games: LANE.games.map((g) => { const s = SRC.get(String(g.providerEventId)); const wp = s ? laneEloWinProbability(s.forecast, s.receipt) : null; return wp ? { ...g, elo: { ...g.elo, winProbability: wp } } : g; }) };
const CTX_ON = { enabled: true, graded: 0, minN: 0, disclosure: "DISPLAY DISCLOSURE (a real build prints the context text)" };
const CTX_OFF = { enabled: false, graded: 0, minN: 0, disclosure: "off" };
const NOW = new Date(Date.parse(`${DAY}T12:00:00Z`) - 3600_000).toISOString();
const on = () => ({ enabled: true, display: nbaGameWinnerDisplay({ repoRoot: REPO, date: DAY, ctx: CTX_ON, lane: LANE_ON }) });
const MODEL_ON = buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, nbaGameWinners: on() });
const viewOf = (eventId) => eloWinProbabilityOf(LANE_ON.games.find((g) => String(g.providerEventId) === String(eventId)), { enabled: true });

test("the real day exercises the rule: published Elo fields for most games, and at least one tiered NBA card", () => {
  assert.ok(LANE_ON.games.filter((g) => g.elo?.winProbability).length >= 5, `${DAY}`);
  assert.ok(MODEL_ON.nbaGameWinners?.public === true);
  assert.ok(MODEL_ON.nbaGameWinners.tiers.some((t) => t.card), JSON.stringify(MODEL_ON.nbaGameWinners.tiers.map((t) => t.reason)));
});

test("ADAPTER: the receipt's exact p for the joint, the display's own text for the shown %, its label constant", () => {
  const d = nbaGameWinnerDisplay({ repoRoot: REPO, date: DAY, ctx: CTX_ON, lane: LANE_ON });
  for (const g of LANE_ON.games) {
    const p = d.accessor(g.providerEventId);
    const v = viewOf(g.providerEventId);
    if (!v) { assert.equal(p, null); continue; }
    assert.ok(Object.is(p.pHome, SRC.get(String(g.providerEventId)).forecast.elo.pHome), "exactly the receipt's stored number");
    assert.deepEqual(p.shown, { home: `${v.homePct}%`, away: `${v.awayPct}%` });
    assert.ok(Object.is(p.label, ELO_WIN_PROBABILITY_LABEL), "the display's constant itself (it carries U+2019)");
    assert.equal(p.payloadSha256, g.receipt.payloadSha256);
    assert.equal(p.frozenAt, g.frozenAt);
    assert.deepEqual(d.receiptOf(g.providerEventId), g.receipt);
  }
  const off = nbaGameWinnerDisplay({ repoRoot: REPO, date: DAY, ctx: CTX_OFF, lane: LANE_ON });
  assert.equal(off.enabled, false);
  assert.ok(LANE_ON.games.every((g) => off.accessor(g.providerEventId) === null), "the display's switch OFF: no probability for any game");
  assert.equal(nbaGameWinnerDisplay({ repoRoot: REPO, date: DAY, ctx: CTX_ON, lane: LANE }).accessor(LANE.games[0].providerEventId), null, "a lane published without the field: nothing");
  const src = fs.readFileSync(path.resolve(process.cwd(), "src/lib/products/level-a/nba-game-winner-source.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(src, /eloWinProbabilityOf\(g, \{ enabled: c\.enabled \}\)/, "the display's own switch, never a literal true");
  assert.doesNotMatch(src, /enabled: true/);
});

test("CARDS: joint = product of the receipts' exact p; each shown leg % is the display's text; joint is Level A's text", () => {
  for (const t of MODEL_ON.nbaGameWinners.tiers) if (t.card) {
    const exact = t.card.legs.map((l) => { const s = SRC.get(String(l.eventId)).forecast.elo; return l.selection.code === "home" ? s.pHome : 1 - s.pHome; });
    assert.ok(Object.is(t.card.jointProbability, exact.reduce((a, b) => a * b, 1)), "never multiplied back up from a % string");
    for (const l of t.card.legs) {
      const v = viewOf(l.eventId);
      assert.equal(l.shownPct, `${l.selection.code === "home" ? v.homePct : v.awayPct}%`);
      assert.ok(eloWinProbabilityText(v).includes(`${l.selection.code === "home" ? v.homeAbbr : v.awayAbbr} ${l.shownPct}`), "the leg reads exactly like every other surface");
      assert.ok(Object.is(l.label, ELO_WIN_PROBABILITY_LABEL));
    }
    assert.equal(t.card.disclosure, CTX_ON.disclosure);
    assert.equal(t.card.policy, NBA_GW_POLICY);
    assert.deepEqual([t.card.priced, t.card.price, t.card.payout], [false, null, null]);
  }
});

test("SWITCHES: this rule OFF, or the display OFF, leaves the model byte-identical (no key, no note changed)", () => {
  assert.equal(NBA_GAME_WINNER_TIERS_PUBLIC, false);
  const base = JSON.stringify(buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY }));
  assert.equal(JSON.stringify(buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, nbaGameWinners: { enabled: false, display: on().display } })), base);
  assert.equal(JSON.stringify(buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, nbaGameWinners: { enabled: true, display: nbaGameWinnerDisplay({ repoRoot: REPO, date: DAY, ctx: CTX_OFF, lane: LANE_ON }) } })), base, "display OFF removes every tier with no other change");
  assert.equal("nbaGameWinners" in JSON.parse(base), false);
});

test("NOTE: with both on, a side that can appear in an NBA card no longer says it does not tier", () => {
  const inBlock = new Set(MODEL_ON.nbaGameWinners.legs.map((l) => String(l.eventId)));
  for (const l of MODEL_ON.untiered.filter((x) => x.sport === "nba")) {
    if (inBlock.has(String(l.eventId))) assert.equal(l.probabilityNote, NBA_GW_LEG_NOTE);
    else assert.notEqual(l.probabilityNote, NBA_GW_LEG_NOTE);
  }
});

test("RENDER: Parlay Center only; the display's % text and the disclosure once; the recorder verifies the block", () => {
  const render = (mode) => renderToString(React.createElement(LevelASuggestions, { model: MODEL_ON, mode }));
  const lab = render("parlay-lab");
  const text = lab.replace(/<!-- -->/g, "");
  assert.match(text, /NBA game winners/);
  for (const t of MODEL_ON.nbaGameWinners.tiers) if (t.card) {
    assert.ok(text.includes(`model joint probability ${jointShownFor(t.card.jointProbability, t.card.tier)}`));
    for (const l of t.card.legs) assert.ok(text.includes(`${ELO_WIN_PROBABILITY_LABEL}: ${l.shownPct}`), l.eventId);
  }
  assert.equal(text.split(CTX_ON.disclosure).length - 1, 1, "the disclosure once per block");
  assert.match(lab, /id="level-a-nba-game-winners"/);
  for (const mode of ["bank-builder", "moonshot"]) assert.doesNotMatch(render(mode), /id="level-a-nba-game-winners"|aria-label="NBA game winners/, `${mode}: the block is not in Bank Builder or Moonshot`);
  assert.match(NBA_GW_LEG_NOTE, /on the Parlay Center\.$/, "the note names where the cards are, so it is true on every page it appears on");
  const served = { schema: LEVEL_A_SERVED_SCHEMA, public: true, asOf: NOW, productDay: DAY, modelSha256: modelSha256(MODEL_ON), model: { ...MODEL_ON, asOf: NOW } };
  served.modelSha256 = modelSha256(served.model);
  const pages = { [PAGE_FOR["parlay-lab"]]: lab, [PAGE_FOR["bank-builder"]]: render("bank-builder"), [PAGE_FOR.moonshot]: render("moonshot") };
  assert.deepEqual(verifyServed({ sha: "a".repeat(40), buildInfo: { builtAt: NOW, commit: { sha: "a".repeat(40) } }, served, pages }), { ok: true, problems: [] });
});

test("RECORD: tiered NBA cards are recorded only while public; never with the switch OFF", () => {
  const rows = recordEntries(MODEL_ON, { recordedAt: NOW });
  const nba = rows.filter((r) => r.policy === NBA_GW_POLICY);
  assert.equal(nba.length, MODEL_ON.nbaGameWinners.tiers.filter((t) => t.card).length);
  for (const r of nba) assert.ok(r.legs.every((l) => l.sport === "nba" && typeof l.probability === "number"));
  assert.equal(recordEntries({ ...MODEL_ON, nbaGameWinners: { ...MODEL_ON.nbaGameWinners, public: false } }, { recordedAt: NOW }).filter((r) => r.policy === NBA_GW_POLICY).length, 0);
  assert.equal(recordEntries(buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY }), { recordedAt: NOW }).filter((r) => r.policy === NBA_GW_POLICY).length, 0, "the committed default (switch OFF) records none");
});

test("TOO_CLOSE: a game with no favoured side has no leg, even with a published 50/50", () => {
  const g0 = LANE_ON.games.find((g) => g.elo?.winProbability);
  const close = { ...LANE_ON, games: LANE_ON.games.map((g) => (g === g0 ? { ...g, elo: { ...g.elo, state: "TOO_CLOSE", favoured: null, winProbability: { ...g.elo.winProbability, home: 0.5, away: 0.5 } } } : g)) };
  const d = nbaGameWinnerDisplay({ repoRoot: REPO, date: DAY, ctx: CTX_ON, lane: close });
  assert.ok(d.accessor(g0.providerEventId), "the display shows its 50/50");
  const m = buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, nbaGameWinners: { enabled: true, display: d } });
  /* The committed lane still names a side for this game, but a 50/50 view has no favourite: the leg is refused
     (SIDE_DISAGREES, p must be strictly above 0.5), never tiered at a coin flip. */
  assert.ok(!m.nbaGameWinners.legs.some((l) => String(l.eventId) === String(g0.providerEventId)));
  assert.ok(m.nbaGameWinners.untiered.some((u) => String(u.leg.eventId) === String(g0.providerEventId) && u.code === "SIDE_DISAGREES"));
});

test("COPY: the required phrases, and no word that reads as a priced parlay, a guarantee or a validated prop", async () => {
  const { nbaGameWinnerCopyText } = await import("./nba-game-winner-tiers.mjs");
  const lab = renderToString(React.createElement(LevelASuggestions, { model: MODEL_ON, mode: "parlay-lab" })).replace(/<!-- -->/g, "");
  const start = lab.indexOf('id="level-a-nba-game-winners"');
  const block = lab.slice(start, lab.indexOf("</section>", start)); // the NBA block only (it holds no nested section)
  for (const t of MODEL_ON.nbaGameWinners.tiers) if (t.card) {
    const copy = nbaGameWinnerCopyText(t.card);
    for (const text of [block, copy]) {
      assert.match(text, /[Mm]odel joint probability/);
      assert.match(text, /[Aa]ssumes the games are independent/);
      assert.match(text, /No sportsbook price\. Settles on the official final\./);
      assert.ok(text.includes(ELO_WIN_PROBABILITY_LABEL.replace(/'/g, "&#x27;")) || text.includes(ELO_WIN_PROBABILITY_LABEL), "the display's label");
      /* The display's own disclosure is quoted verbatim and may negate words ("not a betting recommendation"); the
         rule's OWN words are checked without it. */
      const own = text.split(CTX_ON.disclosure).join("");
      assert.doesNotMatch(own, /\bparlays?\b|guarantee|\block\b|validated|sure thing|\bodds\b|payout of|\$\d|\bbet\b|wager/i);
      /* Founder wording: the Elo number is an "Elo-derived game-winner estimate", never a probability. Only OUR joint is a
         "model joint probability". */
      assert.doesNotMatch(own.replace(/[Mm]odel joint probability/g, ""), /probability/i, "the rule's own words never call the Elo number a probability");
    }
  }
});

test("EVIDENCE SCRIPT (§7): per-leg equality, expected cards, band sweep and switch-OFF identity for a real day", async () => {
  const { evidence } = await import("../../../../scripts/products/nba-game-winner-evidence.mjs");
  const e = evidence({ day: DAY, now: NOW, simulateDisplay: true, repoRoot: REPO });
  assert.equal(e.ok, true);
  assert.match(e.display, /^SIMULATED/, "a pre-switch run says so");
  for (const l of e.legs.filter((x) => x.displayPHome != null)) assert.deepEqual([l.pEqual, l.shaEqual, l.frozenAtEqual], [true, true, true], l.eventId);
  assert.deepEqual(e.cards.map((c) => c.tier), ["low", "medium", "high", "longshot"]);
  for (const c of e.cards) if (!c.empty) assert.equal(c.jointShown, jointShownFor(c.jointExact, c.tier));
  assert.deepEqual(e.bandSweep.misbanded, []);
  assert.equal(e.switchOffModelIdentical, true);
  assert.deepEqual(e.cards, MODEL_ON.nbaGameWinners.tiers.map((t) => (t.card ? { tier: t.tier, label: t.tierLabel, legs: t.card.legs.map((l) => `${l.selection.label.replace(" (official side)", "")} ${l.shownPct} (${l.eventLabel})`), jointExact: t.card.jointProbability, jointShown: jointShownFor(t.card.jointProbability, t.card.tier) } : { tier: t.tier, label: t.tierLabel, empty: t.reason })), "the prediction is the model the pages render");
  assert.match(fs.readFileSync(path.resolve(process.cwd(), "scripts/products/nba-game-winner-evidence.mjs"), "utf8"), /READ-ONLY, OFFLINE/);
});

test("GRADER: a recorded nba-game-winner-tiers@1 entry grades through the NBA settlement contract on committed finals", async () => {
  const { gradeEntry } = await import("./grade.mjs");
  const { committedFinals } = await import("../../../../scripts/products/grade-level-a-suggestions.mjs");
  const finals = committedFinals({ repoRoot: REPO, nowIso: NOW });
  /* A REAL final (BOS @ DET, 2026-10-20) in an entry shaped exactly like recordEntries writes for this policy. */
  const leg = (code) => ({ sport: "nba", eventId: "401909088", market: "winner", selection: { code, label: code }, probability: 0.6, startUtc: "2026-10-20T23:00Z" });
  const results = ["home", "away"].map((code) => gradeEntry({ id: `x-${code}`, policy: NBA_GW_POLICY, tier: "low", productDay: "2026-10-20", legs: [leg(code)] }, finals).result).sort();
  assert.deepEqual(results, ["loss", "win"], "exactly one side of a finished game wins");
  const pending = gradeEntry({ id: "p", policy: NBA_GW_POLICY, tier: "low", productDay: DAY, legs: [leg("home"), { ...leg("home"), eventId: "409999999" }] }, finals);
  assert.ok(["pending", "loss"].includes(pending.result), "an unfinished leg is pending, never a loss on its own");
});
