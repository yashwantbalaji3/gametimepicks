/**
 * WORLD CUP GAME LAB REPORT (Plan 0008 Phase 2A · chunk 3). Pins that the per-game WC model report is
 * built verbatim from the REAL projections (odds-only, no fabrication, no simulation claim), carries the
 * honest odds-only + 90-minute-regulation caveats, product mapping is link-only + artifact-proven (WC
 * Specials only when the fixture is in the specials artifact; never Moonshot), and unavailable modules
 * render as "not yet simulated". Display-only — money is never touched; games are never settled.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const lib = read("src/lib/game-lab/wc-report.ts");
const comp = read("src/components/game/wc-game-lab-report.tsx");
const detail = read("src/lib/game-detail.ts");
const page = read("src/components/game/game-detail-page.tsx");

const SIM_CLAIM = /\b\d[\d,]*\s*(simulation|run)s\b|we (ran|simulated)\b/i;
const BANNED = /\bguaranteed\b|\block\b|\bsafest\b|can'?t lose/i;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

async function buildAeView(opts) {
  const { loadWorldCupProjections } = await import("./world-cup/projections.ts");
  const { buildWcGameLabReport } = await import("./game-lab/wc-report.ts");
  const proj = loadWorldCupProjections();
  // This test verifies the report BUILDER, so it must stay resilient as the live WC slate advances.
  // Prefer Argentina (the original July-7 fixture) when present, else the first match on the current
  // slate — the assertions below are all match-agnostic (odds-only, valid signals, real edges).
  const mid = (proj?.matches?.find((m) => /Argentina/i.test(m.homeTeam ?? "")) ?? proj?.matches?.[0])?.matchId;
  return { v: buildWcGameLabReport(proj, mid, opts), mid };
}

test("thresholds reused from the MLB report (single documented source, not re-invented)", async () => {
  const m = await import("./game-lab/mlb-report.ts");
  const w = await import("./game-lab/wc-report.ts");
  assert.equal(m.SUPPORTED_EDGE_MIN, 5);
  assert.equal(m.OPPOSED_EDGE_MAX, 0);
  // The WC lib re-exports / consumes the same consts (proves it didn't invent its own thresholds).
  assert.ok(w.STRONG_EDGE_MIN === m.SUPPORTED_EDGE_MIN, "WC uses the MLB supported-edge floor");
});

test("FUNCTIONAL: builds a real WC report from projections (odds-only, nothing fabricated/inflated)", async () => {
  const { v } = await buildAeView();
  assert.ok(v, "a view is built");
  assert.equal(v.oddsOnly, true, "explicitly odds-only");
  assert.ok(v.marketCount >= 1 && v.rows.length === v.marketCount, "rows == marketCount");
  for (const r of v.rows) {
    assert.ok(["supported", "neutral", "opposed"].includes(r.signal), "valid signal");
    assert.ok(Number.isFinite(r.edgePct), "real edge (never NaN)");
    assert.equal(String(r.settlementSupport), "regulation_90", "90-minute settlement");
  }
  assert.equal(v.supported.length + v.neutral.length + v.opposed.length, v.rows.length, "signals partition the rows");
  // biggest leans sorted by |edge| desc
  for (let i = 1; i < v.biggestLeans.length; i++) {
    assert.ok(Math.abs(v.biggestLeans[i - 1].edgePct) >= Math.abs(v.biggestLeans[i].edgePct), "sorted");
  }
});

test("carries the odds-only disclaimer AND the 90-minute regulation caveat (ET/penalties don't count)", async () => {
  const { v } = await buildAeView();
  assert.ok(v.whatBreaksIt.some((b) => /odds-only|market-implied/i.test(b)), "odds-only disclaimer");
  assert.ok(v.whatBreaksIt.some((b) => /penalt|extra time|regulation/i.test(b)), "90-minute / ET-penalties caveat");
});

test("product mapping is LINK-ONLY + artifact-proven; WC Specials only when in the artifact; NEVER Moonshot", async () => {
  const inSpec = await buildAeView({ inWcSpecials: true });
  const noSpec = await buildAeView({ inWcSpecials: false });
  for (const v of [inSpec.v, noSpec.v]) {
    for (const p of v.productMapping) {
      assert.ok(p.href.startsWith("/"), `link-only href: ${p.href}`);
      assert.ok(!/Moonshot/i.test(p.label), "never Moonshot for a WC game");
    }
    assert.ok(v.productMapping.some((p) => /Parlay Lab/i.test(p.label)), "Parlay Lab always");
  }
  // WC Specials appears ONLY when the fixture is actually in the specials artifact (proven membership).
  assert.ok(inSpec.v.productMapping.some((p) => /Specials/i.test(p.label)), "WC Specials linked when inWcSpecials");
  assert.ok(!noSpec.v.productMapping.some((p) => /Specials/i.test(p.label)), "WC Specials NOT linked when not in the artifact");
});

test("unavailable modules render as honest 'coming soon' placeholders (incl. WC's absent recent-form)", async () => {
  const { v } = await buildAeView();
  assert.ok(v.unavailable.length >= 1, "placeholders exist");
  // Honest availability language (reworded to a friendly 'coming soon' roadmap; never a fabricated value).
  for (const u of v.unavailable) assert.match(u.reason, /coming soon|requires|not yet simulated|no persisted|odds-only/i, "honest reason");
  // WC has no sigma/recent-form → it must be an honest placeholder, never a fabricated form table.
  assert.ok(v.unavailable.some((u) => /recent[- ]form/i.test(u.label)), "recent-form is an honest 'unavailable', not fabricated");
});

test("NO simulation CLAIM (comment-stripped); paper-only copy present; no banned copy", () => {
  assert.ok(!SIM_CLAIM.test(stripComments(lib)), "lib makes no simulation claim");
  assert.ok(!SIM_CLAIM.test(stripComments(comp)), "component renders no simulation claim");
  assert.ok(/paper-only|educational/i.test(comp), "paper-only / educational copy present");
  assert.ok(!BANNED.test(comp), "no guaranteed/lock/safest/can't-lose");
});

test("wired: PublicGameDetail carries gameLabWc, populated from projections with artifact-proven inWcSpecials; page renders it", () => {
  assert.match(detail, /gameLabWc\?: WcGameLabView \| null/, "PublicGameDetail carries the WC report");
  assert.match(detail, /buildWcGameLabReport\(rawWcProjections, matchId, \{ inWcSpecials: wcSpecialGames\.has\(head\.gameLabel\) \}\)/, "populated with proven WC-Specials membership");
  assert.match(detail, /loadWorldCupSpecials\(\)\?\.cards/, "membership from the real WC Specials artifact");
  assert.match(page, /import WcGameLabReport from "@\/components\/game\/wc-game-lab-report"/, "page imports it");
  assert.match(page, /detail\.gameLabWc \? <div[^>]*><WcGameLabReport view=\{detail\.gameLabWc\}/, "renders it only for WC");
});
