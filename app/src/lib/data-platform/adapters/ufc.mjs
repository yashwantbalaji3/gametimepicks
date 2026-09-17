/**
 * UFC source adapter — committed artifacts → canonical records. Pure.
 *
 * HIERARCHY. The product routes BOUTS (`/ufc/bout/[boutId]`, boutId = ESPN competition id) and groups them by
 * CARD (ESPN event id). So a platform Game is a bout; the card is `GameRecord.card {id, name}`; fighters are
 * Players in `competitors` (RED/BLUE). No team fields are used — a bout has no home side.
 *
 * IDENTITY
 *   game    ESPN competition id (shipped route id)
 *   player  ufc-athlete-<ESPN athlete id> — new in v1.2
 *   season  UFC-<UTC year of the card's scheduled start> — a neutral period key, not a competitive season
 *
 * The name-keyed ids (`2026-09-12:a|b`) used by results-latest.json and graded picks are NOT aliases: they are
 * built from fighter names, and a rematch on the same date would collide. They are left to their owners.
 *
 * SCOPE. A bout seen only in an OLD schedule capture (absent from the newest capture and from every final
 * source) is excluded: a scratched bout keeps its ESPN id, and emitting it would assert a fight that never
 * happened. It is counted, not guessed.
 *
 * FIELD PRECEDENCE   startUtc/card/competitors  espn-results > espn-schedule > espn-history
 *                    statusClass FINAL          espn-results | espn-history (STATUS_FINAL rows only)
 *                    winner flags               espn-results > espn-history
 */
import { createMerger, createLabelPicker } from "../merge.mjs";
import { ufcGameId, ufcPlayerId } from "../ids.mjs";
import { normalizeInstant } from "../contract.mjs";
import { alias, playerRecord, gameRecord, playerGameStatRecord, GAME_FIELDS } from "../records.mjs";
import { validateStats } from "../stat-dictionary.mjs";

export const UFC_SOURCES = Object.freeze({ HISTORY: "ufc.espn-history", SCHEDULE: "ufc.espn-schedule", RESULTS: "ufc.espn-results" });
const S = UFC_SOURCES;

/**
 * @param {{ history?: any, scheduleCaptures?: Array<{path:string, doc:any}>, results?: any }} input
 * @param {ReturnType<import("../diagnostics.mjs").createDiagnostics>} diag
 */
