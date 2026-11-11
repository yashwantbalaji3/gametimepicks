/**
 * Founder P0 2026-11-11 (~17:40Z): only an ESTABLISHED starter's (tier a) passing projection is public. A tier (b)–(d)
 * starter's projection is EXPERIMENTAL, displayed only behind GTP_NFL_QB_FALLBACK_PUBLIC (default OFF). OFF, no public
 * file carries such a QB's numbers.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();

test("GTP_NFL_QB_FALLBACK_PUBLIC is a compile-time flag that defaults OFF", () => {
  const cfg = fs.readFileSync(path.join(APP, "next.config.mjs"), "utf8");
  assert.match(cfg, /GTP_NFL_QB_FALLBACK_PUBLIC: process\.env\.GTP_NFL_QB_FALLBACK_PUBLIC === "1" \? "1" : "0"/);
});

test("no committed public player board publishes a non-established starter's passing number", () => {
  const dir = path.join(APP, "public/data/nfl/player-board");
  for (const f of fs.readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const p of b.players ?? []) {
      const m = p.markets?.player_pass_yds;
      if (m?.tier) assert.equal(m.tier, "A_CLUB_HISTORY", `${f} ${p.name}: a ${m.tier} passing line is public`);
    }
    for (const q of b.integrity?.qbStarter ?? []) {
      if (q.experimental) assert.doesNotMatch(JSON.stringify(q), /"median"|"p10"|"p90"|"mean"|starterShare/, `${f} ${q.team}: the published rule carries an experimental number`);
    }
  }
});
