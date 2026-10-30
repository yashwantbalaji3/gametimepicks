/**
 * Founder-review betslip graphic for a daily Bank Builder / Moonshot candidate (scripts/social/daily-candidate-cards.mjs,
 * render-daily-candidate-graphic.mjs): verified odds only, math recomputed, hypothetical-stake label, review banner,
 * no em/en dash or banned words, output only outside the repository; PNGs skip only without a chromium binary.
 * Synthetic legs (MLB, the one FULL_MODEL sport) so the positive path runs without a key.
 * Run: npx tsx --test src/lib/social/daily-candidate-graphic.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildDailyCandidate } from "../products/daily-candidates/engine.mjs";
import { makeDailyCandidateReceipt, writeReceiptOnce } from "../products/daily-candidates/receipt.mjs";
import { renderCandidateCardHtml, receiptViolations, textViolations, HYPOTHETICAL_LABEL } from "../../../scripts/social/daily-candidate-cards.mjs";
import { prepareCandidateGraphic, renderDailyCandidateGraphic } from "../../../scripts/social/render-daily-candidate-graphic.mjs";
import { visibleText } from "../../../scripts/social/nba-line-cards.mjs";

const AS_OF = "2026-10-30T15:00:00.000Z";
const leg = (eventId, team, opp, american, probability, book = "BookA") => ({
  legType: "mlb_test", sport: "mlb", eventId, eventStartUtc: "2026-10-30T23:10:00.000Z", eventLabel: `${opp} @ ${team}`, team, opponent: opp,
  participantId: null, participantName: null, family: "winner", marketFamily: "team_result", marketKey: "h2h", side: team, line: null,
  selection: `${team} moneyline`, availabilityState: "UNKNOWN",
  forecast: { owner: "mlb-prediction official snapshot", id: "s1", forecastClass: "VALIDATED_MODEL", modelStatus: "VALIDATED", probability, probabilityBasis: "MODEL_VALIDATED", projection: null, estimate: false, sourceRefs: ["fixture"], publishedAt: "2026-10-30T12:00:00Z" },
  price: { american, bookmaker: book, capturedAt: "2026-10-30T14:00:00.000Z", receipt: "fixture/odds" },
});
const INPUTS = [leg("g1", "BBB", "AAA", -150, 0.66, "BookA"), leg("g2", "DDD", "CCC", -160, 0.64, "BookB")];
const receipt = () => makeDailyCandidateReceipt(buildDailyCandidate({ product: "bank-builder", productDay: "2026-10-30", asOf: AS_OF, inputs: INPUTS }));

test("a valid candidate renders with verified odds, the math, the labels and the banner; clean text", () => {
  const r = receipt();
  assert.deepEqual(receiptViolations(r), []);
  const html = renderCandidateCardHtml(r);
  assert.deepEqual(textViolations(html), []);
  const text = visibleText(html);
  for (const s of ["-150", "-160", "BookA", "BookB", "+171", "$10.00", "$27.08", "$17.08", HYPOTHETICAL_LABEL, "Illustrative only", "GameTime Picks", "FOUNDER REVIEW ONLY"]) assert.ok(text.includes(s), s);
  assert.doesNotMatch(text, /placed a bet|bet placed|will win|guarantee/i);
});

test("refusals: tampered odds, broken math, missing quote, no-candidate day, em dash", () => {
  const r = structuredClone(receipt());
  r.result.card.legs[0].american = -155;
  assert.ok(receiptViolations(r).some((v) => /contentSha256/.test(v)), "an edited receipt is not a source");
  assert.ok(receiptViolations(r).some((v) => /do not recompute/.test(v)));
  const r2 = structuredClone(receipt()); r2.result.card.legs[1].capturedAt = "2026-10-31T00:00:00.000Z";
  assert.ok(receiptViolations(r2).some((v) => /quote time/.test(v)));
  const none = makeDailyCandidateReceipt(buildDailyCandidate({ product: "moonshot", productDay: "2026-10-30", asOf: AS_OF, inputs: [] }));
  assert.throws(() => renderCandidateCardHtml(none), /not a CANDIDATE/);
  assert.ok(textViolations("<p>a — b Not betting advice. 1-800-GAMBLER</p>").some((v) => /em dash/.test(v)));
});

test("output must be outside every git repository", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-dc-graphic-"));
  try {
    const r = receipt();
    writeReceiptOnce(dir, r, { inputs: INPUTS, nowIso: "2026-10-30T15:05:00Z" });
    const file = path.join(dir, r.productDay, `${r.product}-${r.receiptId}.json`);
    await assert.rejects(renderDailyCandidateGraphic({ receipt: file, out: path.join(process.cwd(), "tmp-graphic-out"), "no-png": true }), /inside the repository/);
    assert.ok(!fs.existsSync(path.join(process.cwd(), "tmp-graphic-out")));
    const res = await renderDailyCandidateGraphic({ receipt: file, out: path.join(dir, "out"), "no-png": true });
    assert.equal(fs.readFileSync(res.html, "utf8"), prepareCandidateGraphic(r).html);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { chromium = null; }
const NO_BROWSER = (() => { try { return chromium && fs.existsSync(chromium.executablePath()) ? false : "playwright chromium is not installed in this environment"; } catch (e) { return `playwright chromium unavailable: ${e.message}`; } })();

test("PNG at 1x and 2x (skips only without a chromium binary)", { skip: NO_BROWSER }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-dc-png-"));
  try {
    const r = receipt();
    writeReceiptOnce(dir, r, { inputs: INPUTS, nowIso: "2026-10-30T15:05:00Z" });
    const res = await renderDailyCandidateGraphic({ receipt: path.join(dir, r.productDay, `${r.product}-${r.receiptId}.json`), out: path.join(dir, "out"), scales: "1,2" });
    assert.equal(res.pngs.length, 2);
    for (const f of res.pngs) assert.ok(fs.statSync(f).size > 10_000, f);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
