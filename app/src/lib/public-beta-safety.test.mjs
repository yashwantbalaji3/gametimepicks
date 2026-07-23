/**
 * Public beta safety regression (Phase 7). Prevents the beta launch from silently: modifying money, flipping the
 * research gate, leaking internal research into the public app, or presenting the deterministic simulator's social
 * content as a betting recommendation. Complements the copy-language tests (mlb-report-public-language, shadow-
 * calibration, methodology-content). No modeling.
 *
 * Run: npx tsx --test src/lib/public-beta-safety.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const repo = path.dirname(app);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const walk = (dir, out = []) => { try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p); } } catch { /* skip */ } return out; };

test("1 · money is untouched (portfolio md5 pinned)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
  const r = readJson(path.join(app, "public/data/mr-dub/portfolio.json")).record;
  assert.equal(`${r.wins}-${r.losses}`, "19-14"); assert.equal(r.pending, 0);
});

test("2 · the research modeling gate stays BLOCKED (beta cannot silently flip it)", () => {
  const b = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/benchmark.json"));
  if (b) assert.match(b.status, /INSUFFICIENT/, "benchmark stays INSUFFICIENT until the gate passes");
  const rp = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/research-progress.json"));
  if (rp) { assert.equal(rp.gate.modelingStatus, "BLOCKED"); assert.equal(rp.datasetReadiness.dateTargetMet, false); }
});

test("3 · NO public source reads internal research (observations / benchmark / readiness / attachment)", () => {
  const files = [...walk(path.join(app, "src/app")), ...walk(path.join(app, "src/components"))];
  const bad = /data\/internal|research-observations|research-progress|forward-attachment|feature-attachment|market-capture-reliability|capture-window-health|simulation-readiness|mlb-research-benchmark/;
  const leaks = files.filter((f) => bad.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(leaks.map((f) => path.relative(app, f)), [], "no public route references internal research artifacts");
});

test("4 · the exportable social content is INTERNAL + framed as analytics, not betting advice", () => {
  const script = fs.readFileSync(path.join(app, "scripts/build-mlb-social-content.mjs"), "utf8");
  assert.match(script, /data\/internal\/mlb\/social/, "social content is written INTERNALLY (not served publicly)");
  assert.match(script, /notBettingAdvice:\s*true/, "artifact is flagged not-betting-advice");
  // the social builder must NOT emit betting-recommendation vocabulary in its output field names/values
  assert.ok(!/edgePct\s*:|"edge"\s*:|bestBet|isLock/.test(script), "no edge/lock/best-bet in the social output shape");
});

test("4b · the daily social PACK (drafts + share card) is INTERNAL + not-advice, and the built pack has no forbidden vocab", async () => {
  const script = fs.readFileSync(path.join(app, "scripts/build-mlb-social-pack.mjs"), "utf8");
  assert.match(script, /data\/internal\/mlb\/social/, "the pack is written INTERNALLY (not served publicly)");
  assert.match(script, /DRAFTS ONLY|never auto-posted/, "the pack is drafts-only — nothing auto-posted");
  assert.match(script, /notBettingAdvice:\s*true/, "the pack is flagged not-betting-advice");
  assert.ok(!/edgePct\s*:|"edge"\s*:|bestBet|isLock/.test(script), "no edge/lock/best-bet in the pack output shape");
  // build the pack from synthetic inputs and scan the WHOLE thing (drafts + share card + sections) for the
  // task-forbidden vocabulary — the acquisition loop must never read as a betting recommendation.
  const { buildSocialContent } = await import("../../scripts/build-mlb-social-content.mjs");
  const { buildSocialPack } = await import("../../scripts/build-mlb-social-pack.mjs");
  const g = {
    gameId: "g1", gamePk: 1, slug: "aa-vs-bb-2026-07-22", teams: { home: "Bb", away: "Aa" }, status: "ready",
    marketSnapshot: { capturedAt: "2026-07-22T15:00:00Z" }, simulationSummary: { headline: "Close." },
    distributions: { "pitcher_strikeouts__1__6.5": { label: "Aa Pitcher — Strikeouts (line 6.5)", sampleCount: 100, bins: [{ lowerEdge: 3, probability: 0.5 }, { lowerEdge: 8, probability: 0.5 }] } },
    generatedPicks: [{ player: "Aa Bat", market: "batter_hits", side: "over", line: 1.5, modelProbability: 0.6, marketProbability: 0.45 }],
  };
  const content = buildSocialContent({ runCount: 10000, generatedAt: "2026-07-22T19:00:00Z", games: [g] }, { games: { g1: { commenceTime: "2026-07-22T23:05:00Z" } } }, "2026-07-22");
  const pack = buildSocialPack(content, { date: "2026-07-21", decisive: 10, wins: 4, losses: 6, hitRate: 0.4 }, "2026-07-22");
  const { forbiddenTerms, ...scanable } = pack; void forbiddenTerms;
  const s = JSON.stringify(scanable).toLowerCase();
  for (const t of ["best bet", "beat the market", "market mistake"]) assert.ok(!s.includes(t), `pack must not contain "${t}"`);
  for (const t of ["edge", "value", "lock", "profitable", "guaranteed"]) assert.ok(!new RegExp(`\\b${t}\\b`).test(s), `pack must not contain word "${t}"`);
  assert.equal(pack.public, false); assert.equal(pack.notBettingAdvice, true);
});

test("5 · the deterministic simulator stays producesPredictions:false (no model shipped)", () => {
  const contract = fs.readFileSync(path.join(app, "src/lib/mlb/simulation/simulation-feature-contract.ts"), "utf8");
  assert.match(contract, /producesPredictions:\s*false/, "producesPredictions stays false until the gate + approval");
});
