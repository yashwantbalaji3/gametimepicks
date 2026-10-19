/**
 * The loader-boundary sanitiser (approval package O-6 / O-7): an ineligible book's offer never reaches a
 * serialised payload, and NOTHING ELSE about the record changes — projections, live facts and settlement
 * records are the published history and must survive byte-for-byte.
 *
 * Run: npx tsx --test src/lib/sports/odds/public-offer-sanitizer.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { KNOWN_OFFSHORE_KEYS, ELIGIBLE_OPERATOR_KEYS, BOOK_AVAILABILITY_NOTE } from "./eligible-operators.mjs";
import {
  BOOK_WITHHELD_INELIGIBLE,
  isWithheldOffer,
  sanitizeLivePropsArtifact,
  sanitizeLivePropsJsonText,
  sanitizeOffer,
  sanitizePlayerBoard,
  sanitizeVaultArtifact,
} from "./public-offer-sanitizer.mjs";
import { playerRows } from "../nfl/forecast-view.mjs";
import { marketFromCapturedOffer } from "../../prediction-presentation/contract.ts";
import { presentVaultCandidate } from "../../prediction-presentation/nfl.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const PUB = path.join(APP, "public/data");
const OFFSHORE = new RegExp(`${KNOWN_OFFSHORE_KEYS.join("|")}|betonline|mybookie|betanysports`, "i");
const WITHHELD = { sportsbook: null, bookWithheld: BOOK_WITHHELD_INELIGIBLE };
const readIf = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(PUB, rel), "utf8")); } catch { return null; } };
const clone = (x) => JSON.parse(JSON.stringify(x));

test("sanitizeOffer: eligible offers pass untouched (same reference); every other book is withheld, fail-closed", () => {
  for (const k of ELIGIBLE_OPERATOR_KEYS) {
    const o = { line: 5.5, overOdds: -110, underOdds: -110, sportsbook: k, capturedAt: "2026-09-27T17:30:36Z" };
    assert.equal(sanitizeOffer(o), o, `${k} is eligible`);
  }
  assert.equal(sanitizeOffer({ yesOdds: 110, sportsbook: "DraftKings", capturedAt: "x" }).sportsbook, "DraftKings", "an eligible display title resolves too");
  for (const bad of [...KNOWN_OFFSHORE_KEYS, "BetOnline.ag", "Bovada", "hardrockbet", "fliff", "", null, undefined, 42]) {
    const out = sanitizeOffer({ yesOdds: 110, line: 0.5, overOdds: 100, underOdds: -120, sportsbook: bad, capturedAt: "2026-09-27T17:30:36Z" });
    assert.deepEqual(out, WITHHELD, `${String(bad)} → withheld, with no book, line, odds or instant`);
  }
  assert.equal(sanitizeOffer(null), null);
  assert.equal(sanitizeOffer(undefined), undefined);
  /* A withheld slot that somehow carries prices is normalised back to the two-field shape. */
  assert.deepEqual(sanitizeOffer({ ...WITHHELD, yesOdds: 110 }), WITHHELD);
  assert.ok(isWithheldOffer(sanitizeOffer({ sportsbook: "lowvig" })));
});

test("sanitizePlayerBoard: withholds only the offer; projections are unchanged; the input is not mutated", () => {
  const board = {
    providerEventId: "1", families: { anytime_td: { state: "PUBLISHED" } },
    players: [
      { playerId: "a", name: "A", markets: { anytime_td: { probability: 0.3874, market: { yesOdds: 110, sportsbook: "betonlineag", capturedAt: "t" } } } },
      { playerId: "b", name: "B", markets: { anytime_td: { probability: 0.2, market: { yesOdds: 150, sportsbook: "draftkings", capturedAt: "t" } }, player_receptions: { mean: 4, p10: 1, median: 4, p90: 7, pricingState: "NOT_OFFERED" } } },
    ],
  };
  const before = clone(board);
  const out = sanitizePlayerBoard(board);
  assert.deepEqual(board, before, "the caller's object is never mutated");
  assert.deepEqual(out.players[0].markets.anytime_td, { probability: 0.3874, market: WITHHELD });
  assert.equal(out.players[1], board.players[1], "a player with only eligible offers is the same object");
  assert.doesNotMatch(JSON.stringify(out), OFFSHORE);
  const clean = { players: [board.players[1]] };
  assert.equal(sanitizePlayerBoard(clean), clean, "nothing to withhold ⇒ the same reference, so a clean board serialises byte-identically");
  assert.equal(sanitizePlayerBoard(null), null);
});

