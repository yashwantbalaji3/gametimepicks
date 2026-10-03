/**
 * NFL player-board candidates for a product date — the one loader (Session 7).
 *
 * The rules are the ones `scripts/ops/sunday-candidate-universe.mjs` established, moved here so the
 * daily universe and the Sunday ops command cannot disagree:
 *   · family state from nfl/model-status.json (anytime TD sits outside playerFamilies and is just as binding);
 *   · settlement support is a TRI-STATE derived from the canonical prop-settlement LEDGER (PROVEN needs a
 *     CI-admitted canonical graded row of that family) and whether the post-final sweep is SCHEDULED
 *     (Session 9 — lib/sports/nfl/prop-settlement-support.mjs; "a workflow mentions the settler" is gone);
 *   · a probability exists only where the board publishes one; a distribution is its own basis.
 * Reads committed files only.
 */
import fs from "node:fs";
import path from "node:path";
import { candidatesFromNflBoard } from "../eligible-leg/from-nfl-board.mjs";
import { SETTLEMENT_SUPPORT } from "../candidate-universe.mjs";
import { readSettlementSupport } from "../../sports/nfl/prop-settlement-support.mjs";

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** ET calendar date of an instant — product dates are ET dates (a 00:15Z kickoff is the previous ET day). */
export function etDateOf(iso) {
  const t = Date.parse(iso ?? ""); if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}


/**
 * @param {{ dataRoot: string, workflowsDir: string, settlementDir?: string, date?: string|null, boardFilter?: (b)=>boolean }} o
 * @returns {{ boards: object[], candidates: object[], familyState: Map, unknownFamilies: string[] }}
 */
export function loadNflBoardCandidates({ dataRoot, workflowsDir, settlementDir = null, date = null, boardFilter = null }) {
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

  // The ledger lives in the repo's data/internal tree, beside .github/ — derived from workflowsDir when not given.
  const ledgerDir = settlementDir ?? (workflowsDir ? path.resolve(workflowsDir, "..", "..", "data/internal/nfl/prop-settlement") : null);
  const support = readSettlementSupport({ ledgerDir, workflowsDir });
  const settlementSupportFor = (fam) => SETTLEMENT_SUPPORT[support.supportFor(fam)] ?? SETTLEMENT_SUPPORT.UNSUPPORTED;
  const probabilityBasisFor = ({ projection, probability }) =>
    probability != null ? "MODEL_PUBLISHED" : projection != null ? "MODEL_DISTRIBUTION_UNCONVERTED" : "NONE";
  /* The model that produced a board's number is the BOARD's own record (Session 8): a share-level family names
     its `model`; the anytime-TD v1 engine names itself in its basis. model-status.json is the fallback — it has
     no entry for anytime TD, which is how every ATD receipt came out with modelVersion null. */
  const modelVersionFor = (fam, board) => {
    const f = board?.families?.[fam];
    if (f?.model) return f.model;
    const named = /^([a-z0-9-]+-v\d+)\b/i.exec(String(f?.basis ?? ""))?.[1];
    if (named) return named;
    return (status?.playerFamilies ?? []).find((x) => x.key === fam)?.modelId ?? null;
  };

  const candidates = []; const unknown = new Set();
  for (const b of boards) {
    const r = candidatesFromNflBoard(b, { familyState, settlementSupportFor, probabilityBasisFor, modelVersionFor });
    candidates.push(...r.candidates);
    for (const u of r.unknownFamilies) unknown.add(u);
  }
  return { boards, candidates, familyState, unknownFamilies: [...unknown], settlementSupport: { provenFamilies: support.provenFamilies, scheduled: support.scheduled, evidence: support.evidence } };
}
