/**
 * NBA SIMULATION THEATER · POSSESSION PLAYBACK PAYLOAD — the ONLY data the client island receives. Pure; client-safe.
 *
 * Built at BUILD TIME on the server from (a) one game of the private possession artifact (already re-validated by
 * possession-loader.mjs) and (b) the OFFICIAL snapshot (lib/consistency/official-snapshot.mjs). It is a projection:
 * no file path, no private source hash, no supporting-engine id, no data class — only what the page shows. The client
 * never reads data/internal/** (it has no fs; possession-client-imports.test.mjs walks its import graph).
 *
 * OFFICIAL PANEL (`officialPanel`). Copied from the snapshot only — never computed from a run: the Elo favoured side,
 * the model versions, the freeze / lock instants, the withheld statements, and each official player's v0.1 MEDIANS
 * (the official forecast publishes medians only; ranges, team scores and the win probability are WITHHELD). Built once
 * per page; the run selector never touches it (possession-theater.test.mjs proves the markup is byte-identical).
 */
import { POSSESSION_KIND_TITLE, POSSESSION_RUN_KIND, POSSESSION_SELECTION_RULES } from "./selection.mjs";
import { ENGINE_LABEL, POSSESSION_ENGINE_ID, POSSESSION_PLAYBACK_SCHEMA } from "./labels.mjs";

const MEDIAN_FAMILIES = ["pts", "reb", "ast", "threePm", "minutes"];
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** The official projection panel's data, from the official snapshot only. */
export function officialPanel(snapshot) {
  if (!snapshot) return null;
  const g = snapshot.game ?? {};
  return {
    snapshotId: snapshot.snapshotId,
    eventId: String(snapshot.eventId),
    publication: snapshot.publication ?? null,
    favouredSide: g.winner?.side ?? null,
    sideRule: g.winner?.rule ?? null,
    models: { game: snapshot.modelVersions?.game ?? null, players: [...new Set(Object.values(snapshot.modelVersions?.players ?? {}))] },
    frozenAt: snapshot.frozenAt ?? snapshot.generatedAt ?? null,
    lockAt: snapshot.lockAt ?? null,
    withheld: { ...(g.withheld ?? {}) },
    players: (snapshot.players ?? []).map((p) => ({
      playerId: String(p.playerId), team: p.side ?? null, displayName: p.displayName ?? null, participation: p.participation ?? null,
      medians: Object.fromEntries(MEDIAN_FAMILIES.map((f) => [f, isNum(p.families?.[f]?.median) ? p.families[f].median : null])),
    })),
  };
}

/**
 * @param game      one game of the validated private artifact
 * @param snapshot  the official snapshot for the same event (null → every run is a hypothetical what-if)
 */
export function buildPlaybackPayload(game, snapshot) {
  const official = officialPanel(snapshot);
  const hasOfficial = !!official && (official.favouredSide === "HOME" || official.favouredSide === "AWAY");
  const runs = (game.runs ?? []).map((r) => {
    const isDefault = r.kind === POSSESSION_RUN_KIND.DEFAULT && hasOfficial;
    return {
      kind: r.kind, title: POSSESSION_KIND_TITLE[r.kind] ?? r.kind, role: isDefault ? "SUPPORTING_RUN" : "WHAT_IF", hypothetical: !isDefault,
      runIndex: r.runIndex, rule: r.rule, distance: r.distance, final: { home: r.final[0], away: r.final[1] }, periods: r.periods, overtimePeriods: r.overtimePeriods,
      events: r.events,
    };
  });
  const defaultRun = runs.find((r) => r.role === "SUPPORTING_RUN") ?? runs[0] ?? null;
  return {
    schema: POSSESSION_PLAYBACK_SCHEMA,
    eventId: String(game.providerEventId),
    dateUtc: game.dateUtc ?? null, venue: game.venue ?? null,
    teams: { home: { abbr: game.home.abbr, name: game.home.name }, away: { abbr: game.away.abbr, name: game.away.name } },
    engine: { id: POSSESSION_ENGINE_ID, label: ENGINE_LABEL, inputAsOf: game.inputAsOf, poolSize: game.poolSize, poolChecked: game.pool?.checkedDraws ?? null, poolViolations: game.pool?.violations ?? null, checker: "P1–P11 (clock, possession, five on court, scoring, minutes, fouls, log = box score)" },
    rosters: { home: game.rosters.home.map((p) => ({ id: String(p.providerAthleteId), name: p.name ?? null })), away: game.rosters.away.map((p) => ({ id: String(p.providerAthleteId), name: p.name ?? null })) },
    selection: { rules: Object.fromEntries(Object.entries(POSSESSION_SELECTION_RULES).filter(([k]) => k !== "version")), defaultKind: defaultRun?.kind ?? null },
    official,
    runs,
  };
}