export function adaptUfc(input, diag) {
  const SPORT = "UFC";
  const sourceRows = {};
  const bump = (k, n = 1) => { sourceRows[k] = (sourceRows[k] ?? 0) + n; };
  const games = createMerger({ kind: "game", sportId: SPORT, fields: GAME_FIELDS, defaultPrecedence: [S.RESULTS, S.SCHEDULE, S.HISTORY], precedence: { statusClass: [S.RESULTS, S.HISTORY] } });
  const winners = createMerger({ kind: "bout-winner", sportId: SPORT, fields: ["red", "blue"], defaultPrecedence: [S.RESULTS, S.HISTORY], precedence: {} });
  const fighters = createLabelPicker([S.RESULTS, S.SCHEDULE, S.HISTORY]);
  const fighterIds = new Set();

  const fighter = (raw, name, when, src) => {
    const id = ufcPlayerId(raw);
    if (!id) return null;
    fighterIds.add(id);
    fighters.add(id, name, when, src);
    return id;
  };
  const seasonOf = (iso) => (iso ? iso.slice(0, 4) : null);
  const competitorsOf = (red, blue) => (red && blue && red !== blue ? [{ playerId: red, corner: "RED" }, { playerId: blue, corner: "BLUE" }] : null);
  const cardOf = (id, name) => (/^\d+$/.test(String(id ?? "")) ? { id: String(id), name: typeof name === "string" && name.trim() ? name.trim() : null } : null);

  // ── history corpus ──────────────────────────────────────────────────────────────────────────────
  const cardDate = new Map((input.history?.cardIndex ?? []).map((c) => [String(c.providerCardId), { date: normalizeInstant(c.dateUtc), name: c.name }]));
  for (const r of input.history?.rows ?? []) {
    bump(S.HISTORY);
    const id = ufcGameId(r.providerBoutId);
    if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.HISTORY, {}); continue; }
    if (r.statusRaw !== "STATUS_FINAL") { diag.add("EXCLUDED_BY_SCOPE", SPORT, S.HISTORY, { id, reason: r.statusRaw }); continue; }
    const start = normalizeInstant(r.dateUtc);
    const red = fighter(r.red?.id, r.red?.name, start, S.HISTORY), blue = fighter(r.blue?.id, r.blue?.name, start, S.HISTORY);
    if (!competitorsOf(red, blue)) { diag.add("UNRESOLVED_PLAYER", SPORT, S.HISTORY, { id }); continue; }
    const card = cardDate.get(String(r.providerCardId));
    games.add(id, S.HISTORY, {
      seasonKey: seasonOf(card?.date ?? start), startUtc: start, competitors: competitorsOf(red, blue),
      card: cardOf(r.providerCardId, r.cardName ?? card?.name), statusClass: "FINAL",
    }, [alias("espn", "game", id)]);
    if (typeof r.red?.winner === "boolean" && typeof r.blue?.winner === "boolean") winners.add(id, S.HISTORY, { red: r.red.winner, blue: r.blue.winner });
  }

  // ── schedule captures: newest capture is authoritative for upcoming bouts ────────────────────────
  const caps = [...(input.scheduleCaptures ?? [])].sort((a, b) => (a.path < b.path ? 1 : -1)); // newest first
  const newestBouts = new Set((caps[0]?.doc?.bouts ?? []).map((b) => ufcGameId(b.providerBoutId)).filter(Boolean));
  const finalIds = new Set([
    ...(input.history?.rows ?? []).filter((r) => r.statusRaw === "STATUS_FINAL").map((r) => ufcGameId(r.providerBoutId)),
    ...(input.results?.rows ?? []).filter((r) => /^STATUS_FINAL/.test(String(r.statusRaw ?? ""))).map((r) => ufcGameId(r.providerBoutId)),
  ].filter(Boolean));
  const excludedStale = new Set();
  // ONE statement per bout: the newest capture that lists it. ESPN keeps a competition id when a fighter is
  // replaced (measured: 284 competitor changes across captures), and a newest line with a TBD opponent must
  // not be back-filled with the withdrawn fighter from an older capture.
  const decided = new Set();
  for (const { doc } of caps) {
    const events = new Map((doc?.events ?? []).map((e) => [String(e.providerEventId), e]));
    for (const b of doc?.bouts ?? []) {
      bump(S.SCHEDULE);
      const id = ufcGameId(b.providerBoutId);
      if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.SCHEDULE, {}); continue; }
      if (decided.has(id)) continue;
      decided.add(id);
      if (!newestBouts.has(id) && !finalIds.has(id)) {
        if (!excludedStale.has(id)) diag.add("EXCLUDED_BY_SCOPE", SPORT, S.SCHEDULE, { id, reason: "only in an older schedule capture and never final (scratched or unresolved)" });
        excludedStale.add(id);
        continue;
      }
      const ev = events.get(String(b.eventProviderId));
      const start = normalizeInstant(b.dateUtc);
      const red = fighter(b.redProviderId, b.red, doc?.generatedAt ?? null, S.SCHEDULE), blue = fighter(b.blueProviderId, b.blue, doc?.generatedAt ?? null, S.SCHEDULE);
      if (!competitorsOf(red, blue)) { diag.add("UNRESOLVED_PLAYER", SPORT, S.SCHEDULE, { id }); continue; }
      games.add(id, S.SCHEDULE, {
        seasonKey: seasonOf(normalizeInstant(ev?.dateUtc) ?? start), startUtc: start, competitors: competitorsOf(red, blue),
        card: cardOf(b.eventProviderId, ev?.name),
      }, [alias("espn", "game", id)]);
    }
  }

  // ── results capture (STATUS_FINAL only) ─────────────────────────────────────────────────────────
  for (const r of input.results?.rows ?? []) {
    bump(S.RESULTS);
    const id = ufcGameId(r.providerBoutId);
    if (!id) { diag.add("MISSING_EVENT_ID", SPORT, S.RESULTS, {}); continue; }
    if (!/^STATUS_FINAL/.test(String(r.statusRaw ?? ""))) { diag.add("EXCLUDED_BY_SCOPE", SPORT, S.RESULTS, { id, reason: r.statusRaw }); continue; }
    const start = normalizeInstant(r.dateUtc);
    const red = fighter(r.red?.providerId, r.red?.name, r.capturedAt ?? null, S.RESULTS), blue = fighter(r.blue?.providerId, r.blue?.name, r.capturedAt ?? null, S.RESULTS);
    if (!competitorsOf(red, blue)) { diag.add("UNRESOLVED_PLAYER", SPORT, S.RESULTS, { id }); continue; }
    games.add(id, S.RESULTS, {
      seasonKey: seasonOf(normalizeInstant(r.eventDateUtc) ?? start), startUtc: start, competitors: competitorsOf(red, blue),
      card: cardOf(r.providerCardId, r.cardName), statusClass: "FINAL",
    }, [alias("espn", "game", id)]);
    if (typeof r.redWinner === "boolean" && typeof r.blueWinner === "boolean") winners.add(id, S.RESULTS, { red: r.redWinner, blue: r.blueWinner });
  }

  const gm = games.finalize();
  const gameRecords = gm.records.map((r) => gameRecord(SPORT, r.id, r.fields, r.aliases));
  const byId = new Map(gameRecords.map((g) => [g.id, g]));

  const playerGameStats = [];
  const w = winners.finalize();
  for (const r of w.records) {
    const g = byId.get(r.id);
    if (!g || g.statusClass !== "FINAL" || !g.competitors) continue;
    if (r.fields.red && r.fields.blue) { diag.add("STAT_CONFLICT", SPORT, r.fieldSources.red, { id: r.id, reason: "both corners flagged winner" }); continue; }
    const had = r.fields.red || r.fields.blue;
    const [red, blue] = g.competitors;
    for (const [me, opp, won] of [[red, blue, r.fields.red], [blue, red, r.fields.blue]]) {
      const stats = { won, boutHadWinner: had };
      const errs = validateStats("ufc.bout-result", stats);
      if (errs.length) { diag.add("INVALID_STAT", SPORT, r.fieldSources.red, { id: r.id, errs }); continue; }
      playerGameStats.push(playerGameStatRecord({ family: "ufc.bout-result", sportId: SPORT, gameId: r.id, playerId: me.playerId, opponentPlayerId: opp.playerId, stats, src: r.fieldSources.red }));
    }
  }

  const players = [...fighterIds].map((id) => {
    const name = fighters.pick(id);
    for (const v of fighters.variants(id)) if (v !== name) diag.add("NAME_VARIANT", SPORT, "player", { id, kept: name, variant: v });
    return playerRecord(SPORT, id, { name: name ?? id, currentTeamId: null }, [alias("espn", "player", id.replace("ufc-athlete-", ""))]);
  });

  return { sportId: SPORT, teams: [], players, games: gameRecords, teamGameStats: [], playerGameStats, conflicts: [...gm.conflicts, ...w.conflicts], sourceRows };
}
