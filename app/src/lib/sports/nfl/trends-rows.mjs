/**
 * NFL TRENDS rows (founder directive 2026-11-15, P2) — PURE. One row per (upcoming game, player, published market):
 * the player's actual last-5 results, the last-5 / last-10 medians, the official projection, and the observed-line state.
 *
 * Every board player is included, not just the model's top projections: discovery covers role players too.
 * Descriptive only. `vsProjection` is (last-5 median − official median): a fact about recent games versus the model,
 * never a probability, a pick or an edge. A line-based record appears only where an OBSERVED line exists — the line the
 * game page's line section displays for that player and family (evidence-line.mjs nflEvidenceLines over the game's OPEN
 * line rows) — and the row carries that line's caption (line text, book label, ET quote time) and its push count.
 *
 * UPCOMING ONLY: a game whose kickoff is at or before `now` (the build instant) is not this week's board, so it is not a
 * row here; its history stays on its own game page under the frozen/settled-page rules. Boards are sanitised here too
 * (public-offer-sanitizer.mjs), so an ineligible operator's line can never produce a record.
 *
 * LINES (per game): `linesByEvent[eventId]` is nflEvidenceLines of that game's OPEN rows (line-display-open.mjs: switch
 * on AND a readable artifact), or null/absent when the rule is closed (the default: fail closed). The public board's
 * offer slot is never read. A closed game's rows — and any row whose pair the section does not cover (anytime TD, a
 * non-PUBLISHED family) — carry lineState / line / badge / tier / pushes = null: nothing about a line, a book or a
 * record reaches the row (and so the client payload).
 */
import { FAMILY_STAT, lineRecord, summary, trendTier, valueOf } from "./player-evidence.mjs";
import { lineCaption } from "./evidence-line.mjs";
import { sanitizePlayerBoard } from "../odds/public-offer-sanitizer.mjs";

export const TREND_FAMILIES = ["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions", "anytime_td"];

/** Boards that have not kicked off at `now` (unreadable kickoff or now ⇒ excluded, fail closed). */
export function upcomingBoards(boards, now) {
  const t = Date.parse(now ?? "");
  return (boards ?? []).filter((b) => Number.isFinite(t) && Number.isFinite(Date.parse(b?.kickoffUtc ?? "")) && Date.parse(b.kickoffUtc) > t);
}

/** @param {{ boards: any[], evidenceByEvent: Record<string, any>, now?: string, linesByEvent?: Record<string, Record<string, any> | null> }} a */
export function buildTrendRows({ boards, evidenceByEvent, now, linesByEvent = {} }) {
  const rows = [];
  for (const raw of upcomingBoards(boards, now)) {
    const b = sanitizePlayerBoard(raw);
    const ev = evidenceByEvent[String(b.providerEventId)] ?? {};
    const [away, home] = String(b.matchup ?? "").split(" @ ");
    const lines = linesByEvent?.[String(b.providerEventId)] ?? null;
    for (const p of b.players ?? []) {
      const log = ev[p.playerId];
      if (!log) continue;
      for (const fam of TREND_FAMILIES) {
        const m = p.markets?.[fam];
        if (!m || b.families?.[fam]?.state !== "PUBLISHED") continue;
        const s5 = summary(log, fam, 5), s10 = summary(log, fam, 10);
        const lv = lines ? lines[`${p.playerId}|${fam}`] ?? null : null;
        const rec = lv ? lineRecord(log, fam, 5, { line: lv.state === "OBSERVED" ? { line: lv.line, sportsbook: lv.sportsbook, capturedAt: lv.capturedAt } : null }) : null;
        const isTd = fam === "anytime_td";
        rows.push({
          eventId: String(b.providerEventId), kickoffUtc: b.kickoffUtc, matchup: b.matchup, opponent: p.team === home ? away : home,
          playerId: p.playerId, name: p.name, team: p.team, eligibility: p.eligibility?.state ?? null,
          family: fam, label: FAMILY_STAT[fam].label,
          last5: log.slice(0, 5).map((e) => valueOf(e, fam)),
          games5: s5.games, recorded5: s5.recorded, noStatLine5: s5.noStatLine,
          median5: s5.median, median10: s10.median, games10: s10.games,
          tdGames5: isTd ? s5.values.filter((v) => v != null && v > 0).length : null,
          projection: isTd ? null : m.median ?? null, probability: isTd ? m.probability ?? null : null,
          vsProjection: !isTd && s5.median != null && m.median != null && s5.recorded === 5 ? Math.round((s5.median - m.median) * 10) / 10 : null,
          /* null (line gate closed for this game) | NO_LINE | WITHHELD | NOT_BEFORE_KICKOFF, or (observed) COMPLETE | INCOMPLETE | SHORT_SAMPLE */
          lineState: !lv || !rec ? null : lv.state === "OBSERVED" ? rec.state : lv.state,
          line: lv ? lineCaption(lv) : null,
          /* the caption's parts (trends-wire.mjs packs them separately; never rendered from here) */
          lineParts: lv && lv.state === "OBSERVED" ? [lv.lineText ?? String(lv.line), lv.sportsbook, lv.captured] : null,
          badge: lv && rec && lv.state === "OBSERVED" ? rec.badge ?? null : null,
          tier: lv && rec && lv.state === "OBSERVED" ? trendTier(rec) : null,
          pushes: lv && rec && lv.state === "OBSERVED" ? rec.pushes ?? 0 : null,
        });
      }
    }
  }
  return rows.sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc) || a.eventId.localeCompare(b.eventId) || a.name.localeCompare(b.name) || a.family.localeCompare(b.family));
}

/** Rows whose line is observed (a record against it may be shown). */
export const OBSERVED_LINE_STATES = Object.freeze(["COMPLETE", "INCOMPLETE", "SHORT_SAMPLE"]);
