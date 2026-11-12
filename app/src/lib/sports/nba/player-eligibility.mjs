/**
 * NBA PLAYER ELIGIBILITY, one module for every public render (founder 2026-11-11): the website lane and the social cards
 * (Top 5 boards, per-game player cards) decide who may be featured with the same function. Pure; no I/O.
 *
 * A player is eligible for a stat when none of the existing exclusions applies, unchanged from the stat cards:
 *   MODEL_REVIEW_WITHHELD   the anomaly check flagged this player-stat (withheldKeys, "<id>.<stat>")
 *   R1[:status] / R2 / R3   the availability and plausibility guard (nba-unified-roster.mjs guardReasons)
 *   READINESS:<reason>      a readiness reason that hides the whole row (HIDE_ROW), or READINESS_ROW_HIDDEN
 *   READINESS_CELL:<stat>   a readiness reason on this stat only
 *   UNKNOWN_NOT_ASSESSED    an eligibility file was supplied but does not list the player
 * `elig` is the unified roster's __players map ({ id: { guard, status, hideAll, rowHide, hideCells } }); null means no
 * file was supplied, and then only the model-review withhold applies (callers that publish must supply it).
 *
 * Nothing here invents a row or changes a number: selection keeps the official order, refills from the next eligible
 * candidate, and reports fewer when fewer qualify. Reasons go to the audit for internal diagnostics, never onto a card.
 */
export const STATS = Object.freeze(["pts", "reb", "ast"]);
export const SUPPRESSED = "BOARD_SUPPRESSED_INSUFFICIENT_ELIGIBLE";

/** Why this player may not be featured for `stat` (empty = eligible). */
export function exclusionReasons(id, stat, { elig = null, withheld = new Set() } = {}) {
  const why = [];
  const key = String(id);
  if (withheld.has(`${key}.${stat}`)) why.push("MODEL_REVIEW_WITHHELD");
  if (elig) {
    const p = elig[key];
    if (!p) why.push("UNKNOWN_NOT_ASSESSED");
    else {
      for (const g of p.guard ?? []) why.push(g === "R1" && p.status ? `R1:${p.status}` : g);
      for (const x of p.rowHide ?? []) why.push(`READINESS:${x}`);
      if (p.hideAll && !(p.guard ?? []).length && !(p.rowHide ?? []).length) why.push("READINESS_ROW_HIDDEN");
      if ((p.hideCells ?? []).includes(stat)) why.push(`READINESS_CELL:${stat}`);
    }
  }
  return why;
}

/**
 * The first `size` eligible candidates of an official order (size Infinity: every eligible one). `idOf(row)` gives the
 * player id; `stats` are the stats the row prints (all must be eligible). Audit: every candidate looked at, in order.
 */
export function selectEligible(ordered, { stats, size = Infinity, elig = null, withheld = new Set(), idOf = (r) => r.providerAthleteId ?? r.id } = {}) {
  const rows = []; const audit = [];
  for (const r of ordered) {
    if (rows.length >= size) break;
    const id = String(idOf(r));
    const why = [...new Set(stats.flatMap((s) => exclusionReasons(id, s, { elig, withheld })))];
    audit.push({ rank: r.rank ?? null, playerId: id, name: r.name ?? null, team: r.team ?? null, value: r.value ?? null, eligible: !why.length, reasons: why });
    if (!why.length) rows.push(r);
  }
  return { rows, audit };
}

/** A Top 5 board: the first `size` eligible in official order, or suppressed with the count when fewer qualify. */
export function boardEligible(ordered, { stat, size = 5, elig = null, withheld = new Set() }) {
  const { rows, audit } = selectEligible(ordered, { stats: [stat], size, elig, withheld });
  return rows.length === size ? { state: "SHOWN", rows, audit } : { state: SUPPRESSED, eligible: rows.length, needed: size, rows: [], audit };
}

/**
 * One team's rows on a per-game card: the team's players in official order (projected minutes, then id), up to
 * `perTeam`, refilled from the next candidate. Founder 2026-11-11: a player with at least one valid stat stays, and only
 * the stats that are eligible print (`ok`); an invalid stat is an empty, neutral cell, never placeholder text. A player
 * with no valid stat is left off. Fewer qualifying players is a truthful smaller card.
 */
export function teamCardPlayers(players, { perTeam = 6, elig = null, withheld = new Set(), stats = STATS }) {
  const order = players.slice().sort((a, b) => (b.mins ?? -1) - (a.mins ?? -1) || String(a.id).localeCompare(String(b.id)));
  const rows = []; const audit = [];
  for (const r of order) {
    if (rows.length >= perTeam) break;
    const per = Object.fromEntries(stats.map((s) => [s, exclusionReasons(r.id, s, { elig, withheld })]));
    const ok = stats.filter((s) => !per[s].length);
    audit.push({ playerId: String(r.id), name: r.name ?? null, eligible: ok.length > 0, printed: ok, reasons: [...new Set(Object.values(per).flat())], byStat: per });
    if (ok.length) rows.push({ ...r, ok });
  }
  return { rows, audit };
}

