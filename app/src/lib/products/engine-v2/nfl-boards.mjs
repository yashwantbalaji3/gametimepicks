/**
 * NFL player-board candidates for a product date — the one loader (Session 7).
 *
 * The rules are the ones `scripts/ops/sunday-candidate-universe.mjs` established, moved here so the
 * daily universe and the Sunday ops command cannot disagree:
 *   · family state from nfl/model-status.json (anytime TD sits outside playerFamilies and is just as binding);
 *   · settlement support is a TRI-STATE derived from the graded record and whether a settler is scheduled;
 *   · a probability exists only where the board publishes one; a distribution is its own basis.
 * Reads committed files only.
 */
import fs from "node:fs";
import path from "node:path";
import { candidatesFromNflBoard } from "../eligible-leg/from-nfl-board.mjs";
import { SETTLEMENT_SUPPORT } from "../candidate-universe.mjs";

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** ET calendar date of an instant — product dates are ET dates (a 00:15Z kickoff is the previous ET day). */
export function etDateOf(iso) {
  const t = Date.parse(iso ?? ""); if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

const FAMILY_TO_GRADED_LABEL = { player_rush_yds: "rush yards", player_reception_yds: "reception yards", player_receptions: "receptions", player_pass_yds: "pass yards", anytime_td: "anytime td" };

/**
 * @param {{ dataRoot: string, workflowsDir: string, date?: string|null, boardFilter?: (b)=>boolean }} o
 * @returns {{ boards: object[], candidates: object[], familyState: Map, unknownFamilies: string[] }}
 */
export function loadNflBoardCandidates({ dataRoot, workflowsDir, date = null, boardFilter = null }) {
  const status = read(path.join(dataRoot, "nfl/model-status.json"));
  const familyState = new Map((status?.playerFamilies ?? []).map((f) => [f.key, f.state]));
  if (status?.anytimeTd?.state) familyState.set("anytime_td", status.anytimeTd.state);

  const dir = path.join(dataRoot, "nfl/player-board");
  const boards = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .filter((f) => /^\d+\.json$/.test(f))
    .map((f) => read(path.join(dir, f)))
    .filter((b) => b?.artifact === "nfl-player-board")
    .filter((b) => (boardFilter ? boardFilter(b) : date ? etDateOf(b.kickoffUtc) === date : true))
    .sort((a, b) => String(a.kickoffUtc).localeCompare(String(b.kickoffUtc)));

  const graded = read(path.join(dataRoot, "nfl/graded-picks.json"));
  const gradedFamilies = new Set((Array.isArray(graded?.picks) ? graded.picks : []).map((r) => String(r.marketFamily ?? r.market ?? "").toLowerCase()).filter(Boolean));
  const settlerScheduled = fs.existsSync(workflowsDir) && fs.readdirSync(workflowsDir)
    .some((f) => fs.readFileSync(path.join(workflowsDir, f), "utf8").includes("settle-nfl-live-props.mjs"));
  const settlementSupportFor = (fam) => {
    const label = (FAMILY_TO_GRADED_LABEL[fam] ?? fam).toLowerCase();
    if (gradedFamilies.has(fam.toLowerCase()) || gradedFamilies.has(label)) return SETTLEMENT_SUPPORT.PROVEN;
    return settlerScheduled ? SETTLEMENT_SUPPORT.SCHEDULED_UNPROVEN : SETTLEMENT_SUPPORT.UNSUPPORTED;
  };
  const probabilityBasisFor = ({ projection, probability }) =>
    probability != null ? "MODEL_PUBLISHED" : projection != null ? "MODEL_DISTRIBUTION_UNCONVERTED" : "NONE";
  const modelVersionFor = (fam) => (status?.playerFamilies ?? []).find((f) => f.key === fam)?.modelId ?? null;

  const candidates = []; const unknown = new Set();
  for (const b of boards) {
    const r = candidatesFromNflBoard(b, { familyState, settlementSupportFor, probabilityBasisFor, modelVersionFor });
    candidates.push(...r.candidates);
    for (const u of r.unknownFamilies) unknown.add(u);
  }
  return { boards, candidates, familyState, unknownFamilies: [...unknown] };
}