test("O-6 regression: the committed /nfl/game/401872960 board and live-props record lose the offshore offer and nothing else", (t) => {
  const board = readIf("nfl/player-board/401872960.json");
  const lp = readIf("nfl/live-props/401872960.json");
  if (!board || !lp) { t.skip("committed 401872960 artifacts not present"); return; }
  const offshoreIn = (j) => (JSON.stringify(j).match(new RegExp(`"sportsbook":"(${KNOWN_OFFSHORE_KEYS.join("|")})"`, "g")) ?? []).length;
  assert.ok(offshoreIn(board) >= 1 && offshoreIn(lp) >= 1, "precondition: the committed artifacts still carry the case this guards");

  const sb = sanitizePlayerBoard(board);
  assert.equal(offshoreIn(sb), 0);
  assert.doesNotMatch(JSON.stringify(sb), OFFSHORE);
  /* Everything except the offer slots is identical. */
  const stripOffers = (b) => ({ ...b, players: b.players.map((p) => ({ ...p, markets: Object.fromEntries(Object.entries(p.markets).map(([k, e]) => [k, { ...e, market: e.market ? "slot" : e.market }])) })) });
  assert.deepEqual(stripOffers(sb), stripOffers(board), "projections, participation and every non-offer field unchanged");
  const zay = sb.players.find((p) => p.name === "Zay Flowers");
  assert.deepEqual(zay.markets.anytime_td, { probability: 0.3874, market: WITHHELD });

  const slp = sanitizeLivePropsArtifact(lp);
  assert.equal(offshoreIn(slp), 0);
  assert.doesNotMatch(JSON.stringify(slp), OFFSHORE);
  assert.equal(slp.rows.length, lp.rows.length);
  slp.rows.forEach((r, i) => {
    const o = lp.rows[i];
    for (const k of ["predictionId", "playerId", "family", "familyState", "frozenIdentity", "frozenRefusal", "live", "settlement", "reconciliation"]) {
      assert.deepEqual(r[k], o[k], `${o.predictionId}.${k} unchanged — settlement records and live facts are history`);
    }
    assert.deepEqual(r.frozen?.projection, o.frozen?.projection, `${o.predictionId} projection unchanged`);
    assert.deepEqual({ ...r.frozen, market: null }, { ...o.frozen, market: null }, "only frozen.market may differ");
  });
  for (const k of Object.keys(lp)) if (k !== "rows") assert.deepEqual(slp[k], lp[k], `top-level ${k} unchanged`);
});

test("live-props JSON text: a clean record is returned byte-identical; a dirty one in the producer's own format", (t) => {
  const dir = path.join(PUB, "nfl/live-props");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  if (!files.length) { t.skip("no live-props artifacts on disk"); return; }
  let clean = 0, dirty = 0;
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    const out = sanitizeLivePropsJsonText(text);
    if (OFFSHORE.test(text)) {
      dirty += 1;
      assert.ok(out.withheld >= 1 && out.text !== text && out.text.endsWith("}\n"));
      assert.doesNotMatch(out.text, OFFSHORE, `${f} public copy names no offshore book`);
    } else {
      clean += 1;
      assert.equal(out.text, text, `${f} has nothing to withhold and must not be rewritten`);
    }
  }
  assert.ok(clean > 0, "the byte-identity half of this test examined at least one record");
  console.log(`[public-offer-sanitizer] live-props: ${clean} clean (byte-identical), ${dirty} sanitised`);
});

test("sanitizeVaultArtifact: marketPrice withheld, tdProbability and every other field unchanged", () => {
  const vault = {
    state: "WATCHLIST", selections: [],
    watchlist: [
      { playerId: "p1", name: "Dallas Goedert", tdProbability: 0.31, roleState: "CONFIRMED", marketPrice: { yesOdds: 200, sportsbook: "betonlineag", capturedAt: "t" } },
      { playerId: "p2", name: "Derrick Henry", tdProbability: 0.52, roleState: "CONFIRMED", marketPrice: { yesOdds: -255, sportsbook: "draftkings", capturedAt: "t" } },
      { playerId: "p3", name: "X", tdProbability: 0.2, roleState: "CONFIRMED", marketPrice: null, pricingState: "NOT_OFFERED" },
    ],
  };
  const out = sanitizeVaultArtifact(vault);
  assert.deepEqual(out.watchlist[0], { ...vault.watchlist[0], marketPrice: WITHHELD });
  assert.equal(out.watchlist[1], vault.watchlist[1]);
  assert.equal(out.watchlist[2], vault.watchlist[2]);
  const committed = readIf("nfl/end-zone-vault/2026-09-25.json");
  if (committed) {
    const s = sanitizeVaultArtifact(committed);
    assert.doesNotMatch(JSON.stringify(s), OFFSHORE);
    assert.deepEqual(s.watchlist.map((c) => c.tdProbability), committed.watchlist.map((c) => c.tdProbability));
  }
});

