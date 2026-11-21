/**
 * NFL leg candidates for the scenario builder — PURE. Shared by the /nfl/builder page and scripts/nfl/audit-leg-screen.mjs
 * (through builder-inputs.mjs) so both count the same.
 *
 * LINES — the canonical rule only: `linesByEvent[eventId]` is nflEvidenceLines over THE rule's rows for that game
 * (line-display-open.mjs nflOpenLineRecords: switch on AND a readable artifact), selected at the build instant exactly
 * as the game page's line section selects them. A game whose rule is closed (null / absent) supplies NO candidate at
 * all — no leg and no refusal row. The public board's offer slot is never read. A leg's line, price, book and capture
 * time all come from the same chosen artifact row (the price is that row's own over / under price; none ⇒ null,
 * never inferred).
 * PROJECTION — `official` is true only when the board family is PUBLISHED AND the game page shows an official
 * (non-estimate) projection for the player in it (`projectionsByEvent[eventId]` = evidenceProjections(gameTabs(view)),
 * the page's own accessor).
 * Only games that have not kicked off at `now` (the build instant) supply candidates. Over/under families only:
 * anytime touchdown is never a candidate (no line, so no refusal row either).
 */
import { FAMILY_STAT } from "./player-evidence.mjs";

/** Boards that have not kicked off at `now` (unreadable kickoff or now ⇒ excluded, fail closed). Same rule as Trends. */
export function upcomingBoards(boards, now) {
  const t = Date.parse(now ?? "");
  return (boards ?? []).filter((b) => Number.isFinite(t) && Number.isFinite(Date.parse(b?.kickoffUtc ?? "")) && Date.parse(b.kickoffUtc) > t);
}

/**
 * @param {{ boards: any[], evidenceByEvent: Record<string, any>, now?: string,
 *   linesByEvent?: Record<string, Record<string, any> | null>, projectionsByEvent?: Record<string, Record<string, Record<string, any>>> }} input
 */
export function legCandidates({ boards, evidenceByEvent, now, linesByEvent = {}, projectionsByEvent = {} }) {
  const out = [];
  for (const b of upcomingBoards(boards, now)) {
    const id = String(b.providerEventId);
    const lines = linesByEvent?.[id] ?? null;
    if (!lines) continue; // the rule is closed for this game: nothing about it, not even a refusal
    const ev = evidenceByEvent[id] ?? {};
    const proj = projectionsByEvent?.[id] ?? {};
    for (const p of b.players ?? []) for (const fam of Object.keys(p.markets ?? {})) {
      /* anytime TD is not a builder leg: a yes/no price is not a line, and a 5-game record over a line does not apply */
      if (!FAMILY_STAT[fam] || fam === "anytime_td") continue;
      const pr = proj[p.playerId]?.[fam] ?? null;
      const official = b.families?.[fam]?.state === "PUBLISHED" && pr != null && !pr.estimate;
      const lv = lines[`${p.playerId}|${fam}`] ?? null;
      for (const side of ["over", "under"]) {
        const line = lv?.state === "OBSERVED"
          ? { line: lv.line, lineText: lv.lineText, price: (side === "under" ? lv.underPrice : lv.overPrice) ?? null, sportsbook: lv.book, label: lv.sportsbook, capturedAt: lv.capturedAt, captured: lv.captured }
          : null;
        out.push({ playerId: p.playerId, name: p.name ?? null, team: p.team, eventId: id, kickoffUtc: b.kickoffUtc ?? null, family: fam, side, official, line, lineState: lv?.state ?? "NO_LINE", eligibility: p.eligibility?.state ?? null, modelProbability: null, log: ev[p.playerId] ?? [] });
      }
    }
  }
  return out;
}

/** family-eligibility.json → { family: row } */
export const familiesFrom = (fe) => Object.fromEntries((Array.isArray(fe?.families) ? fe.families : Object.values(fe?.families ?? {})).map((f) => [f.family, f]));
