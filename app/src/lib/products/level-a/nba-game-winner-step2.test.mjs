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
import { NBA_GW_POLICY, NBA_GW_POLICIES, NBA_GAME_WINNER_TIERS_PUBLIC, nbaGameWinnerCardKey, recordableNbaGameWinnerCards } from "./nba-game-winner-tiers.mjs";
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
  const noField = { ...LANE, games: LANE.games.map((g) => { const { winProbability, ...elo } = g.elo ?? {}; return { ...g, elo }; }) };
  assert.equal(nbaGameWinnerDisplay({ repoRoot: REPO, date: DAY, ctx: CTX_ON, lane: noField }).accessor(LANE.games[0].providerEventId), null, "a lane published without the field: nothing");
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
    assert.equal(t.card.policy, NBA_GW_POLICIES.parlayLab);
    assert.deepEqual([t.card.priced, t.card.price, t.card.payout], [false, null, null]);
  }
});

test("SWITCHES: this rule OFF, or the display OFF, leaves the model byte-identical (no key, no note changed)", () => {
  /* The OFF baseline is explicit (enabled:false), so this holds whichever way the committed switch is set. */
  const base = JSON.stringify(buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, nbaGameWinners: { enabled: false } }));
  assert.equal(JSON.stringify(buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, nbaGameWinners: { enabled: false, display: on().display } })), base);
  assert.equal(JSON.stringify(buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, nbaGameWinners: { enabled: true, display: nbaGameWinnerDisplay({ repoRoot: REPO, date: DAY, ctx: CTX_OFF, lane: LANE_ON }) } })), base, "display OFF removes every tier with no other change");
  assert.equal("nbaGameWinners" in JSON.parse(base), false);
  /* ON: the committed default is exactly the switch's model — the rule's block with the real display when the switch is
     true, the OFF baseline when it is false. And ON differs from OFF only by the block and the NBA notes it owns. */
  const def = buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY });
  const onReal = buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, nbaGameWinners: { enabled: true } });
  assert.equal(JSON.stringify(def), NBA_GAME_WINNER_TIERS_PUBLIC ? JSON.stringify(onReal) : base);
  const offM = JSON.parse(base);
  const { nbaGameWinners: block, ...rest } = MODEL_ON;
  assert.ok(block?.public === true);
  const restNotes = { ...rest, untiered: rest.untiered.map((l) => (l.probabilityNote === NBA_GW_LEG_NOTE ? { ...l, probabilityNote: offM.untiered.find((o) => o.eventId === l.eventId)?.probabilityNote } : l)) };
  const offWithSameLane = JSON.parse(JSON.stringify(buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, nbaGameWinners: { enabled: false } })));
  assert.deepEqual(JSON.parse(JSON.stringify(restNotes)), offWithSameLane, "switch ON changes nothing but the NBA block and the notes of sides that can tier");
});

test("NOTE: with both on, a side that can appear in an NBA card no longer says it does not tier", () => {
  const inBlock = new Set(MODEL_ON.nbaGameWinners.legs.map((l) => String(l.eventId)));
  for (const l of MODEL_ON.untiered.filter((x) => x.sport === "nba")) {
    if (inBlock.has(String(l.eventId))) assert.equal(l.probabilityNote, NBA_GW_LEG_NOTE);
    else assert.notEqual(l.probabilityNote, NBA_GW_LEG_NOTE);
  }
});

