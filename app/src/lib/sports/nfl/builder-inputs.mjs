/**
 * THE /nfl/builder SLATE — BUILD TIME / SERVER ONLY (fs; reads the encrypted line artifact through the canonical rule).
 * One loader for the page (app/nfl/builder/page.tsx) and the read-only audit (scripts/nfl/audit-leg-screen.mjs), so
 * both count exactly the same legs and refusals.
 *
 *   boards       the committed player boards, through the same loader-boundary sanitiser as the game page, that the
 *                evidence file covers
 *   lines        per game: line-display-open.mjs nflOpenLineRecords (switch on AND a readable artifact) → evidence-line.mjs
 *                nflEvidenceLines at `asOf` (the build's one instant, buildAsOfIso — the game page's section, panel and
 *                Trends select at the same instant). Closed ⇒ null ⇒ the game supplies nothing.
 *   projections  per game: the game page's own accessor (loadForecastViews → gameTabs → evidenceProjections), so
 *                "official" means exactly what the page prints as official
 * Must run with cwd = app/ (nflOpenLineRecords reads relative to it, as the build does).
 */
import fs from "node:fs";
import path from "node:path";

import { familiesFrom, legCandidates, upcomingBoards } from "./leg-candidates.mjs";
import { screenLegs } from "./leg-screen.mjs";
import { readEvidenceFor } from "./player-evidence-file.mjs";
import { sanitizePlayerBoard } from "../odds/public-offer-sanitizer.mjs";
import { isEligibleProvider } from "../odds/eligible-operators.mjs";
import { nflOpenLineRecords } from "./line-display-open.mjs";
import { nflEvidenceLines } from "./evidence-line.mjs";
import { loadForecastViews } from "./forecast-view-load.mjs";
import { gameTabs } from "./forecast-view.mjs";
import { evidenceProjections } from "./evidence-projections.mjs";

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/**
 * @param {{ appRoot?: string, now: string }} opts  `now`: the build instant (buildAsOfIso)
 * @returns {{ candidates: any[], screen: ReturnType<typeof screenLegs>, slate: number, openGames: number }}
 */
export function loadBuilderSlate({ appRoot = process.cwd(), now }) {
  const dir = path.join(appRoot, "public/data/nfl/player-board");
  const root = path.join(appRoot, "..");
  const boards = [], evidenceByEvent = {}, linesByEvent = {}, projectionsByEvent = {};
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)); } catch { /* none */ }
  const upcoming = (b) => upcomingBoards([b], now).length === 1;
  let views = null;
  for (const f of files) {
    const b = sanitizePlayerBoard(read(path.join(dir, f)));
    if (!b) continue;
    const id = String(b.providerEventId);
    const ev = readEvidenceFor(root, id);
    if (!Object.keys(ev).length) continue;
    boards.push(b); evidenceByEvent[id] = ev;
    if (!upcoming(b)) continue;
    const rows = nflOpenLineRecords(id);
    linesByEvent[id] = rows ? nflEvidenceLines({ board: b, rows, asOf: now }) : null;
    if (rows) {
      views ??= new Map(loadForecastViews(path.join(appRoot, "public")).map((v) => [String(v.providerEventId), v]));
      const v = views.get(id);
      projectionsByEvent[id] = evidenceProjections(v ? gameTabs(v) : null);
    }
  }
  const families = familiesFrom(read(path.join(appRoot, "public/data/nfl/family-eligibility.json")));
  const candidates = legCandidates({ boards, evidenceByEvent, now, linesByEvent, projectionsByEvent });
  const screen = screenLegs(candidates, { families, isEligibleBook: isEligibleProvider });
  return { candidates, screen, slate: upcomingBoards(boards, now).length, openGames: Object.values(linesByEvent).filter(Boolean).length };
}
