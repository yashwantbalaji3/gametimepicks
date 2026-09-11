/**
 * nflverse → our NFL research tables (P257 · free data). Pure, so parsing, the id join and the de-vig are
 * unit-tested without a network. Data: nflverse (https://github.com/nflverse), CC BY 4.0 — attribution
 * travels with every derived file.
 *
 * WHY THESE TWO TABLES
 *   participation  observed offensive snap share per player-game (snap_counts). The NFL player families were
 *                  rejected (P182/P183) for lacking exactly this signal; ESPN gives a designation, not a share.
 *   game lines     the closing spread, total and moneylines for every game (nfldata games.csv) — a free market
 *                  benchmark for the NFL team model, as football-data.co.uk is for soccer. Weather/roof/surface
 *                  ride along for later research; nothing here is a model input until a preregistration says so.
 *
 * IDS: snap counts are keyed by Pro-Football-Reference id; our boards by ESPN id. players.csv carries both
 * (plus gsis_id), so every participation row is joined pfr → gsis → espn. A row that cannot be joined is
 * COUNTED and kept with null ids — never dropped silently, never guessed from a name.
 */

/** RFC-4180 CSV → array of objects keyed by header. Handles quoted fields, "" escapes and CRLF. */
export function parseCsv(text) {
  const s = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", i = 0, quoted = false;
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } quoted = false; i += 1; continue; }
      field += c; i += 1; continue;
    }
    if (c === '"') { quoted = true; i += 1; continue; }
    if (c === ",") { row.push(field); field = ""; i += 1; continue; }
    if (c === "\r") { i += 1; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }
    field += c; i += 1;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1 || (r[0] ?? "") !== "");
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, k) => [h, r[k] ?? ""])));
}

const num = (v) => (v === "" || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const decFromAmerican = (a) => (a == null ? null : a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

/** Two-way proportional de-vig from American moneylines → { home, away, overround } or null. */
export function devigMoneyline(homeMl, awayMl) {
  const h = decFromAmerican(num(homeMl)), a = decFromAmerican(num(awayMl));
  if (!h || !a || h <= 1 || a <= 1) return null;
  const ih = 1 / h, ia = 1 / a, s = ih + ia;
  return { home: Number((ih / s).toFixed(4)), away: Number((ia / s).toFixed(4)), overround: Number((s - 1).toFixed(4)) };
}

/** nfldata games.csv rows → our game-lines rows (completed or scheduled). */
export function buildGameLines(games, { fromSeason = 2022 } = {}) {
  return games
    .filter((g) => num(g.season) >= fromSeason && g.game_id)
    .map((g) => ({
      gameId: g.game_id, espnEventId: g.espn || null, season: num(g.season), gameType: g.game_type, week: num(g.week),
      gameday: g.gameday || null, home: g.home_team, away: g.away_team,
      final: num(g.home_score) != null && num(g.away_score) != null ? { home: num(g.home_score), away: num(g.away_score) } : null,
      close: {
        spreadHome: num(g.spread_line) == null ? null : -num(g.spread_line), // nflverse spread_line is the AWAY-perspective handicap; home line = −spread_line
        total: num(g.total_line),
        moneyline: devigMoneyline(g.home_moneyline, g.away_moneyline),
      },
      conditions: { roof: g.roof || null, surface: g.surface || null, tempF: num(g.temp), windMph: num(g.wind) },
    }));
}

/** players.csv rows → Map(pfr_id → { gsisId, espnId, name, position }). */
export function indexPlayersByPfr(players) {
  const m = new Map();
  for (const p of players) if (p.pfr_id) m.set(p.pfr_id, { gsisId: p.gsis_id || null, espnId: p.espn_id || null, name: p.display_name || null, position: p.position || null });
  return m;
}

/** snap_counts rows → participation rows (offense only), joined to gsis/espn; unjoined rows kept and counted. */
export function buildParticipation(snaps, byPfr) {
  const rows = [];
  let unjoined = 0;
  for (const s of snaps) {
    const off = num(s.offense_snaps);
    if (!off) continue; // offensive participation only; a defender's zero offensive snaps is not a data point here
    const id = byPfr.get(s.pfr_player_id) ?? null;
    if (!id?.espnId) unjoined += 1;
    rows.push({
      season: num(s.season), week: num(s.week), gameId: s.game_id, gameType: s.game_type, team: s.team, opponent: s.opponent,
      pfrId: s.pfr_player_id || null, gsisId: id?.gsisId ?? null, espnId: id?.espnId ?? null,
      name: s.player, position: s.position, offenseSnaps: off, offensePct: num(s.offense_pct),
    });
  }
  return { rows, unjoined };
}
