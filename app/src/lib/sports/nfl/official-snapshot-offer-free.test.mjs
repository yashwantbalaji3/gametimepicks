/**
 * Release-owner rule (PR 1130): unsupported sportsbook identifiers never reach public-facing data. The NFL official
 * snapshot is built from the RAW player board (projections are not prices) while the page is handed the sanitised
 * board — acceptable ONLY because the snapshot carries no offer / price / book field at all. This pins both halves.
 * Run: npx tsx --test src/lib/sports/nfl/official-snapshot-offer-free.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { KNOWN_OFFSHORE_KEYS } from "../odds/eligible-operators.mjs";
import { loadForecastViews } from "./forecast-view-load.mjs";
import { forecastOfRecord } from "../../forecast-ledger/adapters/nfl.mjs";
import { nflOfficialSnapshot } from "../../consistency/official-snapshot.mjs";

const PUBLIC = path.join(process.cwd(), "public");
const OFFSHORE = new RegExp(`(${[...KNOWN_OFFSHORE_KEYS, "betonline", "mybookie", "betanysports"].join("|")})`, "i");
const OFFER_KEYS = /"(sportsbook|bookWithheld|overOdds|underOdds|yesOdds|noOdds|price|americanOdds|book|line)"\s*:/;

test("the official snapshot built from a RAW board with an offshore offer carries no offer field and no unsupported book", () => {
  const id = "401872960";
  const rawPath = path.join(PUBLIC, "data", "nfl", "player-board", `${id}.json`);
  const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  assert.match(JSON.stringify(raw), OFFSHORE, "precondition: the committed raw board still carries an offshore offer");
  // the receipts of record for this event, exactly as the loader resolves them
  const rdir = path.join(PUBLIC, "..", "..", "data", "internal", "nfl", "forecast-receipts");
  const receipts = [];
  if (fs.existsSync(rdir)) for (const d of fs.readdirSync(rdir)) {
    const dd = path.join(rdir, d);
    if (!fs.statSync(dd).isDirectory()) continue;
    for (const f of fs.readdirSync(dd)) if (f === `${id}.json` || f.startsWith(`${id}-rev-`)) receipts.push({ file: path.join(dd, f), receipt: JSON.parse(fs.readFileSync(path.join(dd, f), "utf8")) });
  }
  assert.ok(forecastOfRecord(receipts).get(id), "the event has a forecast receipt of record (the snapshot assertions below always run)");
  const snap = nflOfficialSnapshot(id, { receipts, playerBoard: { path: rawPath, doc: raw } });
  const text = JSON.stringify(snap);
  assert.doesNotMatch(text, OFFSHORE, "no unsupported book id or name anywhere in the snapshot");
  assert.doesNotMatch(text, OFFER_KEYS, "the snapshot carries projections only — no offer, price, line or book field");
});

test("no loaded NFL game view (page payload incl. its official snapshot) names an unsupported book or carries its price", () => {
  const views = loadForecastViews(PUBLIC);
  assert.ok(views.length > 0, "views load");
  assert.ok(views.some((v) => v.official), "at least one view carries an official snapshot (so the snapshot check is exercised)");
  for (const v of views) {
    assert.doesNotMatch(JSON.stringify(v), OFFSHORE, `view ${v.providerEventId}`);
    if (v.official) assert.doesNotMatch(JSON.stringify(v.official), OFFER_KEYS, `official snapshot ${v.providerEventId} carries no offer field`);
  }
});
