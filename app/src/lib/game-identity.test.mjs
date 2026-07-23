/**
 * MLB GAME IDENTITY guards (Phases 2-4). Every public game URL must map to exactly one real game, doubleheaders
 * get distinct URLs, the ambiguous bare slug disambiguates (never a silent pick), and the joined artifacts must
 * agree on the fixture's gamePk (reconciliation). The resolver tests run against the LIVE board and discover any
 * doubleheader dynamically, so they survive daily slate changes. Run:
 *   npx tsx --test src/lib/game-identity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAllGameDetails,
  getGameDetail,
  getGameDisambiguation,
  gameDetailParams,
  reconcileMlbGame,
} from "./game-detail.ts";

const all = buildAllGameDetails();
const mlb = all.filter((d) => d.sport === "mlb");
// Discover any doubleheader (base slug shared by >1 MLB detail on the live slate).
const byBase = new Map();
for (const d of mlb) byBase.set(d.baseSlug, [...(byBase.get(d.baseSlug) ?? []), d]);
const doubleheaders = [...byBase.entries()].filter(([, ds]) => ds.length > 1);

test("1 · every game detail has a UNIQUE canonical slug (one gameId ↔ one URL)", () => {
  const keys = all.map((d) => `${d.sport}/${d.slug}`);
  assert.equal(new Set(keys).size, keys.length, "no two games share a canonical slug");
});

test("2 · gameDetailParams emits no duplicate (sport,gameId) — safe for static export", () => {
  const keys = gameDetailParams().map((p) => `${p.sport}/${p.gameId}`);
  assert.equal(new Set(keys).size, keys.length, "no duplicate static-export params");
});

test("3 · a unique regular game resolves to exactly itself (base slug, no churn)", () => {
  const unique = mlb.find((d) => d.slug === d.baseSlug && (byBase.get(d.baseSlug)?.length ?? 0) === 1);
  if (!unique) return; // empty/all-doubleheader slate ⇒ nothing to assert
  const got = getGameDetail("mlb", unique.slug);
  assert.ok(got, "unique slug resolves");
  assert.equal(got.slug, unique.slug);
  assert.equal(got.matchId, unique.matchId);
});

test("4 · doubleheader — each game gets its OWN unique slug (suffix = gamePk); URLs differ; resolves to the RIGHT game", () => {
  if (doubleheaders.length === 0) {
    console.log("no doubleheader on the current slate — dynamic case skipped");
    return;
  }
  const [base, games] = doubleheaders[0];
  for (const g of games) {
    assert.notEqual(g.slug, base, "a doubleheader game must NOT keep the bare base slug");
    assert.equal(g.slug, `${base}-${g.matchId}`, "disambiguator is the stable gamePk");
    const got = getGameDetail("mlb", g.slug);
    assert.ok(got, "unique slug resolves");
    assert.equal(got.matchId, g.matchId, "resolves to the exact game, not its twin");
  }
  assert.equal(new Set(games.map((g) => g.slug)).size, games.length, "distinct URLs");
});

test("5 · the ambiguous bare doubleheader slug NEVER resolves to one game — it disambiguates", () => {
  if (doubleheaders.length === 0) return;
  const [base, games] = doubleheaders[0];
  assert.equal(getGameDetail("mlb", base), null, "bare slug must not silently pick a game");
  const dis = getGameDisambiguation("mlb", base);
  assert.ok(dis, "bare slug yields a disambiguation");
  assert.equal(dis.options.length, games.length, "one option per real game");
});

test("6 · unknown gameId resolves to null and offers no disambiguation", () => {
  assert.equal(getGameDetail("mlb", "nope-vs-nada-2020-01-01"), null);
  assert.equal(getGameDisambiguation("mlb", "nope-vs-nada-2020-01-01"), null);
});

test("7 · every generated static param resolves to a game OR a disambiguation (no dead routes)", () => {
  for (const p of gameDetailParams()) {
    const resolves = getGameDetail(p.sport, p.gameId) || getGameDisambiguation(p.sport, p.gameId);
    assert.ok(resolves, `param ${p.sport}/${p.gameId} must resolve to a game or disambiguation`);
  }
});

// ── reconcileMlbGame (pure; Phase 4 game-to-artifact consistency) ──
const B = "pit-vs-nyy-2026-07-22";

test("8 · reconcile OK: unique slug + a ready sim whose gamePk matches the fixture", () => {
  assert.deepEqual(
    reconcileMlbGame({ slug: B, baseSlug: B, matchId: "823518", gameLabSimulation: { status: "ready", gamePk: 823518 } }),
    { ok: true, reason: "ok" },
  );
});

test("9 · reconcile OK: a disambiguated slug whose suffix equals the fixture gamePk", () => {
  assert.equal(
    reconcileMlbGame({ slug: `${B}-823518`, baseSlug: B, matchId: "823518", gameLabSimulation: null }).ok,
    true,
  );
});

test("10 · reconcile FAIL: disambiguated slug suffix ≠ matchId (URL pinned to the wrong game)", () => {
  const r = reconcileMlbGame({ slug: `${B}-999999`, baseSlug: B, matchId: "823518", gameLabSimulation: null });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "slug_gameid_mismatch");
});

test("11 · reconcile FAIL: sim built from a DIFFERENT gamePk (doubleheader mis-join)", () => {
  const r = reconcileMlbGame({ slug: B, baseSlug: B, matchId: "823518", gameLabSimulation: { status: "ready", gamePk: 823519 } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "sim_gamepk_mismatch");
});

test("12 · reconcile OK for a postponed/unsimulated game: an UNAVAILABLE sim is not a mismatch", () => {
  assert.equal(
    reconcileMlbGame({ slug: B, baseSlug: B, matchId: "823518", gameLabSimulation: { status: "unavailable", gamePk: null } }).ok,
    true,
  );
});
