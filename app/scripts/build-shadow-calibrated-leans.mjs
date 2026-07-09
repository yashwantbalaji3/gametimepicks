/**
 * build-shadow-calibrated-leans.mjs — compute an UNWIRED, INTERNAL-ONLY shadow-calibrated column for
 * the current MLB board, side-by-side with the live values. For development + founder review only.
 *
 * For each board lean it blends the model probability toward the de-vigged market by the market's
 * LEARNED reliability (from shadow-calibration/latest.json), using the pure lib/calibration blend, and
 * derives a conservative shadow tier. Because most MLB markets are historically ≈ coin flip or worse,
 * most shadow tiers come out no-play/watch — which is the correct, conservative behavior (defer to the
 * market where the model has not earned trust). Raw edges in the proven anti-calibrated zone (≥20pp)
 * are forced to no-play.
 *
 * Output (repo-root data/internal — NOT under app/public, so the static export never serves it):
 *   data/internal/mlb/shadow-calibrated-leans/<date>.json
 *
 * This does NOT replace live confidence, is NOT rendered on any consumer page, and is NOT used in
 * product-card generation (enforced by shadow-calibration.test.mjs). It never touches money.
 *
 * Usage:  npx tsx scripts/build-shadow-calibrated-leans.mjs [--date 2026-07-09] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { calibrate } from "../src/lib/calibration/index.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const SHADOW = path.join(APP, "public", "data", "mlb", "results", "shadow-calibration", "latest.json");
const OUT_DIR = path.join(REPO, "data", "internal", "mlb", "shadow-calibrated-leans");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();

/** Latest committed board date, or the requested one. */
function pickDate() {
  if (DATE) return DATE;
  const files = fs.readdirSync(BOARDS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}

/** market → learned historicalReliability in [0,1] from the shadow-calibration artifact. */
function reliabilityByMarket() {
  if (!fs.existsSync(SHADOW)) return new Map();
  const s = JSON.parse(fs.readFileSync(SHADOW, "utf8"));
  return new Map((s.byMarket || []).map((m) => [m.market, m.reliabilityWeight]));
}

/** samples (recent games behind the projection) → data-quality tier for the blend. */
function dataQualityFromSamples(n) {
  if (typeof n !== "number" || n <= 0) return "unavailable";
  if (n >= 10) return "high";
  if (n >= 5) return "medium";
  return "thin";
}

function shadowTier(shadowEdgePp, reliability, dataQuality, rawEdgePp) {
  // The proven anti-calibrated zone: raw claimed edge ≥ 20pp historically hits ~44% — never a pick.
  if (typeof rawEdgePp === "number" && rawEdgePp >= 20) return "no-play";
  if (dataQuality === "unavailable" || reliability <= 0.3) return "no-play";
  if (shadowEdgePp <= 0) return "no-play";
  // lean/strong require a market the model is actually trustworthy on (reliability ≥ 0.5). A
  // net-negative or coin-flip market can never exceed "watch", no matter the blended edge.
  if (reliability < 0.5) return "watch";
  if (shadowEdgePp >= 3 && reliability >= 0.55 && dataQuality === "high") return "strong";
  if (shadowEdgePp >= 1.5) return "lean";
  return "watch";
}

function reasonCodes(m, rel, dq, rawEdge, shadowEdge) {
  const codes = [];
  if (typeof rawEdge === "number" && rawEdge >= 20) codes.push("edge-anti-calibrated-zone");
  if (rel >= 0.55) codes.push("reliable-market");
  else if (rel <= 0.4) codes.push("net-negative-market");
  if (dq === "unavailable" || dq === "thin") codes.push("insufficient-history");
  if (Math.abs(shadowEdge) < 0.5) codes.push("shadow-agrees-market");
  if (!codes.length) codes.push("blended");
  return codes;
}

function main() {
  const date = pickDate();
  if (!date) { console.error("[shadow-leans] no board found"); process.exit(1); }
  const boardPath = path.join(BOARDS, `${date}.json`);
  if (!fs.existsSync(boardPath)) { console.error(`[shadow-leans] no board for ${date}`); process.exit(1); }
  const board = JSON.parse(fs.readFileSync(boardPath, "utf8"));
  const relMap = reliabilityByMarket();

  const leans = [];
  const tierCounts = { "no-play": 0, watch: 0, lean: 0, strong: 0 };
  for (const l of board.leans || []) {
    const over = l.lean === "Over";
    const modelProb = over ? l.modelProbOver : l.modelProbUnder;
    const rawEdge = over ? l.edgePctOver : l.edgePctUnder; // pp
    const marketProb = (typeof modelProb === "number" && typeof rawEdge === "number") ? modelProb - rawEdge / 100 : null;
    const rel = relMap.get(l.marketKey) ?? 0.3; // unknown market ⇒ insufficient-history default
    const dq = dataQualityFromSamples(l.samples);

    let shadowProb = null, shadowEdge = null, tier = "no-play", codes = ["insufficient-market-probability"];
    if (marketProb != null && typeof modelProb === "number") {
      const r = calibrate({ marketProbability: marketProb, modelProbability: modelProb, marketType: l.marketKey, sport: "MLB", historicalReliability: rel, dataQuality: dq });
      shadowProb = Number(r.calibratedProbability.toFixed(4));
      shadowEdge = Number((r.edge * 100).toFixed(2)); // = reliabilityWeight × rawEdge
      tier = shadowTier(shadowEdge, rel, dq, rawEdge);
      codes = reasonCodes(l.marketKey, rel, dq, rawEdge, shadowEdge);
    }
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
    leans.push({
      gameId: l.gameId ?? (l.gamePk != null ? String(l.gamePk) : null),
      market: l.marketKey,
      selection: [l.marketLabel, l.lean, l.line].filter((x) => x != null).join(" "),
      line: typeof l.line === "number" ? l.line : null,
      currentConfidence: l.confidence ?? null,
      currentEdgePct: typeof rawEdge === "number" ? Number(rawEdge.toFixed(2)) : null,
      currentModelProbability: typeof modelProb === "number" ? Number(modelProb.toFixed(4)) : null,
      marketProbability: marketProb != null ? Number(marketProb.toFixed(4)) : null,
      historicalReliabilityWeight: rel,
      shadowCalibratedProbability: shadowProb,
      shadowEdgePct: shadowEdge,
      shadowTier: tier,
      reasonCodes: codes,
    });
  }

  const out = {
    sport: "MLB",
    kind: "shadow-calibrated-leans",
    public: false,
    internal: true,
    date,
    generatedFrom: { board: `boards/${date}.json`, reliability: "results/shadow-calibration/latest.json" },
    leanCount: leans.length,
    tierCounts,
    leans,
    note: "INTERNAL/DEV shadow-calibrated column — NOT live confidence, NOT public, NOT used in product-card generation. Most tiers are no-play/watch because most MLB markets are historically ≈ coin flip; that is the correct conservative behavior.",
  };

  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[shadow-leans] ${WRITE ? "WROTE" : "DRY-RUN"} data/internal/mlb/shadow-calibrated-leans/${date}.json · ${leans.length} leans · tiers ${JSON.stringify(tierCounts)}`);
  if (!WRITE) console.log("  (dry run — pass --write to persist)");
}

main();
