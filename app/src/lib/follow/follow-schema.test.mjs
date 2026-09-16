/**
 * FOLLOWING CONTRACT TESTS (v1.1.2 · §29 Contract + Identity).
 *
 * Pure: every input is a literal. The contract is where identity is decided, so the hardest
 * guarantees are here rather than in a component — a UI cannot make a follow durable if the store
 * would accept a display name.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  FOLLOW_LEGACY_KEY, FOLLOW_SCHEMA_VERSION, FOLLOW_STORAGE_KEY, FOLLOW_STRUCTURAL_MAX, SUPPORTED_FOLLOW_KINDS,
  canonicalizeRefs, clearAll, emptyDocument, follow, isFollowing, listFollowed, migrateLegacyNames,
  mlbTeamRef, nflPlayerRef, nflTeamRef, normalizeRef, parseDocument, refKey, serializeDocument, unfollow,
} from "./follow-schema.mjs";

const NOW = "2026-09-16T17:00:00.000Z";
const YANKEES = { sport: "MLB", entityType: "team", id: "mlb-team-147" };
const BILLS = { sport: "NFL", entityType: "team", id: "nfl-team-2" };
const GIBBS = { sport: "NFL", entityType: "player", id: "nfl-athlete-4429795" };

/* ───────────────────────────── contract ───────────────────────────── */

test("C1 · empty and missing storage are an empty current-version document", () => {
  for (const raw of [null, undefined, ""]) {
    const r = parseDocument(raw);
    assert.equal(r.status, "EMPTY");
    assert.deepEqual(r.doc, emptyDocument());
  }
  assert.equal(emptyDocument().schemaVersion, FOLLOW_SCHEMA_VERSION);
  assert.equal(emptyDocument().updatedAt, null, "an untouched document claims no update time");
});

test("C2 · a valid document parses, and serialization round-trips byte-identically", () => {
  const raw = JSON.stringify({ schemaVersion: 2, followed: [BILLS, YANKEES, GIBBS], updatedAt: NOW });
  const r = parseDocument(raw);
  assert.equal(r.status, "OK");
  assert.equal(r.doc.followed.length, 3);
  const once = serializeDocument(r.doc);
  const twice = serializeDocument(parseDocument(once).doc);
  assert.equal(once, twice, "stable serialization");
});

test("C3 · ordering is canonical, not click order", () => {
  const a = serializeDocument({ followed: [YANKEES, BILLS, GIBBS], updatedAt: NOW });
  const b = serializeDocument({ followed: [GIBBS, BILLS, YANKEES], updatedAt: NOW });
  assert.equal(a, b, "the same set serializes identically regardless of insertion order");
});

test("C4 · malformed JSON and wrong shapes recover to empty, safely", () => {
  for (const raw of ["{not json", "[]", "42", "\"string\"", "null", JSON.stringify({ followed: [YANKEES] })]) {
    const r = parseDocument(raw);
    assert.ok(["CORRUPT", "EMPTY"].includes(r.status), `${raw} → ${r.status}`);
    assert.deepEqual(r.doc.followed, []);
  }
});

test("C5 · ⚠ a FUTURE schema is read as unsupported and never interpreted as v2", () => {
  const future = JSON.stringify({ schemaVersion: 99, followed: [{ totally: "different" }], newField: true });
  const r = parseDocument(future);
  assert.equal(r.status, "UNSUPPORTED_VERSION");
  assert.equal(r.foundVersion, 99);
  // The caller refuses to write in this state (store tests prove it); the parser does not pretend.
  assert.deepEqual(r.doc.followed, [], "future contents are not guessed at");
});

test("C6 · duplicates collapse to one follow", () => {
  const out = canonicalizeRefs([YANKEES, YANKEES, { ...YANKEES }, BILLS]);
  assert.equal(out.length, 2);
});

test("C7 · casing is canonicalized at the boundary — 'nfl'/'Team' cannot make a second follow", () => {
  const variants = [
    { sport: "nfl", entityType: "team", id: "nfl-team-2" },
    { sport: "NFL", entityType: "TEAM", id: "NFL-TEAM-2" },
    { sport: " Nfl ", entityType: " Team ", id: " nfl-team-2 " },
  ];
  assert.equal(canonicalizeRefs([BILLS, ...variants]).length, 1);
});

