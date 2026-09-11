import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, devigMoneyline, buildGameLines, indexPlayersByPfr, buildParticipation } from "./nflverse.mjs";

test("CSV parsing handles quoted commas, escaped quotes and CRLF", () => {
  const rows = parseCsv('a,b,c\r\n1,"x, y","say ""hi"""\r\n2,,z\r\n');
  assert.deepEqual(rows, [{ a: "1", b: "x, y", c: 'say "hi"' }, { a: "2", b: "", c: "z" }]);
});

test("two-way de-vig: favourite keeps the larger share, and a missing price refuses", () => {
  const d = devigMoneyline(-166, 140);
  assert.ok(d.home > d.away && Math.abs(d.home + d.away - 1) < 1e-3 && d.overround > 0);
  assert.equal(devigMoneyline("", 140), null);
});

test("game lines: home spread is the negative of nflverse's spread_line, scheduled games carry no final", () => {
  const [g] = buildGameLines([{ game_id: "2026_01_CHI_CAR", season: "2026", game_type: "REG", week: "1", home_team: "CAR", away_team: "CHI", home_score: "", away_score: "", spread_line: "-3", total_line: "47.5", home_moneyline: "142", away_moneyline: "-170", espn: "401872661", roof: "outdoors", surface: "grass", temp: "", wind: "" }]);
  assert.equal(g.close.spreadHome, 3, "CHI favoured by 3 on the road ⇒ CAR +3");
  assert.equal(g.final, null);
  assert.ok(g.close.moneyline.away > g.close.moneyline.home);
});

test("participation joins pfr → gsis → espn and COUNTS what it cannot join, never dropping it", () => {
  const byPfr = indexPlayersByPfr([{ pfr_id: "BankKe01", gsis_id: "00-1", espn_id: "123", display_name: "Kelvin Banks", position: "T" }]);
  const { rows, unjoined } = buildParticipation([
    { game_id: "2025_01_ARI_NO", season: "2025", game_type: "REG", week: "1", player: "Kelvin Banks", pfr_player_id: "BankKe01", position: "T", team: "NO", opponent: "ARI", offense_snaps: "75", offense_pct: "1" },
    { game_id: "2025_01_ARI_NO", season: "2025", game_type: "REG", week: "1", player: "Nobody Known", pfr_player_id: "NobodX01", position: "WR", team: "NO", opponent: "ARI", offense_snaps: "10", offense_pct: "0.13" },
    { game_id: "2025_01_ARI_NO", season: "2025", game_type: "REG", week: "1", player: "A Defender", pfr_player_id: "DefeAx01", position: "CB", team: "NO", opponent: "ARI", offense_snaps: "0", offense_pct: "0" },
  ], byPfr);
  assert.equal(rows.length, 2, "offense only");
  assert.equal(rows[0].espnId, "123");
  assert.equal(rows[1].espnId, null);
  assert.equal(unjoined, 1);
});
