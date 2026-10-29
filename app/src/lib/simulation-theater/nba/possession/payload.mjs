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
import { POSSESSION_KIND_TITLE, POSSESSION_SELECTION_RULES, nearestRank } from "./selection.mjs";
import { ENGINE_LABEL, POSSESSION_ENGINE_ID, POSSESSION_PLAYBACK_SCHEMA } from "./labels.mjs";

// The official panel prints EXACTLY what the /nba lane prints (preregistration §13 amendment B: one official forecast):
// the lane's stats (official-snapshot.mjs NBA_LANE_FAMILIES — a test pins the two equal) for the players the snapshot
// marks publicDisplay MEDIAN_1DP (not ruled out, at least the lane's expected minutes), with the lane's minutes basis,
// EXPECTED minutes. Nothing else of the snapshot reaches the page.
export const PANEL_FAMILIES = Object.freeze(["pts", "reb", "ast", "threePm"]);
const LANE_DISPLAY = "MEDIAN_1DP";
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
    players: (snapshot.players ?? []).filter((p) => PANEL_FAMILIES.some((f) => p.families?.[f]?.publicDisplay === LANE_DISPLAY)).map((p) => ({
      playerId: String(p.playerId), team: p.side ?? null, displayName: p.displayName ?? null, participation: p.participation ?? null,
      medians: Object.fromEntries(PANEL_FAMILIES.map((f) => [f, p.families?.[f]?.publicDisplay === LANE_DISPLAY && isNum(p.families[f].median) ? p.families[f].median : null])),
      expectedMinutes: isNum(p.expectedMinutes) ? p.expectedMinutes : null,
    })),
  };
}

/**
 * ONE OFFICIAL FORECAST (Track C, 2026-10-29). The panel's PRINTED numbers are the lane's own (the canonical public NBA
 * accessor every other NBA surface reads, app/public/data/nba/experimental-public/<date>.json): each player's medians
 * and expected minutes are replaced by the lane row's (1 dp, exactly what /nba and the Official Forecast section print),
 * and the Elo-derived game-winner estimate is the shared accessor's (lib/sports/nba/elo-win-probability.mjs
 * eloWinProbabilityOf) — so the in-Theater panel can no longer print "Win probability: Withheld" while the section
 * below prints the Elo estimate. Called only after public-loader.mjs laneAgreementProblem passed (same receipt, side,
 * player set, medians at 1 dp), so nothing here can change WHICH forecast is shown — only that its digits are the lane's.
 * @param panel     officialPanel(snapshot) as embedded in the artifact
 * @param laneGame  the lane's game record (same providerEventId)
 * @param elo       eloWinProbabilityOf(laneGame) (null → the estimate is withheld here, as it is on every surface)
 * @param eloText   eloWinProbabilityText(elo)
 */
export function officialPanelFromLane(panel, laneGame, elo = null, eloText = null) {
  if (!panel || !laneGame) return panel;
  const rows = new Map(["home", "away"].flatMap((s) => (laneGame.players?.[s] ?? []).map((p) => [String(p.providerAthleteId), p])));
  return {
    ...panel,
    source: "LANE",
    elo: elo ? { home: elo.home, away: elo.away, homePct: elo.homePct, awayPct: elo.awayPct, label: elo.label, text: eloText, attr: `${elo.eventId}:${elo.home}` } : null,
    players: panel.players.map((p) => {
      const l = rows.get(String(p.playerId));
      if (!l) return p;
      return {
        ...p,
        displayName: l.name ?? p.displayName,
        medians: Object.fromEntries(PANEL_FAMILIES.map((f) => [f, isNum(l.medians?.[f]) ? l.medians[f] : null])),
        expectedMinutes: isNum(l.expectedMinutes) ? l.expectedMinutes : null,
      };
    }),
  };
}

/**
 * THE CENTRAL SCENARIO (Track C, 2026-10-29) — which stored run the Theater OPENS on. The build-time "default" kind is
 * selected among runs the Elo favourite WON (selection.mjs), so opening on it forced the first scenario a reader sees to
 * agree with the official side even where the engine's own pool did not (CLE @ ATL 2026-10-29: ATL favoured, ATL won
 * 44.1% of the 1,000 pool games, yet the page opened on ATL 107–87). The opening run is now chosen WITHOUT the official
 * forecast, by this rule over the engine's own committed pool features ([home, away, overtimePeriods, distance] for
 * every pool draw):
 *   among the stored runs that ended in regulation (overtime runs only when no regulation run is stored), the one whose
 *   final is nearest the pool's median home points and median away points (nearest-rank medians), measured in pool
 *   standard deviations (Euclidean); ties → lowest runIndex.
 * The two medians are each team's own median, not one simulated game, and no sum of player medians is claimed to equal
 * either. Every stored run — the central one included — is a hypothetical simulated scenario.
 */