test("C8 · unknown sport, unknown type, blank id and malformed ids are refused", () => {
  for (const bad of [
    { sport: "NBA", entityType: "team", id: "nba-team-1" },
    { sport: "MLB", entityType: "coach", id: "mlb-team-147" },
    { sport: "MLB", entityType: "team", id: "" },
    { sport: "MLB", entityType: "team", id: "   " },
    { sport: "MLB", entityType: "team", id: "147" },            // bare provider id, no namespace
    { sport: "MLB", entityType: "team", id: "nfl-team-2" },     // right shape, wrong sport
    { sport: "NFL", entityType: "player", id: "Jahmyr Gibbs" }, // a name is not an id
    { sport: "NFL", entityType: "team", id: "nfl-team-abc" },
    null, 42, "nfl-team-2",
  ]) {
    assert.equal(normalizeRef(bad), null, `${JSON.stringify(bad)} must be refused`);
  }
});

test("C9 · follow is idempotent; unfollow of an absent entity is a no-op", () => {
  let doc = emptyDocument();
  let r = follow(doc, YANKEES, NOW);
  assert.equal(r.changed, true);
  doc = r.doc;
  r = follow(doc, YANKEES, NOW);
  assert.equal(r.changed, false);
  assert.equal(r.reason, "ALREADY_FOLLOWING");
  assert.equal(r.doc.followed.length, 1);

  const u = unfollow(emptyDocument(), BILLS, NOW);
  assert.equal(u.changed, false);
  assert.equal(u.reason, "NOT_FOLLOWING");
});

test("C10 · follow → isFollowing → unfollow → not following", () => {
  let doc = follow(emptyDocument(), BILLS, NOW).doc;
  assert.equal(isFollowing(doc, BILLS), true);
  assert.equal(isFollowing(doc, YANKEES), false);
  doc = unfollow(doc, BILLS, NOW).doc;
  assert.equal(isFollowing(doc, BILLS), false);
  assert.equal(doc.followed.length, 0);
});

test("C11 · filter by sport and by type", () => {
  const doc = { schemaVersion: 2, followed: canonicalizeRefs([YANKEES, BILLS, GIBBS]), updatedAt: NOW };
  assert.deepEqual(listFollowed(doc, { sport: "MLB" }).map(refKey), [refKey(YANKEES)]);
  assert.deepEqual(listFollowed(doc, { sport: "nfl", entityType: "team" }).map(refKey), [refKey(BILLS)]);
  assert.deepEqual(listFollowed(doc, { entityType: "player" }).map(refKey), [refKey(GIBBS)]);
  assert.equal(listFollowed(doc).length, 3);
});

test("C12 · clear all empties the document", () => {
  const cleared = clearAll(NOW);
  assert.deepEqual(cleared.followed, []);
  assert.equal(cleared.schemaVersion, FOLLOW_SCHEMA_VERSION);
});

test("C13 · the structural bound is generous and is not a product shortlist", () => {
  // P251's cap of 12 silently dropped the thirteenth follow. The bound here is a safety rail.
  assert.ok(FOLLOW_STRUCTURAL_MAX >= 200, "a reader following by hand should never meet it");
  let doc = emptyDocument();
  for (let i = 1; i <= 40; i++) doc = follow(doc, mlbTeamRef(i), NOW).doc;
  assert.equal(doc.followed.length, 40, "forty follows are kept — no hidden shortlist");
});

test("C14 · updatedAt is PREFERENCE time only — the contract carries no sports timestamp", () => {
  const doc = follow(emptyDocument(), YANKEES, NOW).doc;
  assert.deepEqual(Object.keys(JSON.parse(serializeDocument(doc))).sort(), ["followed", "schemaVersion", "updatedAt"]);
  assert.deepEqual(Object.keys(doc.followed[0]).sort(), ["entityType", "id", "sport"],
    "a ref carries identity and an optional label hint — no scores, no state, no event");
});

/* ───────────────────────────── identity ───────────────────────────── */

test("I1 · MLB team follows use the StatsAPI team id", () => {
  assert.deepEqual(mlbTeamRef(147), { sport: "MLB", entityType: "team", id: "mlb-team-147" });
  assert.equal(mlbTeamRef(null), null);
  assert.equal(mlbTeamRef("NYY"), null, "an abbreviation is not the id");
});

test("I2 · NFL team follows use the ESPN team id, not the abbreviation", () => {
  // Abbreviations differ BETWEEN sources (ESPN WSH/LAR vs nflverse WAS/LA). The numeric id does not.
  assert.deepEqual(nflTeamRef("2"), { sport: "NFL", entityType: "team", id: "nfl-team-2" });
  assert.equal(nflTeamRef("BUF"), null);
  assert.equal(nflTeamRef("WSH"), null);
});

