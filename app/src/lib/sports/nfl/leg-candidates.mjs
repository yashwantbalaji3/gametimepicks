/**
 * NFL leg candidates for the scenario builder — PURE. Every (player, projected family, side) on the given boards becomes
 * a candidate carrying ONLY observed market data (the board's captured line and price; none ⇒ line null) and the
 * player's evidence log, and the game's kickoff (the screen refuses a line not captured before it). Shared by the /nfl/builder page and scripts/nfl/audit-leg-screen.mjs so both count the same.
 */
import { FAMILY_STAT } from "./player-evidence.mjs";

/** Boards that have not kicked off at `now` (unreadable kickoff or now ⇒ excluded, fail closed). Same rule as Trends. */
export function upcomingBoards(boards, now) {
  const t = Date.parse(now ?? "");
  return (boards ?? []).filter((b) => Number.isFinite(t) && Number.isFinite(Date.parse(b?.kickoffUtc ?? "")) && Date.parse(b.kickoffUtc) > t);
}

/** Only boards that have not kicked off at `now` (the build instant) supply candidates: a played game never supplies a leg. */
export function legCandidates({ boards, evidenceByEvent, now }) {
  const out = [];
  for (const b of upcomingBoards(boards, now)) {
    const ev = evidenceByEvent[String(b.providerEventId)] ?? {};
    for (const p of b.players ?? []) for (const [fam, m] of Object.entries(p.markets ?? {})) {
      if (!FAMILY_STAT[fam]) continue;
      const mk = m.market ?? null;
      const base = mk?.line != null ? { line: mk.line, sportsbook: mk.sportsbook, capturedAt: mk.capturedAt } : null;
      for (const side of fam === "anytime_td" ? ["over"] : ["over", "under"]) {
        const price = side === "under" ? mk?.underOdds ?? null : mk?.overOdds ?? mk?.yesOdds ?? null;
        out.push({ playerId: p.playerId, name: p.name ?? null, team: p.team, eventId: String(b.providerEventId), kickoffUtc: b.kickoffUtc ?? null, family: fam, side, line: base ? { ...base, price } : null, eligibility: p.eligibility?.state ?? null, modelProbability: fam === "anytime_td" ? m.probability ?? null : null, log: ev[p.playerId] ?? [] });
      }
    }
  }
  return out;
}

/** family-eligibility.json → { family: row } */
export const familiesFrom = (fe) => Object.fromEntries((Array.isArray(fe?.families) ? fe.families : Object.values(fe?.families ?? {})).map((f) => [f.family, f]));