test("RENDER: all three pages (founder mandate 2026-10-24) from one engine; display text; disclosure once per page; the recorder verifies every card exactly", () => {
  const render = (mode) => renderToString(React.createElement(LevelASuggestions, { model: MODEL_ON, mode }));
  const gw = MODEL_ON.nbaGameWinners;
  const pages = { [PAGE_FOR["parlay-lab"]]: render("parlay-lab"), [PAGE_FOR["bank-builder"]]: render("bank-builder"), [PAGE_FOR.moonshot]: render("moonshot") };
  const cardsOn = { "parlay-lab": gw.tiers.map((t) => t.card).filter(Boolean), "bank-builder": [gw.bankBuilder.card].filter(Boolean), moonshot: [gw.moonshot.card].filter(Boolean) };
  for (const [mode, page] of [["parlay-lab", "/build/"], ["bank-builder", "/bank-builder/"], ["moonshot", "/moonshot/"]]) {
    const html = pages[page];
    const text = html.replace(/<!-- -->/g, "");
    assert.match(html, new RegExp(`data-level-a-nba-game-winners="${mode}"`), `${mode} shows the NBA block`);
    assert.equal(text.split(CTX_ON.disclosure).length - 1, 1, `${mode}: the disclosure once`);
    const keys = [...html.matchAll(/data-level-a-card="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(keys, cardsOn[mode].map(nbaGameWinnerCardKey), `${mode}: exactly the engine's cards, nothing else`);
    for (const c of cardsOn[mode]) {
      assert.ok(text.includes(`model joint probability ${jointShownFor(c.jointProbability, c.tier)}`));
      for (const l of c.legs) assert.ok(text.includes(`${ELO_WIN_PROBABILITY_LABEL}: ${l.shownPct}`), l.eventId);
    }
  }
  assert.ok(cardsOn["bank-builder"].every((c) => c.legs.length === 2 && ["low", "medium"].includes(c.tier)), "Bank Builder: 2 legs, Low or Medium");
  assert.ok(cardsOn.moonshot.every((c) => c.tier === "longshot" && c.legs.length <= 5), "Moonshot: Longshot, at most 5 legs");
  const served = { schema: LEVEL_A_SERVED_SCHEMA, public: true, asOf: NOW, productDay: DAY, model: { ...MODEL_ON, asOf: NOW } };
  served.modelSha256 = modelSha256(served.model);
  const ok = verifyServed({ sha: "a".repeat(40), buildInfo: { builtAt: NOW, commit: { sha: "a".repeat(40) } }, served, pages });
  assert.deepEqual(ok, { ok: true, problems: [] });
  if (cardsOn["bank-builder"][0]) {
    const tampered = { ...pages, "/bank-builder/": pages["/bank-builder/"].replace(/data-level-a-card="[^"]+"/, 'data-level-a-card="other"') };
    assert.equal(verifyServed({ sha: "a".repeat(40), buildInfo: { builtAt: NOW, commit: { sha: "a".repeat(40) } }, served, pages: tampered }).ok, false, "a page not showing the exact card is refused");
  }
});

test("RECORD: tiered NBA cards are recorded only while public; never with the switch OFF", () => {
  const rows = recordEntries(MODEL_ON, { recordedAt: NOW });
  const nba = rows.filter((r) => r.policy.startsWith(NBA_GW_POLICY));
  assert.equal(nba.length, recordableNbaGameWinnerCards(MODEL_ON.nbaGameWinners).length);
  assert.ok(nba.some((r) => r.policy === NBA_GW_POLICIES.parlayLab));
  for (const r of nba) assert.ok(r.legs.every((l) => l.sport === "nba" && typeof l.probability === "number"));
  assert.equal(recordEntries({ ...MODEL_ON, nbaGameWinners: { ...MODEL_ON.nbaGameWinners, public: false } }, { recordedAt: NOW }).filter((r) => r.policy.startsWith(NBA_GW_POLICY)).length, 0);
  assert.equal(recordEntries(buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY, nbaGameWinners: { enabled: false } }), { recordedAt: NOW }).filter((r) => r.policy.startsWith(NBA_GW_POLICY)).length, 0, "switch OFF records none");
  const def = buildLevelAModel({ repoRoot: REPO, now: NOW, productDay: DAY });
  assert.equal(recordEntries(def, { recordedAt: NOW }).filter((r) => r.policy.startsWith(NBA_GW_POLICY)).length, NBA_GAME_WINNER_TIERS_PUBLIC ? recordableNbaGameWinnerCards(def.nbaGameWinners).length : 0, "the committed default records exactly what its switch shows");
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
  const start = lab.lastIndexOf("<section", lab.indexOf('data-level-a-nba-game-winners="parlay-lab"'));
  /* The NBA block only (it holds no nested section), as VISIBLE TEXT: tags and attributes (data-level-a-card keys such as
     "nba-game-winner-tiers@1/parlay-lab") are machine identifiers, not words a reader sees. */
  const block = lab.slice(start, lab.indexOf("</section>", start)).replace(/<[^>]+>/g, " ");
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
  assert.deepEqual(e.cards.parlayCenter.map((c) => c.tier), ["low", "medium", "high", "longshot"]);
  for (const c of [...e.cards.parlayCenter, e.cards.bankBuilder, e.cards.moonshot]) if (!c.empty) assert.equal(c.jointShown, jointShownFor(c.jointExact, c.tier));
  assert.deepEqual(e.bandSweep.misbanded, []);
  assert.equal(e.switchOffModelIdentical, true);
  const gw = MODEL_ON.nbaGameWinners;
  assert.deepEqual(e.cards.parlayCenter.map((c) => c.cardKey ?? null), gw.tiers.map((t) => (t.card ? nbaGameWinnerCardKey(t.card) : null)), "the prediction is the model the pages render");
  assert.equal(e.cards.bankBuilder.cardKey ?? null, gw.bankBuilder.card ? nbaGameWinnerCardKey(gw.bankBuilder.card) : null);
  assert.equal(e.cards.moonshot.cardKey ?? null, gw.moonshot.card ? nbaGameWinnerCardKey(gw.moonshot.card) : null);
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

test("SWITCH FALSE ON AN ELO SLATE (H1 lands before the 10-24 publish): untiered NBA sides show the Elo estimate as information, no NBA card anywhere", async () => {
  const os = await import("node:os");
  /* A temporary repo root holding ONLY a lane in the published-with-Elo shape (the display's own publisher over the real
     receipts), so the Level A readers see exactly what a slate published with the Elo switch on gives them. */
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levela-elo-"));
  fs.mkdirSync(path.join(root, "app/public/data/nba/experimental-public"), { recursive: true });
  fs.writeFileSync(path.join(root, `app/public/data/nba/experimental-public/${DAY}.json`), JSON.stringify(LANE_ON));
  const model = buildLevelAModel({ repoRoot: root, now: NOW, productDay: DAY, nbaGameWinners: { enabled: false } });
  assert.equal("nbaGameWinners" in model, false, "switch false: no NBA game-winner block in the model");
  const nba = model.untiered.filter((l) => l.sport === "nba");
  assert.ok(nba.length >= 5);
  for (const mode of ["parlay-lab", "bank-builder", "moonshot"]) {
    const html = renderToString(React.createElement(LevelASuggestions, { model, mode }));
    const text = html.replace(/<!-- -->/g, "");
    assert.doesNotMatch(html, /data-level-a-nba-game-winners|data-level-a-card=/, `${mode}: no NBA card`);
    for (const l of nba) {
      if (l.uncertainty?.kind !== "elo-win-probability") continue;
      assert.ok(text.includes(l.uncertainty.text), `${mode}: ${l.eventId} shows the display's Elo estimate text`);
      assert.ok(text.includes("Untiered: the Elo-derived game-winner estimate is shown for information only and does not tier this leg."), `${mode}: the display's own untiered note, unchanged by this rule while it is off`);
      assert.equal(l.probability, null, "still untiered");
    }
    assert.ok(nba.some((l) => l.uncertainty?.kind === "elo-win-probability"), "the Elo field reached the rows");
  }
});