test("I3 · NFL player follows reuse the board's nfl-athlete-<id> string verbatim", () => {
  assert.deepEqual(nflPlayerRef("nfl-athlete-4429795"), GIBBS);
  assert.equal(nflPlayerRef("4429795"), null, "a bare athlete id lacks the established lineage prefix");
  assert.equal(nflPlayerRef("Jahmyr Gibbs"), null, "a display name is never a player id");
});

test("I4 · ⚠ a display-name change does NOT create a second follow", () => {
  const before = { ...BILLS, label: "Buffalo Bills" };
  const after = { ...BILLS, label: "Buffalo Bills (renamed)" };
  const out = canonicalizeRefs([before, after]);
  assert.equal(out.length, 1, "identity is the id; the label is a hint");
  assert.equal(out[0].label, "Buffalo Bills (renamed)", "the fresher hint is kept");
});

test("I5 · ⚠ the same display name with DIFFERENT ids does not collapse", () => {
  // MLB and NFL both have Giants. Keyed on name, they would be one follow.
  const sfGiants = { sport: "MLB", entityType: "team", id: "mlb-team-137", label: "Giants" };
  const nyGiants = { sport: "NFL", entityType: "team", id: "nfl-team-19", label: "Giants" };
  assert.equal(canonicalizeRefs([sfGiants, nyGiants]).length, 2);
  let doc = follow(emptyDocument(), sfGiants, NOW).doc;
  assert.equal(isFollowing(doc, nyGiants), false, "following SF does not follow NY");
});

test("I6 · ⚠ no MLB player follow path exists", () => {
  assert.equal(SUPPORTED_FOLLOW_KINDS.some((k) => k.sport === "MLB" && k.entityType === "player"), false);
  for (const id of ["mlb-player-592450", "mlb-person-592450", "mlb-athlete-592450", "Aaron Judge"]) {
    assert.equal(normalizeRef({ sport: "MLB", entityType: "player", id }), null, `${id} must be refused`);
  }
  assert.equal(follow(emptyDocument(), { sport: "MLB", entityType: "player", id: "mlb-player-592450" }, NOW).changed, false);
});

test("I7 · a ref cannot smuggle extra fields into storage", () => {
  const r = normalizeRef({ ...YANKEES, score: 7, gameId: "824382", isLive: true, label: "Yankees" });
  assert.deepEqual(Object.keys(r).sort(), ["entityType", "id", "label", "sport"]);
});

/* ─────────────────────────── legacy migration ─────────────────────────── */

test("M1 · P251 name follows migrate forward by an explicit name→ref map", () => {
  const legacy = JSON.stringify(["Buffalo Bills", "Seattle Seahawks"]);
  const map = { "Buffalo Bills": nflTeamRef("2"), "Seattle Seahawks": nflTeamRef("26") };
  const { migrated, unresolved } = migrateLegacyNames(legacy, map);
  assert.deepEqual(migrated.map((r) => r.id), ["nfl-team-2", "nfl-team-26"]);
  assert.deepEqual(unresolved, []);
  assert.equal(migrated[0].label, "Buffalo Bills", "the legacy name becomes the label hint");
});

test("M2 · ⚠ an unresolvable legacy name is REPORTED, never silently dropped", () => {
  const { migrated, unresolved } = migrateLegacyNames(JSON.stringify(["Buffalo Bills", "Mystery Club"]), { "Buffalo Bills": nflTeamRef("2") });
  assert.equal(migrated.length, 1);
  assert.deepEqual(unresolved, ["Mystery Club"]);
});

test("M3 · malformed legacy data migrates nothing and throws nothing", () => {
  for (const raw of ["{bad", "null", "42", JSON.stringify({ a: 1 }), JSON.stringify([1, null, ""])]) {
    const { migrated } = migrateLegacyNames(raw, { x: nflTeamRef("2") });
    assert.deepEqual(migrated, []);
  }
  assert.deepEqual(migrateLegacyNames(JSON.stringify(["Buffalo Bills"]), null).migrated, [], "no map ⇒ nothing guessed");
});

test("M4 · the v2 key is distinct from the legacy key, so an older deploy cannot overwrite v2", () => {
  // P251 code writes a NAME ARRAY to gtp.follow.v1. If v2 lived under the same key, a single click on
  // an older deploy would replace the versioned document with an array. Separate keys make rollback safe.
  assert.notEqual(FOLLOW_STORAGE_KEY, FOLLOW_LEGACY_KEY);
  assert.equal(FOLLOW_LEGACY_KEY, "gtp.follow.v1");
});
