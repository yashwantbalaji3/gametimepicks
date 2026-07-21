/**
 * freeze-mlb-pregame-research.mjs — create the canonical FINAL_PREGAME_FREEZE per event.
 *
 * Points to the latest RESEARCH-ELIGIBLE snapshot for each feature family, captured strictly before first pitch.
 * Immutable + internal. No snapshot captured after first pitch may enter the freeze. Unavailable families are
 * recorded as unavailable (never fabricated). This provides stable join identifiers for a LATER (separate,
 * founder-approved) settlement join — this script performs no modeling and no settlement.
 *
 * Run: node app/scripts/freeze-mlb-pregame-research.mjs [--date YYYY-MM-DD]
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const ARCHIVE = path.join(REPO, "data/internal/mlb/pregame-archive");
const args = process.argv.slice(2);
const DATE = (args.indexOf("--date") >= 0 && args[args.indexOf("--date") + 1]) || new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const FAMILIES = ["confirmed_lineup", "pitcher_status", "bullpen", "plate_appearance_opportunity", "markets", "environment", "umpire"];

function main() {
  const snapDir = path.join(ARCHIVE, "snapshots", DATE);
  if (!fs.existsSync(snapDir)) { console.log(`no snapshots for ${DATE}`); return; }
  const snaps = fs.readdirSync(snapDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(snapDir, f), "utf8")));
  // group by gamePk; for each, pick the latest ELIGIBLE snapshot per family (captured strictly before first pitch)
  const byGame = new Map();
  for (const s of snaps) { if (!byGame.has(s.gamePk)) byGame.set(s.gamePk, []); byGame.get(s.gamePk).push(s); }

  fs.mkdirSync(path.join(ARCHIVE, "freezes", DATE), { recursive: true });
  const freezes = [];
  for (const [gamePk, list] of byGame) {
    const eventStartTime = list[0].eventStartTime;
    // only snapshots captured strictly before first pitch may seed the freeze
    const pregame = list.filter((s) => eventStartTime && Date.parse(s.snapshotCreatedAt) < Date.parse(eventStartTime)).sort((a, b) => a.snapshotCreatedAt.localeCompare(b.snapshotCreatedAt));
    const featureEligibility = {};
    for (const fam of FAMILIES) {
      let chosen = null;
      for (const s of pregame) { const fr = (s.featureFamilies || []).find((x) => x.family === fam && x.researchEligible); if (fr) chosen = { snapshotId: s.snapshotId, capturedAt: s.snapshotCreatedAt }; }
      featureEligibility[fam] = chosen ? { available: true, ...chosen } : { available: false, reason: "no eligible pregame snapshot" };
    }
    const freeze = {
      public: false, approvedForProduction: false, productEligible: false,
      schemaVersion: "mlb-pregame-archive-1", snapshotReason: "FINAL_PREGAME_FREEZE", eventId: String(gamePk), gamePk,
      eventStartTime, boardDateEt: DATE, freezeCreatedAt: nowIso(),
      featureEligibility,
      coverageSummary: { eligibleFamilies: FAMILIES.filter((f) => featureEligibility[f].available), pregameSnapshotCount: pregame.length },
      // stable join identifiers for a LATER settlement join (separate mission) — no settlement performed here
      joinKeys: { eventId: String(gamePk), gamePk, boardDateEt: DATE },
    };
    fs.writeFileSync(path.join(ARCHIVE, "freezes", DATE, `${gamePk}.json`), JSON.stringify(freeze, null, 2));
    freezes.push(freeze);
  }
  const cov = {};
  for (const f of freezes) for (const fam of f.coverageSummary.eligibleFamilies) cov[fam] = (cov[fam] || 0) + 1;
  console.log(`\n=== FINAL_PREGAME_FREEZE ${DATE} — ${freezes.length} events ===`);
  console.log(`eligible-family coverage across freezes:`, JSON.stringify(cov));
  console.log(`freezes → ${path.relative(REPO, path.join(ARCHIVE, "freezes", DATE))}/`);
}
main();
