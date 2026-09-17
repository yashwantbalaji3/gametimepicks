/**
 * RESEARCH PROJECTION ASSEMBLY (v1.3 · R1304) — pure.
 *
 *   platform records (plain arrays, read ONCE by scripts/research/build-research-projections.mjs)
 *        ↓ build indexes/maps once
 *        ↓ team + player read models, eligibility, slugs, coverage
 *   projection files { relative path → content string }
 *
 * No filesystem, no clock, no network, no forecast input: the same platform records always give the same bytes.
 * Only this module and the build script know that the platform exists; pages read the files it produces.
 */
import { RESEARCH_PROJECTION_SCHEMA_VERSION, RESEARCH_SPORTS, TEAM_SPORTS, FORBIDDEN_PROJECTION_FIELDS, researchPath } from "./contract.mjs";
import { assignSlugs } from "./slugs.mjs";
import { buildTeamResearch, TEAM_ROW, eventDate } from "./team-read-model.mjs";
import { buildPlayerResearch, recordsParticipation, PLAYER_ROW } from "./player-read-model.mjs";
import { playerEligibility, teamEligibility, ELIGIBILITY_RULES, THRESHOLDS, RESEARCH_PAGE_BUDGET } from "./eligibility.mjs";
import { coverageFor } from "./coverage.mjs";

export const PROJECTION_BUILDER_ID = "gametime-research-projection@1";

/** Deterministic JSON: object keys sorted recursively, arrays kept in order. */
export function canonicalJson(v, pretty = false) {
  const sort = (x) => (Array.isArray(x) ? x.map(sort) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sort(x[k])])) : x);
  return JSON.stringify(sort(v), null, pretty ? 1 : 0) + "\n";
}

const push = (m, k, v) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

/**
 * @param {{ manifestSha256: string, seasons: any[], sports: Record<string, { teams: any[], players: any[], games: any[], teamGameStats: any[], playerGameStats: any[] }> }} platform
 * @returns {{ files: Map<string, string>, summary: any }}
 */
