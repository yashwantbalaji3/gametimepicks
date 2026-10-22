/**
 * Reviewed NBA player aliases: each maps one provider string to one ESPN athlete id, verified against the committed
 * roster capture, and still refuses when that athlete is not on either roster of the event.
 * Run: npx tsx --test src/lib/sports/odds/nba-props/player-aliases.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { REVIEWED_PLAYER_ALIASES, resolvePlayer, IDENTITY_METHOD } from "./player-identity.mjs";
import { normalizePlayerName } from "../../../nba/identity-contract.ts";

const REPO = path.resolve(process.cwd(), "..");
const roster = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/research/nba/rosters/latest.json"), "utf8"));
const teamRoster = (abbr) => (roster.teams.find((t) => t.espnAbbr === abbr)?.players ?? []).map((p) => ({ providerAthleteId: String(p.providerAthleteId), displayName: p.displayName, team: abbr }));
const event = (...abbrs) => abbrs.flatMap(teamRoster);
const byId = new Map(roster.teams.flatMap((t) => t.players.map((p) => [String(p.providerAthleteId), { ...p, team: t.espnAbbr }])));

const CASES = [
  { providerName: "Herb Jones", id: "4277813", teams: ["IND", "NO"], espn: "Herbert Jones" },
  { providerName: "Derrick Jones", id: "3936099", teams: ["SAC", "LAC"], espn: "Derrick Jones Jr." },
  { providerName: "Robert Williams", id: "4066211", teams: ["PHX", "POR"], espn: "Robert Williams III" },
];

test("the table holds exactly the three reviewed entries, each with an ESPN id, a reviewer and a note", () => {
  assert.equal(REVIEWED_PLAYER_ALIASES.length, 3);
  for (const a of REVIEWED_PLAYER_ALIASES) {
    assert.match(a.providerAthleteId, /^\d+$/);
    assert.ok(a.reviewedBy && a.reviewedAt && a.note, a.providerName);
    assert.ok(Object.isFrozen(a));
  }
  const keys = REVIEWED_PLAYER_ALIASES.map((a) => normalizePlayerName(a.providerName));
  assert.equal(new Set(keys).size, keys.length, "one entry per provider spelling");
});

test("each alias names the roster player the committed capture lists under the full name, on the right team", () => {
  for (const c of CASES) {
    const p = byId.get(c.id);
    assert.ok(p, `${c.id} is in the roster capture`);
    assert.equal(p.displayName, c.espn);
    assert.ok(c.teams.includes(p.team), `${c.espn} plays for one of ${c.teams.join("/")}`);
    const r = resolvePlayer(c.providerName, event(...c.teams));
    assert.deepEqual([r.state, r.providerAthleteId, r.method], ["RESOLVED", c.id, IDENTITY_METHOD.ALIAS], c.providerName);
    // Without the alias the string does not resolve: the alias is necessary, and nothing is matched by surname.
    assert.equal(resolvePlayer(c.providerName, event(...c.teams), { aliases: [] }).state, "REFUSED");
  }
});

test("an alias never attaches a price to a game its athlete is not in (traded / wrong event refuses)", () => {
  for (const c of CASES) {
    const r = resolvePlayer(c.providerName, event("BOS", "DET"));
    assert.equal(r.state, "REFUSED", c.providerName);
    assert.match(r.detail, /not on either roster/);
  }
});

test("the aliases change nothing for names that already resolve exactly", () => {
  const ev = event("IND", "NO");
  const someone = ev.find((p) => p.providerAthleteId !== "4277813");
  assert.equal(resolvePlayer(someone.displayName, ev).method, IDENTITY_METHOD.EXACT_NAME);
  assert.equal(resolvePlayer("Herbert Jones", ev).providerAthleteId, "4277813", "the full ESPN name still resolves exactly");
});
