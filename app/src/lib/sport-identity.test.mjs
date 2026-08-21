/**
 * Tests for the central sport-identity layer (`sport-identity.ts`).
 * Locks the identity metadata each sport surface relies on (label,
 * short label, icon glyph, accent var, gradient) and the alias
 * normalisation that maps the many sport spellings used across data + UI
 * to one canonical identity.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getSportIdentity,
  hasSportIdentity,
  normalizeSportIdentityKey,
  SPORT_IDENTITIES,
} from "./sport-identity.ts";

test("every canonical sport returns full identity metadata", () => {
  for (const key of ["soccer", "mlb", "nba", "ufc", "nhl", "ipl", "mixed", "bank_builder"]) {
    const id = getSportIdentity(key);
    assert.equal(id.key, key, `key ${key}`);
    assert.ok(id.label && typeof id.label === "string", `${key} label`);
    assert.ok(id.shortLabel && typeof id.shortLabel === "string", `${key} shortLabel`);
    assert.ok(id.icon && id.icon.length >= 1, `${key} icon glyph`);
    assert.match(id.accentVar, /^var\(--sport-/, `${key} accentVar`);
    assert.match(id.gradient, /linear-gradient/, `${key} gradient`);
    assert.ok(id.ballLabel && typeof id.ballLabel === "string", `${key} ballLabel`);
  }
});

test("World Cup, MLB, NBA, UFC, mixed all resolve to distinct icons", () => {
  const icons = ["world_cup", "mlb", "nba", "ufc", "mixed"].map((s) => getSportIdentity(s).icon);
  assert.deepEqual(icons, ["⚽", "⚾", "🏀", "🥊", "🔀"]);
});

test("aliases map to the canonical identity", () => {
  /*
   * Soccer family — MINUS the Premier League. P188 gave EPL its own identity because the `soccer`
   * entry is LABELLED "World Cup": while EPL aliased to it, every EPL chip on the simulation hub
   * would have rendered "World Cup" beside a Premier League fixture. An alias is only correct when
   * the two things are the same thing to a reader, and a competition label is not.
   */
  for (const a of ["soccer", "world_cup", "world cup", "fifa-world-cup", "wc", "mls"]) {
    assert.equal(getSportIdentity(a).key, "soccer", `alias ${a}`);
  }
  assert.equal(getSportIdentity("epl").key, "epl", "the Premier League resolves to its own identity");
  assert.equal(getSportIdentity("epl").label, "Premier League", "and carries its own label, not the World Cup's");
  // basketball family (WNBA folds into the NBA identity)
  for (const a of ["nba", "wnba", "basketball"]) {
    assert.equal(getSportIdentity(a).key, "nba", `alias ${a}`);
  }
  assert.equal(getSportIdentity("baseball").key, "mlb");
  assert.equal(getSportIdentity("mma").key, "ufc");
  assert.equal(getSportIdentity("hockey").key, "nhl");
  assert.equal(getSportIdentity("cricket").key, "ipl");
  assert.equal(getSportIdentity("bank-builder").key, "bank_builder");
});

test("identity resolution is case/space/underscore insensitive", () => {
  assert.equal(getSportIdentity("  World_Cup  ").key, "soccer");
  assert.equal(getSportIdentity("WORLD CUP").key, "soccer");
  assert.equal(getSportIdentity("Bank Builder".replace(" ", "_")).key, "bank_builder");
  assert.equal(normalizeSportIdentityKey("  Foo  Bar "), "foo bar");
});

test("unknown / empty sport falls back to the neutral mixed identity", () => {
  assert.equal(getSportIdentity("quidditch").key, "mixed");
  assert.equal(getSportIdentity("").key, "mixed");
  assert.equal(getSportIdentity(null).key, "mixed");
  assert.equal(getSportIdentity(undefined).key, "mixed");
});

test("hasSportIdentity flags known vs unknown sports", () => {
  assert.equal(hasSportIdentity("world_cup"), true);
  assert.equal(hasSportIdentity("mlb"), true);
  assert.equal(hasSportIdentity("quidditch"), false);
  assert.equal(hasSportIdentity(""), false);
});

test("SPORT_IDENTITIES is frozen and covers all ten identities", () => {
  assert.ok(Object.isFrozen(SPORT_IDENTITIES));
  assert.equal(SPORT_IDENTITIES.length, 10);   // +epl (P188)
  const keys = SPORT_IDENTITIES.map((s) => s.key).sort();
  assert.deepEqual(keys, ["bank_builder", "epl", "ipl", "mixed", "mlb", "nba", "nfl", "nhl", "soccer", "ufc"]);
});