export function assembleResearchProjection(platform) {
  const seasonById = new Map(platform.seasons.map((s) => [s.id, s]));
  const seasonLabel = (id) => {
    const s = seasonById.get(id);
    if (!s) throw new Error(`research projection: unknown season ${id}`);
    return s.label;
  };

  const files = new Map();
  const index = [];
  const readiness = {};
  const cutoffs = {};

  for (const sportId of RESEARCH_SPORTS) {
    const sp = platform.sports[sportId];
    if (!sp) throw new Error(`research projection: platform has no ${sportId} partition`);
    const gamesById = new Map(sp.games.map((g) => [g.id, g]));
    const teamStatsByGame = new Map();
    for (const r of sp.teamGameStats) push(teamStatsByGame, r.gameId, r);
    const gamesByTeam = new Map();
    for (const g of sp.games) for (const t of [g.homeTeamId, g.awayTeamId]) if (t) push(gamesByTeam, t, g);
    const statsByPlayer = new Map();
    for (const r of sp.playerGameStats) push(statsByPlayer, r.playerId, r);
    const upcomingByPlayer = new Map();
    for (const g of sp.games) if (g.statusClass !== "FINAL" && g.startUtc) for (const c of g.competitors ?? []) push(upcomingByPlayer, c.playerId, g);
    const teamsById = new Map(sp.teams.map((t) => [t.id, t]));
    const playersById = new Map(sp.players.map((p) => [p.id, p]));

    // ── Teams ────────────────────────────────────────────────────────────────────────────────────
    const teamRecords = [];
    const teamReady = { total: sp.teams.length, published: 0, indexable: 0, partial: 0, excluded: {} };
    if (TEAM_SPORTS.includes(sportId)) {
      const built = [];
      for (const team of [...sp.teams].sort((a, b) => (a.id < b.id ? -1 : 1))) {
        const t = buildTeamResearch({ sportId, team, games: gamesByTeam.get(team.id) ?? [], teamStatsByGame, seasonLabel });
        const finalsWithResult = t.games.filter((r) => r[TEAM_ROW.RESULT]).length;
        const el = teamEligibility({ sport: sportId, finalsWithResult, seasons: t.seasons.map((s) => s.id) });
        if (!el.published) { teamReady.excluded[el.reason] = (teamReady.excluded[el.reason] ?? 0) + 1; continue; }
        built.push({ t, el });
      }
      const slugs = assignSlugs(built.map(({ t }) => ({ id: t.id, label: t.name })));
      for (const { t, el } of built) {
        const seasonsAsc = [...t.seasons].reverse();
        const coverage = coverageFor({ kind: "team", sport: sportId, seasons: t.seasons.map((s) => s.id), firstSeasonLabel: seasonsAsc[0]?.label ?? null, lastSeasonLabel: t.seasons[0]?.label ?? null });
        const rec = { schemaVersion: RESEARCH_PROJECTION_SCHEMA_VERSION, ...t, slug: slugs.get(t.id), indexable: el.indexable, eligibility: el.reason, coverage };
        teamRecords.push(rec);
        teamReady.published += 1;
        if (el.indexable) teamReady.indexable += 1;
        if (coverage.status !== "FULL") teamReady.partial += 1;
        index.push({ kind: "team", sport: sportId, id: t.id, slug: rec.slug, label: t.name, hint: t.abbreviation ?? null, indexable: el.indexable, status: coverage.status });
      }
      files.set(`teams/${sportId}.jsonl`, teamRecords.map((r) => canonicalJson(r)).join(""));
    }
    // Every team's label, so an opponent renders by name whether or not it has a page.
    files.set(`labels/${sportId}.json`, canonicalJson({
      schemaVersion: RESEARCH_PROJECTION_SCHEMA_VERSION, sport: sportId,
      teams: Object.fromEntries([...sp.teams].sort((a, b) => (a.id < b.id ? -1 : 1)).map((t) => [t.id, { name: t.name, abbreviation: t.abbreviation ?? null }])),
    }));

    // ── Players / fighters ───────────────────────────────────────────────────────────────────────
    const playerReady = { total: sp.players.length, published: 0, indexable: 0, partial: 0, excluded: {} };
    const builtPlayers = [];
    for (const player of [...sp.players].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const rows = statsByPlayer.get(player.id) ?? [];
      const participation = rows.filter(recordsParticipation);
      const seasonCounts = {};
      const seen = new Set();
      for (const r of participation) {
        if (seen.has(r.gameId)) continue;
        seen.add(r.gameId);
        const sid = gamesById.get(r.gameId)?.seasonId;
        if (sid) seasonCounts[sid] = (seasonCounts[sid] ?? 0) + 1;
      }
      const el = playerEligibility({ sport: sportId, games: seen.size, seasonCounts, currentTeamId: player.currentTeamId ?? null, hasUpcoming: (upcomingByPlayer.get(player.id) ?? []).length > 0 });
      if (!el.published) { playerReady.excluded[el.reason] = (playerReady.excluded[el.reason] ?? 0) + 1; continue; }
      builtPlayers.push({ player, rows, el });
    }
    const pslugs = assignSlugs(builtPlayers.map(({ player }) => ({ id: player.id, label: player.name })));
    const lines = [];
    let latest = null;
    for (const { player, rows, el } of builtPlayers) {
      const p = buildPlayerResearch({ sportId, player, statRows: rows, gamesById, teamStatsByGame, seasonLabel });
      if (p.lastDate && (!latest || p.lastDate > latest)) latest = p.lastDate;
      const seasonIds = p.seasons.map((s) => s.id);
      const coverage = coverageFor({
        kind: "player", sport: sportId, seasons: seasonIds,
        firstSeasonLabel: p.seasons[p.seasons.length - 1]?.label ?? null, lastSeasonLabel: p.seasons[0]?.label ?? null,
        hasPre2023: sportId === "NFL" && seasonIds.some((s) => s < "NFL-2023"),
      });
      const extra = {};
      if (sportId === "UFC") {
        const opp = new Set(p.gameLog.map((r) => r[PLAYER_ROW.OPP]).filter(Boolean));
        const upcoming = (upcomingByPlayer.get(player.id) ?? [])
          .sort((a, b) => (a.startUtc < b.startUtc ? -1 : a.startUtc > b.startUtc ? 1 : a.id < b.id ? -1 : 1))
          .map((g) => {
            const o = (g.competitors ?? []).find((c) => c.playerId !== player.id)?.playerId ?? null;
            if (o) opp.add(o);
            return { gameId: g.id, startUtc: g.startUtc, opponentId: o, cardId: g.card?.id ?? null };
          });
        const cards = new Map();
        for (const g of [...p.gameLog.map((r) => gamesById.get(r[PLAYER_ROW.GAME])), ...upcoming.map((u) => gamesById.get(u.gameId))]) if (g?.card?.id) cards.set(g.card.id, g.card.name ?? null);
        extra.upcoming = upcoming;
        extra.opponents = Object.fromEntries([...opp].sort().map((id) => [id, playersById.get(id)?.name ?? null]));
        extra.cards = Object.fromEntries([...cards].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
      }
      const rec = { schemaVersion: RESEARCH_PROJECTION_SCHEMA_VERSION, ...p, ...extra, slug: pslugs.get(player.id), indexable: el.indexable, eligibility: el.reason, coverage };
      lines.push(canonicalJson(rec));
      playerReady.published += 1;
      if (el.indexable) playerReady.indexable += 1;
      if (coverage.status !== "FULL") playerReady.partial += 1;
      const hint = player.currentTeamId ? teamsById.get(player.currentTeamId)?.abbreviation ?? null : null;
      index.push({ kind: "player", sport: sportId, id: player.id, slug: rec.slug, label: player.name, hint, indexable: el.indexable, status: coverage.status });
    }
    files.set(`players/${sportId}.jsonl`, lines.join(""));
    cutoffs[sportId] = { latestRecordedPlayerGame: latest, latestTeamResult: teamRecords.reduce((a, t) => (t.resultsThrough && (!a || t.resultsThrough > a) ? t.resultsThrough : a), null) };
    readiness[sportId] = { teams: TEAM_SPORTS.includes(sportId) ? teamReady : null, players: playerReady };
  }

  index.sort((a, b) => (a.kind + a.sport + a.slug < b.kind + b.sport + b.slug ? -1 : 1));
  const pages = index.length;
  if (pages > RESEARCH_PAGE_BUDGET) throw new Error(`research projection: ${pages} pages exceeds the budget of ${RESEARCH_PAGE_BUDGET} — tighten eligibility or raise the budget deliberately`);
  for (const e of index) if (e.slug == null) throw new Error(`research projection: ${e.id} has no slug`);

  files.set("index.json", canonicalJson({ schemaVersion: RESEARCH_PROJECTION_SCHEMA_VERSION, artifact: "research-index", platformManifestSha256: platform.manifestSha256, entries: index.map((e) => ({ ...e, path: researchPath(e.kind, e.sport, e.slug) })) }));
  files.set("readiness.json", canonicalJson({
    schemaVersion: RESEARCH_PROJECTION_SCHEMA_VERSION, artifact: "research-page-readiness", rules: ELIGIBILITY_RULES, thresholds: THRESHOLDS, pageBudget: RESEARCH_PAGE_BUDGET, sports: readiness,
    totals: { pages, indexable: index.filter((e) => e.indexable).length, noindex: index.filter((e) => !e.indexable).length, teamPages: index.filter((e) => e.kind === "team").length, playerPages: index.filter((e) => e.kind === "player").length },
  }, true));

  for (const [p, content] of files) assertNoForbiddenFields(p, content);
  return { files, summary: { pages, cutoffs } };
}

/** A projection file must not carry another owner's field names as keys. */
export function assertNoForbiddenFields(where, content) {
  for (const f of FORBIDDEN_PROJECTION_FIELDS) {
    if (content.includes(`"${f}":`)) throw new Error(`research projection ${where}: forbidden owner field "${f}"`);
  }
}

export { eventDate };