test("O-7 presentation: a withheld or ineligible offer is INELIGIBLE_BOOK ('Price not shown'), never a price or a false 'not probed'", () => {
  assert.equal(marketFromCapturedOffer(WITHHELD, null).state, "INELIGIBLE_BOOK");
  assert.equal(marketFromCapturedOffer({ yesOdds: 110, sportsbook: "betonlineag", capturedAt: "t" }, null).state, "INELIGIBLE_BOOK", "fail-closed even when a caller skipped the loader");
  assert.equal(marketFromCapturedOffer({ yesOdds: 110, sportsbook: "draftkings", capturedAt: "t" }, null).state, "FROZEN_CAPTURE");
  assert.equal(marketFromCapturedOffer(null, "NOT_OFFERED").state, "NOT_OFFERED");
  const ctx = { forecastAt: "t", modelId: "m", modelVersion: 1 };
  const base = { playerId: "nfl-athlete-1", name: "A", team: "PHI", event: "e", tdProbability: 0.31, roleState: "CONFIRMED" };
  const p = presentVaultCandidate({ ...base, marketPrice: WITHHELD }, ctx);
  assert.equal(p.market.state, "INELIGIBLE_BOOK");
  assert.equal(p.market.frozen, undefined);
  assert.equal(p.model.probability, 0.31, "the model's probability is untouched");
  assert.equal(presentVaultCandidate({ ...base, marketPrice: { yesOdds: 200, sportsbook: "bovada", capturedAt: "t" } }, ctx).market.state, "INELIGIBLE_BOOK");
});

test("O-7 PlayerRow path: the forecast view carries only the withheld flag for an ineligible book, even from an unsanitised board", () => {
  const board = {
    generatedAt: "t", families: { anytime_td: { state: "PUBLISHED" } },
    players: [
      { playerId: "nfl-athlete-1", name: "A", team: "BAL", participation: "AVAILABLE", markets: { anytime_td: { probability: 0.3874, market: { yesOdds: 110, sportsbook: "betonlineag", capturedAt: "t" } } } },
      { playerId: "nfl-athlete-2", name: "B", team: "KC", participation: "AVAILABLE", markets: { anytime_td: { probability: 0.41, market: { yesOdds: 120, sportsbook: "draftkings", capturedAt: "t" } } } },
    ],
  };
  const forecast = { providerEventId: "9", matchup: "BAL @ KC", kickoffUtc: "2026-09-27T17:00:00Z", home: { abbr: "KC" }, away: { abbr: "BAL" } };
  const rows = playerRows({ forecast, world: null, board });
  const a = rows.find((r) => r.playerId === "nfl-athlete-1").families.anytimeTd;
  const b = rows.find((r) => r.playerId === "nfl-athlete-2").families.anytimeTd;
  assert.deepEqual(a.market, WITHHELD, "PlayerRow receives no book, line or price");
  assert.equal(a.value, 0.3874, "the projection is unchanged");
  assert.equal(b.market.sportsbook, "draftkings");
  assert.equal(b.market.yesOdds, 120);
  assert.doesNotMatch(JSON.stringify(rows), OFFSHORE);
});

