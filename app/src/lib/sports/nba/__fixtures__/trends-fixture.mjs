/**
 * NBA Trends test fixture (shared by trends.test.mjs and the shared-Trends parity snapshot, trends-shared 2026-11-11):
 * one slate, past games, four players, fresh eligibility@1 inputs. PURE data.
 */
/* ── fixture: one slate, two past games, four players ─────────────────────────────────────────────────────────── */
export const box = (id, dateUtc, players, { phase = 2, ft = [100, 90] } = {}) => ({
  doc: {
    providerEventId: id, phase, dateUtc, status: "STATUS_FINAL", boxscoreAvailable: true,
    teams: [{ providerTeamId: "1", abbr: "HHH", homeAway: "home" }, { providerTeamId: "2", abbr: "AAA", homeAway: "away" }],
    players: [
      ...players,
      // fillers so the team points equal the final
      { providerAthleteId: "fh", providerTeamId: "1", minutes: 10, pts: ft[0] - players.filter((p) => p.providerTeamId === "1" && Number.isInteger(p.minutes)).reduce((s, p) => s + p.pts, 0), reb: 0, ast: 0 },
      { providerAthleteId: "fa", providerTeamId: "2", minutes: 10, pts: ft[1] - players.filter((p) => p.providerTeamId === "2" && Number.isInteger(p.minutes)).reduce((s, p) => s + p.pts, 0), reb: 0, ast: 0 },
    ],
  },
  final: { state: "FINAL", ftHome: ft[0], ftAway: ft[1] },
});
export const P = (id, team, minutes, pts, reb, ast, extra = {}) => ({ providerAthleteId: id, providerTeamId: team, minutes, pts, reb, ast, ...extra });
export const SOURCES = [
  box("g1", "2026-11-05T00:00Z", [P("e", "1", 30, 20, 5, 4), P("d", "1", 20, 8, 2, 1), P("o", "2", 25, 12, 6, 3), P("x", "2", 15, 3, 1, 0)]),
  box("g2", "2026-11-07T00:00Z", [P("e", "1", 32, 10, 9, 2), P("d", "1", 0, 0, 0, 0, { didNotPlay: true }), P("o", "2", 22, 30, 1, 1), P("x", "2", 12, 4, 2, 2)]),
  box("g3", "2026-11-08T00:00Z", [P("e", "1", 30, 99, 9, 9)], { phase: 1 }), // preseason: never counted
  box("g4", "2026-11-09T00:30Z", [P("e", "1", 30, 99, 9, 9)]), // ET 2026-11-08 evening, before the slate: counted
  box("g5", "2026-11-10T00:30Z", [P("e", "1", 30, 99, 9, 9)]), // ET 2026-11-09 = the slate itself: never counted
];
export const row = (id, name, injuryStatus, medians, expectedMinutes) => ({ providerAthleteId: id, name, injuryStatus, expectedMinutes, medians });
export const lane = {
  date: "2026-11-09",
  games: [{
    providerEventId: "tonight", home: { abbr: "HHH" }, away: { abbr: "AAA" },
    players: {
      home: [row("e", "Eligible Eddie", null, { pts: 15, reb: 5, ast: 3 }, 30), row("d", "Doubtful Dan", "Day-To-Day", { pts: 7, reb: 2, ast: 1 }, 34)],
      away: [row("o", "Other Oscar", null, { pts: 12, reb: 4, ast: 2 }, 36)],
      unavailable: { away: [{ providerAthleteId: "x", name: "Out Xavier", reason: "RULED_OUT", status: "Out" }], home: [] },
    },
  }],
};

/* eligibility@1 inputs for the fixture: both captures fresh at NOW; d Day-To-Day, x Out on the injury report, u on no roster */
export const NOW = "2026-11-09T20:00:00Z";
export const rp = (id, status = "active") => ({ providerAthleteId: id, rosterStatusType: status });
export const ELIG = {
  asOf: NOW,
  injuries: { generatedAt: "2026-11-09T19:00:00Z", entries: [
    { sport: "nba", providerTeamId: "1", athleteId: "d", athleteName: "Doubtful Dan", status: "Day-To-Day", statedAt: "2026-11-09T18:00:00Z" },
    { sport: "nba", providerTeamId: "2", athleteId: "x", athleteName: "Out Xavier", status: "Out", statedAt: "2026-11-09T18:00:00Z" },
  ] },
  roster: { capturedAt: "2026-11-09T19:00:00Z", teams: [
    { providerTeamId: "1", espnAbbr: "HHH", state: "CAPTURED", players: [rp("e"), rp("d", "day-to-day"), rp("m")] },
    { providerTeamId: "2", espnAbbr: "AAA", state: "CAPTURED", players: [rp("o"), rp("x")] },
  ] },
};
export const opts = (slateIsToday = true, eligibility = ELIG) => ({ slateIsToday, eligibility });
/** A line record shaped like public-line-records' price records (prices present so the gate's stripping is exercised). */
export const REC = (athlete, family, line, capturedAt = "2026-11-09T17:00:00Z", extra = {}) => ({ schema: "x", provider: "the-odds-api", eventId: "tonight", providerAthleteId: athlete, family, providerMarketKey: `player_${family}`, line, book: "somebook", overAmerican: -115, underAmerican: -105, capturedAt, ...extra });
/** The snapshot cases: every NBA Trends state the page renders. */
export function snapshotCases(T) {
  const lines = T.gatedTrendLines([REC("e", "pts", 15.5), REC("o", "ast", 2.5)]);
  const review = { ...lane, games: [{ ...lane.games[0], players: { ...lane.games[0].players, home: [row("e", "Eligible Eddie", null, { pts: 15, reb: 5, ast: 3 }, 46.8), row("m", "Max Minutes", null, { pts: 9, reb: 3, ast: 2 }, 42), lane.games[0].players.home[1]] } }] };
  return {
    tonight: T.buildTrends(lane, SOURCES, { ...opts(), lines }),
    notTonight: T.buildTrends(lane, SOURCES, opts(false)),
    minutesReview: T.buildTrends(review, SOURCES, opts()),
    stale: T.buildTrends(lane, SOURCES, opts(true, { ...ELIG, asOf: "2026-11-10T03:00:00Z" })),
    empty: T.buildTrends(null, SOURCES, opts()),
  };
}