/**
 * A verified prop line next to a projection, for when public display is authorized. `lines`: Map "<id>:<stat>" -> the
 * captured records for that player and stat, one per side: { playerId, market, line, side: "OVER"|"UNDER", american }.
 * Exact match only: the player id and stat must equal the cell's, both sides must quote the same line, and the side
 * shown is the one the arithmetic points to (projection above the line = OVER, green; below = UNDER, red). Equal is
 * neutral and shows the line without a price. A missing side record, a mismatched line or an unreadable price shows
 * nothing (fail closed). The image carries no book name and no time; provenance stays in package metadata.
 */
export function lineCell(lines, id, stat, projection) {
  const raw = lines?.get?.(`${id}:${stat}`);
  const recs = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((l) => String(l.playerId) === String(id) && l.market === stat);
  const proj = Number(projection);
  if (!recs.length || !Number.isFinite(proj)) return null;
  const line = Number(recs[0].line);
  if (!Number.isFinite(line) || recs.some((l) => Number(l.line) !== line)) return null;
  const cls = proj > line ? "over" : proj < line ? "under" : "neutral";
  if (cls === "neutral") return { cls, glyph: "", text: `Line ${line}`, line, side: null, american: null };
  const side = cls === "over" ? "OVER" : "UNDER";
  const rec = recs.find((l) => String(l.side).toUpperCase() === side);
  const american = String(rec?.american ?? "").replace(/\u2212/g, "-");
  if (!rec || !/^[+-]\d{3,4}$/.test(american)) return null;
  return { cls, glyph: cls === "over" ? "▲" : "▼", text: `${side === "OVER" ? "O" : "U"} ${line} ${american}`, line, side, american };
}

/** Captured prop rows (already decrypted and normalized by the capture reader) into lineCell's map; same shape. */
export function linesMap(records) {
  const m = new Map();
  for (const r of records ?? []) { const k = `${r.playerId}:${r.market}`; m.set(k, [...(m.get(k) ?? []), { playerId: String(r.playerId), market: r.market, line: r.line, side: r.side, american: r.american }]); }
  return m;
}

/**
 * Prop capture → lineCell records (built against a FIXTURE; no real capture is wired). Capture shape as the moneyline
 * captures: { fetchedAt, events: [{ id, bookmakers: [{ key, markets: [{ key, last_update, outcomes: [{ name: "Over"|"Under",
 * description: <player name>, point, price }] }] }] }] }. `games`: { <captureEventId>: { tipUtc, players: [{ id, name }] } }
 * (the lane's event, both teams). Exact or nothing: the player name must match exactly one lane player of that event
 * (case, accents and punctuation folded); one Over and one Under at the same point, both with integer American prices;
 * quoted before the fetch and before tip. The first book in `books` with a complete pair is used for that player-stat.
 * Book and quote time go to `provenance` only (package metadata), never to the image.
 */
export const PROP_MARKETS = Object.freeze({ player_points: "pts", player_rebounds: "reb", player_assists: "ast" });
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function propRecordsFromCapture(doc, { games, books }) {
  const records = []; const dropped = []; const used = [];
  const fetched = Date.parse(doc?.fetchedAt ?? "");
  for (const ev of doc?.events ?? []) {
    const game = games?.[ev.id];
    if (!game) continue;
    const tip = Date.parse(game.tipUtc);
    const byName = new Map();
    for (const p of game.players) { const k = fold(p.name); byName.set(k, byName.has(k) ? null : String(p.id)); } // null = ambiguous
    for (const [mkey, stat] of Object.entries(PROP_MARKETS)) {
      const names = new Set((ev.bookmakers ?? []).flatMap((b) => (b.markets ?? []).filter((m) => m.key === mkey).flatMap((m) => (m.outcomes ?? []).map((o) => o.description))));
      for (const name of names) {
        const id = byName.get(fold(name));
        if (!id) { dropped.push({ event: ev.id, market: stat, name, reason: id === null ? "AMBIGUOUS_PLAYER" : "NO_LANE_PLAYER" }); continue; }
        let got = null;
        for (const book of books) {
          const m = ev.bookmakers?.find((b) => b.key === book)?.markets?.find((x) => x.key === mkey);
          const outs = (m?.outcomes ?? []).filter((o) => fold(o.description) === fold(name));
          const over = outs.filter((o) => o.name === "Over"), under = outs.filter((o) => o.name === "Under");
          const q = Date.parse(m?.last_update ?? "");
          if (over.length !== 1 || under.length !== 1 || over[0].point !== under[0].point || !Number.isFinite(Number(over[0].point))) continue;
          if (![over[0].price, under[0].price].every((x) => Number.isInteger(x) && Math.abs(x) >= 100)) continue;
          if (!(q <= fetched) || !(fetched < tip)) continue;
          got = { book, quotedAt: m.last_update, point: Number(over[0].point), over: over[0].price, under: under[0].price };
          break;
        }
        if (!got) { dropped.push({ event: ev.id, market: stat, name, reason: "NO_COMPLETE_PAIR" }); continue; }
        const am = (x) => (x > 0 ? `+${x}` : String(x));
        records.push({ playerId: id, market: stat, line: got.point, side: "OVER", american: am(got.over) }, { playerId: id, market: stat, line: got.point, side: "UNDER", american: am(got.under) });
        used.push({ playerId: id, market: stat, book: got.book, quotedAt: got.quotedAt });
      }
    }
  }
  return { records, dropped, provenance: { fetchedAt: doc?.fetchedAt ?? null, quotes: used } };
}