export const CENTRAL_SCENARIO_RULE = Object.freeze({
  id: "nba-theater-central-scenario@1",
  text: "the stored run nearest the middle of this engine's own simulated games: of the runs that ended in regulation, the final closest to the pool's median home and median away points (in pool standard deviations); ties → lowest run number. The Official Forecast is not consulted, so either side may win it",
});

/** @returns {{ runIndex: number, kind: string, poolSize: number, poolHomeWinShare: number, poolMedian: {home: number, away: number}, distance: number } | null} */
export function centralScenario(game) {
  const feats = (game?.pool?.features ?? []).filter((f) => Array.isArray(f) && isNum(f[0]) && isNum(f[1]));
  const runs = (game?.runs ?? []).filter((r) => Array.isArray(r.final));
  if (!feats.length || !runs.length) return null;
  const hs = feats.map((f) => f[0]), as = feats.map((f) => f[1]);
  const med = { home: nearestRank(hs, 0.5), away: nearestRank(as, 0.5) };
  const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1; };
  const sh = sd(hs), sa = sd(as);
  const reg = runs.filter((r) => !(r.overtimePeriods > 0));
  const cand = (reg.length ? reg : runs).map((r) => ({ r, d: Math.hypot((r.final[0] - med.home) / sh, (r.final[1] - med.away) / sa) }))
    .sort((a, b) => a.d - b.d || a.r.runIndex - b.r.runIndex);
  const c = cand[0];
  return { runIndex: c.r.runIndex, kind: c.r.kind, poolSize: feats.length, poolHomeWinShare: Number((feats.filter((f) => f[0] > f[1]).length / feats.length).toFixed(4)), poolMedian: med, distance: Number(c.d.toFixed(6)) };
}

/**
 * @param game      one game of the validated private artifact
 * @param official  the official panel for the same event (null → every run is a hypothetical what-if)
 */
export function buildPlaybackPayload(game, official) {
  const central = centralScenario(game);
  const runs = (game.runs ?? []).map((r) => {
    const isCentral = central != null && r.runIndex === central.runIndex;
    return {
      kind: r.kind, title: POSSESSION_KIND_TITLE[r.kind] ?? r.kind, role: isCentral ? "CENTRAL_SCENARIO" : "WHAT_IF", hypothetical: true,
      runIndex: r.runIndex, rule: r.rule, distance: r.distance, final: { home: r.final[0], away: r.final[1] }, periods: r.periods, overtimePeriods: r.overtimePeriods,
      events: r.events,
    };
  });
  const opening = runs.find((r) => r.role === "CENTRAL_SCENARIO") ?? runs[0] ?? null;
  return {
    schema: POSSESSION_PLAYBACK_SCHEMA,
    eventId: String(game.providerEventId),
    dateUtc: game.dateUtc ?? null, venue: game.venue ?? null,
    teams: { home: { abbr: game.home.abbr, name: game.home.name }, away: { abbr: game.away.abbr, name: game.away.name } },
    engine: { id: POSSESSION_ENGINE_ID, label: ENGINE_LABEL, inputAsOf: game.inputAsOf, poolSize: game.poolSize, poolChecked: game.pool?.checkedDraws ?? null, poolViolations: game.pool?.violations ?? null, checker: "P1–P11 (clock, possession, five on court, scoring, minutes, fouls, log = box score)" },
    rosters: { home: game.rosters.home.map((p) => ({ id: String(p.providerAthleteId), name: p.name ?? null })), away: game.rosters.away.map((p) => ({ id: String(p.providerAthleteId), name: p.name ?? null })) },
    selection: {
      rules: Object.fromEntries(Object.entries(POSSESSION_SELECTION_RULES).filter(([k]) => k !== "version")),
      defaultKind: opening?.kind ?? null,
      central: central ? { rule: CENTRAL_SCENARIO_RULE.text, runIndex: central.runIndex, poolSize: central.poolSize, poolHomeWinShare: central.poolHomeWinShare } : null,
    },
    official,
    runs,
  };
}
