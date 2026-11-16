/**
 * NFL TRENDS rows (founder directive 2026-11-15, P2) — PURE. One row per (upcoming game, player, published market):
 * the player's actual last-5 results, the last-5 / last-10 medians, the official projection, and the observed-line state.
 *
 * Every board player is included, not just the model's top projections: discovery covers role players too.
 * Descriptive only. `vsProjection` is (last-5 median − official median): a fact about recent games versus the model,
 * never a probability, a pick or an edge. A line-based record appears only where an OBSERVED line exists
 * (evidence-line.mjs: line + eligible book + capture instant before kickoff), and the row carries that line's caption.
 *
 * UPCOMING ONLY: a game whose kickoff is at or before `now` (the build instant) is not this week's board, so it is not a
 * row here; its history stays on its own game page under the frozen/settled-page rules. Boards are sanitised here too
 * (public-offer-sanitizer.mjs), so an ineligible operator's line can never produce a record.
 *
 * LINE GATE (per game): `lineGate(eventId)` decides whether a game's rows may carry ANY line content. The page passes the
 * game page's own rule — NFL_LINE_DISPLAY.public AND a readable line artifact for that game (nflPublicLineRecords).
 * Default: closed (fail closed). A closed game's rows never read the offer slot: lineState / line / badge / tier are
 * null, so nothing about a line, a book or a record reaches the row (and so the client payload).
 */
import { FAMILY_STAT, lineRecord, summary, trendTier, valueOf } from "./player-evidence.mjs";
import { lineCaption, lineView } from "./evidence-line.mjs";
import { sanitizePlayerBoard } from "../odds/public-offer-sanitizer.mjs";

export const TREND_FAMILIES = ["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions", "anytime_td"];

/** Boards that have not kicked off at `now` (unreadable kickoff or now ⇒ excluded, fail closed). */
export function upcomingBoards(boards, now) {
  const t = Date.parse(now ?? "");
  return (boards ?? []).filter((b) => Number.isFinite(t) && Number.isFinite(Date.parse(b?.kickoffUtc ?? "")) && Date.parse(b.kickoffUtc) > t);
}

/** @param {{ boards: any[], evidenceByEvent: Record<string, any>, now?: string, lineGate?: (eventId: string) => boolean }} a */
export function buildTrendRows({ boards, evidenceByEvent, now, lineGate = () => false }) {
  const rows = [];
  for (const raw of upcomingBoards(boards, now)) {
    const b = sanitizePlayerBoard(raw);
    const ev = evidenceByEvent[String(b.providerEventId)] ?? {};
    const [away, home] = String(b.matchup ?? "").split(" @ ");
    const lines = lineGate(String(b.providerEventId)) === true;
    for (const p of b.players ?? []) {
      const log = ev[p.playerId];
      if (!log) continue;
      for (const fam of TREND_FAMILIES) {
        const m = p.markets?.[fam];
        if (!m || b.families?.[fam]?.state !== "PUBLISHED") continue;
        const s5 = summary(log, fam, 5), s10 = summary(log, fam, 10);
        const lv = lines ? lineView(m.market ?? null, b.kickoffUtc) : null;
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
          badge: lv && rec && lv.state === "OBSERVED" ? rec.badge ?? null : null,
          tier: lv && rec && lv.state === "OBSERVED" ? trendTier(rec) : null,
        });
      }
    }
  }
  return rows.sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc) || a.eventId.localeCompare(b.eventId) || a.name.localeCompare(b.name) || a.family.localeCompare(b.family));
}

/** Rows whose line is observed (a record against it may be shown). */
export const OBSERVED_LINE_STATES = Object.freeze(["COMPLETE", "INCOMPLETE", "SHORT_SAMPLE"]);