test("committed artifacts are byte-identical after the post-export sweep; only the exported copy is sanitised", (t) => {
  const src = path.join(PUB, "nfl/live-props");
  const files = fs.existsSync(src) ? fs.readdirSync(src).filter((f) => f.endsWith(".json")).sort() : [];
  if (!files.length) { t.skip("no live-props artifacts on disk"); return; }
  const EXPORT_DIR = "out";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-offer-sweep-"));
  const dest = path.join(tmp, EXPORT_DIR, "data", "nfl", "live-props");
  fs.mkdirSync(dest, { recursive: true });
  const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const before = Object.fromEntries(files.map((f) => [f, sha(path.join(src, f))]));
  for (const f of files) fs.copyFileSync(path.join(src, f), path.join(dest, f));
  try {
    const r = spawnSync(process.execPath, [path.join(APP, "scripts/prune-internal-routes.mjs")], { cwd: tmp, encoding: "utf8", env: { ...process.env, GTP_KEEP_PUBLIC_DATA: "1", NEXT_PUBLIC_INTERNAL_ROUTES: "" } });
    assert.equal(r.status, 0, r.stderr);
    for (const f of files) {
      assert.equal(sha(path.join(src, f)), before[f], `public/data/nfl/live-props/${f} must never be written by the export step`);
      const exported = fs.readFileSync(path.join(dest, f), "utf8");
      assert.doesNotMatch(exported, OFFSHORE, `exported ${f} names no offshore book`);
      if (!OFFSHORE.test(fs.readFileSync(path.join(src, f), "utf8"))) assert.equal(sha(path.join(dest, f)), before[f], `${f}: clean record exported byte-identical`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("the jurisdiction note has one owner and says what the allowlist does not", () => {
  assert.equal(BOOK_AVAILABILITY_NOTE, "Sportsbook availability varies by state.");
  for (const f of ["src/components/prediction/prediction-board.tsx", "src/components/nfl/forecast/family-tabs.tsx", "src/components/mlb/props-board.tsx"]) {
    assert.match(fs.readFileSync(path.join(APP, f), "utf8"), /BOOK_AVAILABILITY_NOTE/, `${f} renders the shared note where it names a book`);
  }
});

test("rendered: a withheld offer reads 'Price not shown' in PredictionBoard and PlayerRow, names no book, and the note shows only beside a named book", async () => {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  globalThis.React = React;
  const { PredictionBoard } = await import("../../../components/prediction/prediction-board.tsx");
  const PlayerRow = (await import("../../../components/nfl/forecast/player-row.tsx")).default;
  const { presentPlayerBoardRow } = await import("../../prediction-presentation/nfl.ts");

  const board = sanitizePlayerBoard({
    providerEventId: "9", kickoffUtc: "2026-09-27T17:00:00Z", generatedAt: "t",
    families: { anytime_td: { state: "PUBLISHED", label: "Anytime touchdown" } },
    players: [
      { playerId: "nfl-athlete-1", name: "A", team: "BAL", participation: "AVAILABLE", markets: { anytime_td: { probability: 0.3874, market: { yesOdds: 110, sportsbook: "betonlineag", capturedAt: "t" } } } },
      { playerId: "nfl-athlete-2", name: "B", team: "KC", participation: "AVAILABLE", markets: { anytime_td: { probability: 0.41, market: { yesOdds: 120, sportsbook: "draftkings", capturedAt: "2026-09-27T17:30:36Z" } } } },
    ],
  });
  const ctx = { providerEventId: "9", kickoffUtc: board.kickoffUtc, families: board.families, generatedAt: "t", teams: ["BAL", "KC"] };
  const rows = board.players.map((p) => presentPlayerBoardRow(ctx, p, "anytime_td"));
  const withheldOnly = renderToStaticMarkup(React.createElement(PredictionBoard, { predictions: [rows[0]], gameHref: () => null }));
  assert.match(withheldOnly, /Price not shown/);
  assert.doesNotMatch(withheldOnly, OFFSHORE);
  assert.doesNotMatch(withheldOnly, /\+110/, "no price of the withheld offer");
  assert.ok(!withheldOnly.includes(BOOK_AVAILABILITY_NOTE), "no book named ⇒ no availability line");
  const mixed = renderToStaticMarkup(React.createElement(PredictionBoard, { predictions: rows, gameHref: () => null }));
  assert.ok(mixed.includes(BOOK_AVAILABILITY_NOTE), "a board that names a book carries the jurisdiction note");

  const player = { playerId: "nfl-athlete-1", name: "A", position: "WR", team: "BAL", opponent: "KC", providerEventId: "9", matchup: "BAL @ KC", kickoffUtc: "2026-09-27T17:00:00Z", availabilityLabel: null };
  const family = { key: "anytimeTd", kind: "probability", unit: "", title: "Anytime TD" };
  for (const market of [WITHHELD, { sportsbook: "bovada", yesOdds: 110, line: null, overOdds: null, underOdds: null, capturedAt: "t" }]) {
    const html = renderToStaticMarkup(React.createElement(PlayerRow, { player, family, entry: { value: 0.3874, market } }));
    assert.match(html, /data-market-withheld="ineligible-operator"/);
    assert.match(html, /Price not shown/);
    assert.doesNotMatch(html, OFFSHORE);
    assert.doesNotMatch(html, /yes \+110/);
  }
  const dk = renderToStaticMarkup(React.createElement(PlayerRow, { player, family, entry: { value: 0.41, market: { sportsbook: "draftkings", yesOdds: 120, line: null, overOdds: null, underOdds: null, capturedAt: "t" } } }));
  assert.match(dk, /DraftKings/);
  assert.match(dk, /yes \+120/);
});
