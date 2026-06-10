// Read-only: select the canonical Builder Pick from a date's PRE-GAME snapshot using
// the SAME selector the site uses, then grade it from the settled graded file. No
// reimplementation, no fabrication. Usage: npx tsx scripts/verify-bank-builder.mjs 2026-06-09
import fs from "node:fs";
import path from "node:path";
import { selectPlus100BuilderSlip } from "../src/lib/parlay-suggested.ts";
import { filterOfficialSuggestedSlips } from "../src/lib/sport-capabilities.ts";

const date = process.argv[2] || "2026-06-09";
const root = path.join(process.cwd(), "public", "data", "parlays");
const snap = JSON.parse(fs.readFileSync(path.join(root, "snapshots", `${date}.json`), "utf-8"));
const grad = JSON.parse(fs.readFileSync(path.join(root, "graded", `${date}.json`), "utf-8"));

const officialPending = filterOfficialSuggestedSlips(snap.slips ?? []);
const pick = selectPlus100BuilderSlip(officialPending);
if (!pick) {
  console.log(JSON.stringify({ date, qualifyingBuilderPick: false, reason: "no slip in +100 band" }));
  process.exit(0);
}
const slipId = pick.slip.slipId;
const graded = (grad.slips ?? []).find((s) => s.slipId === slipId);
const legResults = (graded?.legs ?? []).map((l) => ({
  player: l.playerName, market: l.market, side: l.side, line: l.line,
  odds: l.oddsForSide, result: l.result, finalStat: l.finalStat, source: l.settlementSource,
}));
const slipResult = graded?.status ?? "pending";
console.log(JSON.stringify({
  date, qualifyingBuilderPick: true, slipId, riskProfile: pick.slip.riskProfile,
  combinedAmerican: pick.combinedAmerican, combinedDecimal: pick.combinedDecimal,
  legCount: (pick.slip.legs ?? []).length, slipResult,
  allLegsResolved: legResults.every((l) => l.result === "win" || l.result === "loss" || l.result === "push"),
  legResults,
}, null, 2));
