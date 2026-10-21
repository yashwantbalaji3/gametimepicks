/**
 * TEST FIXTURE — not real prices, not real players, not a capture. Built by hand from the DOCUMENTED shape of
 * The Odds API v4 event-odds response (https://the-odds-api.com/liveapi/guides/v4/#get-event-odds, read 2026-10-21):
 * top level id / sport_key / sport_title / commence_time / home_team / away_team / bookmakers[]; each bookmaker
 * key / title / markets[]; each market key / last_update / outcomes[]; each outcome name ("Over"/"Under") /
 * description (player) / price / point. The documented example carries `last_update` on markets only.
 *
 * Team names are real (they must resolve through lib/nba/identity-contract canonicalTeamId); every player, athlete
 * id, event id and price is invented. Never copy this under app/public/data/.
 */
export const FIXTURE_LABEL = "TEST FIXTURE — not real prices";
export const FETCHED_AT = "2026-10-22T22:00:00.000Z";
export const TIP = "2026-10-22T23:30Z";

/** ESPN-schedule-shaped rows (public/data/nba/schedule rows), invented ids. */
export const SCHEDULE = [
  { providerEventId: "900000001", dateUtc: TIP, home: { abbr: "NY", name: "New York Knicks" }, away: { abbr: "BOS", name: "Boston Celtics" } },
  { providerEventId: "900000002", dateUtc: "2026-10-23T02:00Z", home: { abbr: "LAL", name: "Los Angeles Lakers" }, away: { abbr: "GS", name: "Golden State Warriors" } },
];

/** Both rosters per event, roster-capture shaped (providerAthleteId + displayName + team). */
export const ROSTERS = {
  "900000001": [
    { providerAthleteId: "9100001", displayName: "Fixture Guard One", team: "NYK" },
    { providerAthleteId: "9100002", displayName: "Fixture Wing Two", team: "NYK" },
    { providerAthleteId: "9100003", displayName: "Fixture Big Three", team: "BOS" },
    { providerAthleteId: "9100004", displayName: "Fixture Twin", team: "BOS" },
    { providerAthleteId: "9100005", displayName: "Fixture Twin", team: "NYK" },
    { providerAthleteId: "9100006", displayName: "Fixturé Accent Jr.", team: "BOS" },
  ],
  "900000002": [
    { providerAthleteId: "9200001", displayName: "Fixture Laker One", team: "LAL" },
    { providerAthleteId: "9200002", displayName: "Fixture Warrior One", team: "GSW" },
  ],
};
export const rosterFor = (eventId) => ROSTERS[eventId] ?? [];

const ou = (description, point, over, under) => [
  { name: "Over", description, price: over, point },
  { name: "Under", description, price: under, point },
];

/** Event 1: two eligible books, one offshore book, points + rebounds + a not-modelled combo. */
export const EVENT_1 = {
  id: "fx0000000000000000000000000000a1",
  sport_key: "basketball_nba",
  sport_title: "NBA",
  commence_time: "2026-10-22T23:30:00Z",
  home_team: "New York Knicks",
  away_team: "Boston Celtics",
  bookmakers: [
    {
      key: "draftkings", title: "DraftKings",
      markets: [
        { key: "player_points", last_update: "2026-10-22T21:55:00Z", outcomes: [
          ...ou("Fixture Guard One", 24.5, -115, -105),
          ...ou("Fixture Big Three", 18.5, -110, -110),
          ...ou("Fixture Twin", 9.5, -110, -110), // two roster players share this name → ambiguous
          ...ou("Fixture Accent Jr", 12.5, 100, -130), // diacritic + period folded → resolves
          ...ou("Unknown Person", 5.5, -110, -110), // not on either roster
        ] },
        { key: "player_rebounds", last_update: "2026-10-22T21:50:00Z", outcomes: [...ou("Fixture Big Three", 9.5, -120, 100)] },
        { key: "player_rebounds_assists", last_update: "2026-10-22T21:50:00Z", outcomes: [...ou("Fixture Big Three", 12.5, -110, -110)] },
      ],
    },
    {
      key: "fanduel", title: "FanDuel",
      markets: [
        { key: "player_points", last_update: "2026-10-22T21:58:00Z", outcomes: [
          ...ou("Fixture Guard One", 24.5, -112, -108),
          ...ou("Fixture Big Three", 19.5, -105, -115),
          { name: "Over", description: "Fixture Wing Two", price: -110, point: 14.5 }, // one-sided
        ] },
      ],
    },
    {
      key: "bovada", title: "Bovada",
      markets: [{ key: "player_points", last_update: "2026-10-22T21:58:00Z", outcomes: [...ou("Fixture Guard One", 24.5, -110, -110)] }],
    },
  ],
};

/** Event 2: one eligible book with a stale price, a decimal price, two lines for one player, and a future stamp. */
export const EVENT_2 = {
  id: "fx0000000000000000000000000000b2",
  sport_key: "basketball_nba",
  sport_title: "NBA",
  commence_time: "2026-10-23T02:00:00Z",
  home_team: "Los Angeles Lakers",
  away_team: "Golden State Warriors",
  bookmakers: [
    {
      key: "betmgm", title: "BetMGM",
      markets: [
        { key: "player_points", last_update: "2026-10-22T08:00:00Z", outcomes: [...ou("Fixture Laker One", 22.5, -110, -110)] }, // 14 h old at fetch
        { key: "player_assists", last_update: "2026-10-22T21:00:00Z", outcomes: [...ou("Fixture Laker One", 6.5, 1.91, 1.91)] }, // decimal
        { key: "player_threes", last_update: "2026-10-22T21:00:00Z", outcomes: [...ou("Fixture Warrior One", 3.5, -110, -110), ...ou("Fixture Warrior One", 4.5, 150, -190)] },
        { key: "player_rebounds", last_update: "2026-10-22T23:00:00Z", outcomes: [...ou("Fixture Warrior One", 4.5, -110, -110)] }, // after fetch
      ],
    },
  ],
};

export const ok = (body, fetchedAt = FETCHED_AT) => ({ status: 200, body, fetchedAt });
