/* SYNTHETIC NFL player board + offer rows for the prop-line adapter tests. Every number is invented; the event and player
   ids are fixture ids (no real game, player or price). Tests only — no shipped module may import this file. */
export const FX_EVENT = "999000001";
export const FX_KICKOFF = "2099-01-10T18:00:00Z";
export const FX_AS_OF = "2099-01-10T16:00:00Z"; // 2 h before kickoff
const H = (h) => new Date(Date.parse(FX_KICKOFF) - h * 3600_000).toISOString();

export const FX_BOARD = Object.freeze({
  providerEventId: FX_EVENT, kickoffUtc: FX_KICKOFF, matchup: "AAA @ BBB",
  families: {
    player_pass_yds: { state: "ESTIMATE" }, player_rush_yds: { state: "ESTIMATE" },
    player_reception_yds: { state: "PUBLISHED" }, player_receptions: { state: "PUBLISHED" }, anytime_td: { state: "PUBLISHED" },
  },
  players: [
    { playerId: "nfl-athlete-1", name: "Fixture Receiver", team: "AAA", markets: { player_receptions: { median: 5.6 }, player_reception_yds: { median: 61.2 }, anytime_td: { probability: 0.4123 } } },
    { playerId: "nfl-athlete-2", name: "Fixture Tightend", team: "AAA", markets: { player_receptions: { median: 3.5 }, player_reception_yds: { median: 30.04 } } },
    { playerId: "nfl-athlete-3", name: "Fixture Passer", team: "BBB", markets: { player_pass_yds: { median: 250.3 }, player_rush_yds: { median: 12.1 }, anytime_td: { probability: 0.08 } } },
    { playerId: "nfl-athlete-4", name: "Fixture Back", team: "BBB", markets: { player_rush_yds: { median: 70.2 }, player_receptions: { median: 2.4 }, player_reception_yds: { median: 18 } } },
  ],
});

const row = (playerId, market, book, line, h, extra = {}) => ({ canonicalEventId: `nfl-${FX_EVENT}`, playerId, market, book, line, overPrice: -115, underPrice: -105, capturedAt: H(h), ...extra });
export const FX_OFFERS = Object.freeze([
  row("nfl-athlete-1", "player_receptions", "draftkings", 4.5, 3),        // OVER  5.6 vs 4.5
  row("nfl-athlete-1", "player_receptions", "fanduel", 5.5, 3),           // tie on time → draftkings (book name)
  row("nfl-athlete-1", "player_reception_yds", "fanduel", 64.5, 3),       // UNDER 61.2 vs 64.5
  row("nfl-athlete-1", "player_reception_yds", "bovada", 50.5, 2.5),      // ineligible (later) → never chosen
  row("nfl-athlete-2", "player_receptions", "betmgm", 3.5, 3),            // NEUTRAL
  row("nfl-athlete-2", "player_reception_yds", "draftkings", 29.5, 20),   // STALE (20 h before kickoff, 18 h before asOf)
  row("nfl-athlete-3", "player_pass_yds", "draftkings", 240.5, 3),        // withheld family → NOT_PUBLISHED, never a direction
  row("nfl-athlete-3", "player_rush_yds", "draftkings", 10.5, 3),         // withheld family
  row("nfl-athlete-4", "player_receptions", "draftkings", 2.5, -1),       // captured after kickoff
  row("nfl-athlete-4", "player_reception_yds", "bovada", 15.5, 3),        // only an ineligible book
  row("nfl-athlete-4", "player_rush_yds", "draftkings", 66.5, 3),         // withheld family
  { canonicalEventId: `nfl-${FX_EVENT}`, playerId: "nfl-athlete-1", market: "player_anytime_td", book: "draftkings", price: 150, capturedAt: H(3) },
  { canonicalEventId: `nfl-${FX_EVENT}`, playerId: "nfl-athlete-3", market: "player_anytime_td", book: "fanduel", price: 900, capturedAt: H(4) },
  row("nfl-athlete-9", "player_receptions", "draftkings", 3.5, 3),        // a player NOT on the board → never a row
  { ...row("nfl-athlete-1", "player_receptions", "draftkings", 4.5, 3), canonicalEventId: "nfl-999000002" }, // another event
]);
