/**
 * NFL TRENDS rows (founder directive 2026-11-15, P2) — PURE. One row per (upcoming game, player, published market):
 * the player's actual last-5 results, the last-5 / last-10 medians, the official projection, and the observed-line state.
 *
 * Every board player is included, not just the model's top projections: discovery covers role players too.
 * Descriptive only. `vsProjection` is (last-5 median − official median): a fact about recent games versus the model,
 * never a probability, a pick or an edge. A line-based record appears only where an observed line exists (lineRecord).
 */
import { FAMILY_STAT, lineRecord, summary, trendTier, valueOf } from "./player-evidence.mjs";

export const TREND_FAMILIES = ["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions", "anytime_td"];

export function buildTrendRows({ boards, evidenceByEvent }) {
  const rows = [];
  for (const b of boards) {
    const ev = evidenceByEvent[String(b.providerEventId)] ?? {};
    const [away, home] = String(b.matchup ?? "").split(" @ ");
    for (const p of b.players ?? []) {
      const log = ev[p.playerId];
      if (!log) continue;
      for (const fam of TREND_FAMILIES) {
        const m = p.markets?.[fam];
        if (!m || b.families?.[fam]?.state !== "PUBLISHED") continue;
        const s5 = summary(log, fam, 5), s10 = summary(log, fam, 10);
        const line = m.market?.line != null ? { line: m.market.line, sportsbook: m.market.sportsbook, capturedAt: m.market.capturedAt } : null;
        const rec = lineRecord(log, fam, 5, { line });
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
          lineState: rec.state, badge: rec.badge ?? null, tier: trendTier(rec),
        });
      }
    }
  }
  return rows.sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc) || a.eventId.localeCompare(b.eventId) || a.name.localeCompare(b.name) || a.family.localeCompare(b.family));
}
