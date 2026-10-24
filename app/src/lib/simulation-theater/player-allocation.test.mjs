/**
 * Simulation Theater V2 · NFL player allocation (`nfl-player-allocation@1`): allocated lines reconcile exactly with the
 * run's drives, join the official snapshot by nfl-athlete id only, are labelled ALLOCATED, are deterministic per
 * (receipt, runIndex) and fail closed to the NOT_MODELED rows. The consistency audit's independent validator
 * (checks.mjs nflAllocatedLineInvariants) catches every mutation of an allocation.
 *
 * Run: npx tsx --test src/lib/simulation-theater/player-allocation.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { adaptReceipt } from "./adapter-nfl-sim-v2.mjs";
import { adaptAllReceipts, nflTheaterOfficial, loadTheater } from "./loader.mjs";
import { packTheater, unpackTheater } from "./theater-pack.mjs";
import {
  ALLOCATED_DISCLOSURE, ALLOCATED_LABEL, ALLOCATED_STATUS, ALLOCATION_ERROR_KIND, ALLOCATION_RULES, ALLOCATION_VERSION, CONSTANTS_DERIVATION,
  allocateNflPlayers, apportion, safeAllocateNflPlayers,
} from "./player-allocation.mjs";
import { CATEGORY_GROUPS, PLAYER_SECTIONS, STATUS, STATUS_LABEL, nflBoxScore } from "./box-score.mjs";
import { ALLOCATED_EXACT_LABEL, nflAllocatedLineInvariants } from "../consistency/checks.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
/** The write-once receipt whose MEDIAN_LIKE run #48 is the Theater's default for 401873008 (loader.mjs re-pin note). */
const RUN48_FILE = "data/internal/research/nfl/sim-v2/shadow/2026-10-19/401873008-93e33ba709b93f85.json";
const SIDES = ["away", "home"];
const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);

const snapshots = new Map();
const officialOf = (id) => {
  if (!snapshots.has(id)) snapshots.set(id, nflTheaterOfficial(REPO, id));
  return snapshots.get(id);
};
const rawOf = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), "utf8"));
const adaptFile = (rel) => {
  const a = adaptReceipt(rawOf(rel), { file: rel });
  assert.ok(a.ok, `${rel} adapts`);
  return a.manifest;
};
const entryOf = (raw, manifest, sample, snapshot, res) => ({
  runIndex: sample.runIndex,
  drives: raw.representativeRuns.find((r) => r.runIndex === sample.runIndex).drives,
  snapshot,
  teams: { home: manifest.teams.home.abbr, away: manifest.teams.away.abbr },
  allocation: res.allocation,
  error: res.error,
});

/* ───────────────────────────── the founder's label ───────────────────────────── */

/** Founder decision 2026-10-20, verbatim: every derived player statistic is labelled exactly this. */
const FOUNDER_LABEL = "Allocated estimate — not simulated or official model projection.";

test("every allocated statistic carries the founder's exact wording (code, status tag, sections, group, audit)", () => {
  assert.equal(ALLOCATED_LABEL, FOUNDER_LABEL);
  assert.equal(ALLOCATED_DISCLOSURE, FOUNDER_LABEL);
  assert.equal(STATUS_LABEL[STATUS.ALLOCATED], FOUNDER_LABEL);
  assert.equal(ALLOCATED_EXACT_LABEL, FOUNDER_LABEL, "the audit holds its own copy");
  const m = adaptFile(RUN48_FILE);
  const box = nflBoxScore(m.samples.find((x) => x.runIndex === 48), m, { official: officialOf("401873008").snapshot });
  const allocated = box.players.filter((p) => p.status === STATUS.ALLOCATED);
  assert.deepEqual(allocated.map((p) => p.id), ["passing", "rushing", "receiving"]);
  for (const p of allocated) {
    assert.equal(p.note, FOUNDER_LABEL);
    assert.equal(p.disclosure, FOUNDER_LABEL);
  }
  const cats = box.categories.filter((c) => c.status === STATUS.ALLOCATED);
  assert.deepEqual(cats.map((c) => c.id), ["passYds", "rushYds", "unattributedYds"]);
  for (const c of cats) assert.equal(c.group, FOUNDER_LABEL);
  assert.equal(box.allocation.label, FOUNDER_LABEL);
  assert.ok(!/official projection"|Allocated from the official|Allocated, not simulated/.test(JSON.stringify(box)), "no superseded wording anywhere");
});

/* ───────────────────────────── apportionment ───────────────────────────── */

test("apportion: exact totals, largest remainder, ties by id, caps honoured, refuses what cannot be placed", () => {
  const m = apportion(10, [{ id: "b", w: 1 }, { id: "a", w: 1 }, { id: "c", w: 1 }]);
  assert.deepEqual([...m.entries()].sort(), [["a", 4], ["b", 3], ["c", 3]], "the tie goes to the lower id");
  const capped = apportion(7, [{ id: "a", w: 10, cap: 2 }, { id: "b", w: 1 }, { id: "c", w: 1, cap: 1 }]);
  assert.deepEqual(Object.fromEntries(capped), { a: 2, b: 4, c: 1 });
  assert.equal([...apportion(0, [{ id: "a", w: 0 }]).values()][0], 0);
  assert.throws(() => apportion(3, [{ id: "a", w: 0 }]), RangeError);
  assert.throws(() => apportion(3, [{ id: "a", w: 1, cap: 1 }, { id: "b", w: 1, cap: 1 }]), RangeError);
  for (let n = 0; n < 60; n++) {
    const items = [{ id: "x", w: 0.37 }, { id: "y", w: 2.2 }, { id: "z", w: 1 / 3, cap: Math.floor(n / 4) }];
    assert.equal([...apportion(n, items).values()].reduce((a, b) => a + b, 0), n);
  }
});

/* ───────────────────────────── the two allocation constants ───────────────────────────── */

test("the two constants are recomputed from the committed nflverse team-game file (2021–2025 REG, box-score conventions)", () => {
  const D = CONSTANTS_DERIVATION;
  const games = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, D.file))).toString("utf8"))
    .filter((g) => g.s >= D.seasons[0] && g.s <= D.seasons[1] && g.st === D.seasonType);
  const S = (k) => games.reduce((a, g) => a + (g[k] ?? 0), 0);
  assert.equal(games.length, 2718, "five regular seasons of team-games");
  assert.equal(S("passAtt") + S("spikes") + S("rushAtt") + S("scrambles") + S("kneels") + S("sacks"), S("plays"), "every scrimmage play is an attempt, a carry or a sack");
  const round = (x) => Number(x.toFixed(D.precision));
  assert.equal(ALLOCATION_RULES.completionRate, round(S("cmp") / (S("passAtt") + S("spikes"))));
  assert.equal(ALLOCATION_RULES.yardsPerCarry, round(S("rushYds") / (S("rushAtt") + S("scrambles") + S("kneels"))));
});

/* ───────────────────────────── every committed receipt ───────────────────────────── */

test("EVERY validated run of every committed sim-v2 receipt: allocated lines reconcile exactly, or the box keeps NOT_MODELED", () => {
  let receipts = 0;
  let runs = 0;
  let allocated = 0;
  const refusals = {};
  for (const a of adaptAllReceipts(REPO)) {
    if (!a.ok || !Array.isArray(a.manifest?.samples)) continue;
    receipts++;
    const raw = rawOf(a.file);
    const off = officialOf(a.manifest.eventId);
    for (const s of a.manifest.samples) {
      if (!s.validation.ok) continue;
      runs++;
      const box = nflBoxScore(s, a.manifest, { official: off.snapshot });
      if (!off.snapshot) {
        assert.equal(box.allocation.ok, false);
        assert.deepEqual(box.players, PLAYER_SECTIONS.map((p) => ({ ...p })));
        continue;
      }
      const res = safeAllocateNflPlayers(s, a.manifest, off.snapshot);
      if (!res.ok) {
        refusals[res.error.code] = (refusals[res.error.code] ?? 0) + 1;
        assert.equal(res.error.kind, ALLOCATION_ERROR_KIND.INPUT, `${a.file} run #${s.runIndex}: only missing inputs refuse (${res.error.code} ${res.error.reason})`);
        assert.deepEqual(box.players, PLAYER_SECTIONS.map((p) => ({ ...p })), "fail closed: today's NOT_MODELED rows, exactly");
        assert.deepEqual(box.allocation, { ok: false, version: ALLOCATION_VERSION, ...res.error });
        assert.equal(box.categories.find((c) => c.id === "passRush").status, STATUS.NOT_MODELED);
        continue;
      }
      allocated++;
      const A = res.allocation;
      const where = `${a.file} run #${s.runIndex}`;
      // the audit's independent validator (raw drives + official snapshot) finds nothing
      assert.deepEqual(nflAllocatedLineInvariants(entryOf(raw, a.manifest, s, off.snapshot, res)), [], where);
      // and the reconciliations, recomputed here from the raw drives
      const drives = raw.representativeRuns.find((r) => r.runIndex === s.runIndex).drives;
      for (const [side, o] of [["home", 0], ["away", 1]]) {
        const { team: t, lines: L } = A.teams[side];
        const off2 = drives.map((d, i) => ({ ...d, n: i + 1 })).filter((d) => d.offense === o);
        assert.equal(t.passYds + t.rushYds + t.unattributedYds, off2.reduce((x, d) => x + d.netYards, 0), `${where} ${side}: passing + rushing + unattributed = net yards`);
        assert.ok(t.unattributedYds <= 0, "only losses are unattributed");
        assert.equal(t.attempts + t.carries, off2.reduce((x, d) => x + d.plays, 0));
        assert.ok(t.completions <= t.attempts);
        for (const r of L.passing) assert.ok(r.cmp <= r.att, `${where}: ${r.playerId} completions ≤ attempts`);
        for (const r of L.receiving) assert.ok(r.rec <= r.tgt, `${where}: ${r.playerId} receptions ≤ targets`);
        assert.equal(sum(L.receiving, "yds"), sum(L.passing, "yds"), "receiving yards = passing yards");
        const tdDrives = off2.filter((d) => d.result === "TD").map((d) => d.n);
        assert.deepEqual(A.touchdowns.filter((x) => x.side === side).map((x) => x.drive), tdDrives, "TDs only on (and on every) TD drive");
        for (const r of [...L.passing, ...L.rushing, ...L.receiving]) assert.match(r.playerId, /^nfl-athlete-\d+$/);
      }
      for (const x of A.touchdowns) assert.equal(drives[x.drive - 1].result, "TD", "every allocated TD sits on a TD drive");
      // labelled and kept apart from MODELED / DERIVED
      for (const p of box.players) {
        if (["passing", "rushing", "receiving"].includes(p.id)) {
          assert.equal(p.status, STATUS.ALLOCATED);
          assert.equal(p.note, ALLOCATED_LABEL);
          assert.equal(p.disclosure, ALLOCATED_DISCLOSURE, "founder wording on every allocated section");
        } else assert.equal(p.status, STATUS.NOT_MODELED, `${p.id} stays not modeled`);
      }
      for (const c of box.categories.filter((x) => x.status === STATUS.ALLOCATED)) assert.equal(c.group, ALLOCATED_LABEL);
      assert.ok(!box.categories.some((c) => c.id === "passRush"), "the NOT_MODELED pass/rush row is replaced by allocated rows");
      assert.equal(box.allocation.ok, true);
      assert.equal(box.allocation.snapshotId, off.snapshot.snapshotId);
    }
  }
  assert.ok(receipts >= 100, `exercised ${receipts} receipts`);
  assert.ok(allocated >= 500, `allocated ${allocated} runs`);
  console.log(`# allocation: ${allocated} of ${runs} validated runs over ${receipts} receipts allocated and reconciled; fail-closed: ${JSON.stringify(refusals)}`);
});

/* ───────────────────────────── the default run for 401873008 ───────────────────────────── */

test("401873008 run #48 (WSH 20–30 SF): the worked example, pinned", () => {
  const m = adaptFile(RUN48_FILE);
  const s = m.samples.find((x) => x.runIndex === 48);
  const off = officialOf("401873008");
  assert.equal(off.refusal, null);
  const box = nflBoxScore(s, m, { official: off.snapshot });
  assert.equal(box.header.scoreLine, "WSH 20–30 SF");
  const A = box.allocation;
  assert.equal(A.ok, true);
  assert.equal(A.version, ALLOCATION_VERSION);
  assert.deepEqual(A.officialSources.map((x) => x.path), ["data/internal/nfl/forecast-receipts/2026-10-20/401873008-rev-0007Z.json", "app/public/data/nfl/player-board/401873008.json"]);
  const pick = (t) => [t.plays, t.attempts, t.completions, t.carries, t.netYards, t.passYds, t.rushYds, t.unattributedYds];
  assert.deepEqual(pick(A.teams.away), [63, 42, 27, 21, 378, 273, 107, -2]);
  assert.deepEqual(pick(A.teams.home), [51, 29, 19, 22, 446, 308, 139, -1]);
  assert.deepEqual(A.teams.away.unattributedDrives, [{ drive: 15, netYards: -2 }]);
  const sec = (id, side) => box.players.find((p) => p.id === id)[side].rows;
  assert.deepEqual(sec("passing", "home"), [{ playerId: "nfl-athlete-4361741", name: "Brock Purdy", att: 29, cmp: 19, yds: 308, td: 3 }]);
  assert.deepEqual(sec("passing", "away"), [{ playerId: "nfl-athlete-4426348", name: "Jayden Daniels", att: 42, cmp: 27, yds: 273, td: 2 }]);
  assert.deepEqual(sec("rushing", "home")[0], { playerId: "nfl-athlete-3117251", name: "Christian McCaffrey", car: 10, yds: 65, td: 1 });
  assert.equal(box.allocation.disclosure, FOUNDER_LABEL);
  assert.deepEqual(A.touchdowns.map((x) => [x.drive, x.side, x.type, x.scorerId, x.passerId]), [
    [4, "home", "RUSH", "nfl-athlete-3117251", null], // McCaffrey
    [8, "home", "REC", "nfl-athlete-16737", "nfl-athlete-4361741"], // Evans from Purdy
    [9, "away", "REC", "nfl-athlete-2976212", "nfl-athlete-4426348"], // Diggs from Daniels
    [16, "home", "REC", "nfl-athlete-3040151", "nfl-athlete-4361741"], // Kittle
    [19, "away", "REC", "nfl-athlete-3121422", "nfl-athlete-4426348"], // McLaurin
    [22, "home", "REC", "nfl-athlete-4360438", "nfl-athlete-4361741"], // Aiyuk
  ]);
  assert.deepEqual(A.unallocated, [{ playerId: "nfl-athlete-4421446", reason: "NO_VOLUME_FAMILY", team: "WSH" }], "an anytime-TD-only row gets no line");
});

test("determinism per (receipt, runIndex), and the client path (unpacked theater-pack@1) allocates byte-identically", () => {
  const t = loadTheater(REPO, "401873008");
  const off = officialOf("401873008");
  const client = unpackTheater(JSON.parse(JSON.stringify(packTheater(t.manifest))));
  const seen = new Set();
  t.manifest.samples.forEach((s, i) => {
    const a = JSON.stringify(nflBoxScore(s, t.manifest, { official: off.snapshot }));
    assert.equal(JSON.stringify(nflBoxScore(s, t.manifest, { official: structuredClone(off.snapshot) })), a, "same input, same output");
    assert.equal(JSON.stringify(nflBoxScore(client.samples[i], client, { official: off.snapshot })), a, `sample ${i}: client = server`);
    seen.add(JSON.stringify(JSON.parse(a).players));
  });
  assert.ok(seen.size > 1, "different runs, different allocations");
});

/* ───────────────────────────── identity: by id only ───────────────────────────── */

test("joined by nfl-athlete id only: names are presentation, an id-less or other-team row is never matched", () => {
  const m = adaptFile(RUN48_FILE);
  const s = m.samples.find((x) => x.runIndex === 48);
  const snap = officialOf("401873008").snapshot;
  const base = allocateNflPlayers(s, m, snap);
  const strip = (a) => JSON.stringify(a.teams, (k, v) => (k === "name" ? undefined : v));
  // swap every display name around: numbers and ids do not move
  const names = snap.players.map((p) => p.displayName).reverse();
  const swapped = { ...snap, players: snap.players.map((p, i) => ({ ...p, displayName: names[i] })) };
  assert.equal(strip(allocateNflPlayers(s, m, swapped)), strip(base));
  // a row whose id is replaced by its name (or another team's abbreviation) contributes nothing
  const purdy = "nfl-athlete-4361741";
  const renamed = { ...snap, players: snap.players.map((p) => (p.playerId === purdy ? { ...p, playerId: "Brock Purdy" } : p)) };
  const r = safeAllocateNflPlayers(s, m, renamed);
  assert.equal(r.ok, false, "SF has no passer once its only passer is keyed by name");
  assert.equal(r.error.code, "NO_PASSER");
  const moved = { ...snap, players: snap.players.map((p) => (p.playerId === purdy ? { ...p, team: "WSH" } : p)) };
  assert.equal(safeAllocateNflPlayers(s, m, moved).error.code, "NO_PASSER");
});

/* ───────────────────────────── fail closed ───────────────────────────── */

test("fails closed to today's NOT_MODELED rows when an input is missing or mismatched", () => {
  const m = adaptFile(RUN48_FILE);
  const s = m.samples.find((x) => x.runIndex === 48);
  const snap = officialOf("401873008").snapshot;
  const dropFam = (fam) => ({ ...snap, players: snap.players.map((p) => { const f = { ...p.families }; delete f[fam]; return { ...p, families: f }; }) });
  const cases = [
    ["NO_OFFICIAL_SNAPSHOT", null],
    ["NO_OFFICIAL_SNAPSHOT", { ...snap, sport: "NBA" }],
    ["EVENT_MISMATCH", { ...snap, eventId: "401873009" }],
    ["TEAM_MISMATCH", { ...snap, home: { abbr: "KC" } }],
    ["NO_PASSER", dropFam("player_pass_yds")],
    ["NO_RUSHER", dropFam("player_rush_yds")],
    ["NO_RECEIVER", dropFam("player_receptions")],
    ["TD_CAPACITY", dropFam("anytime_td")],
  ];
  for (const [code, official] of cases) {
    const box = nflBoxScore(s, m, { official });
    assert.equal(box.allocation.ok, false, code);
    assert.equal(box.allocation.code, code);
    assert.equal(box.allocation.kind, ALLOCATION_ERROR_KIND.INPUT);
    assert.deepEqual(box.players, PLAYER_SECTIONS.map((p) => ({ ...p })), `${code}: the NOT_MODELED rows, unchanged`);
    assert.ok(!box.categories.some((c) => c.status === STATUS.ALLOCATED), `${code}: no allocated category`);
    assert.ok(!JSON.stringify(box.players).match(/"(att|cmp|car|tgt|rec|yds)":/), `${code}: no player numbers at all`);
  }
  // a run that failed validation never gets an allocation (nor a box score)
  const bad = structuredClone(s);
  bad.validation.ok = false;
  assert.equal(safeAllocateNflPlayers(bad, m, snap).error.code, "SAMPLE");
  // without the option, the box score is exactly today's
  const plain = nflBoxScore(s, m);
  assert.deepEqual(plain.players, PLAYER_SECTIONS.map((p) => ({ ...p })));
  assert.equal(plain.allocation.code, "NO_OFFICIAL_SNAPSHOT");
  assert.ok(CATEGORY_GROUPS.includes(ALLOCATED_LABEL));
  assert.equal(ALLOCATED_STATUS, STATUS.ALLOCATED);
  assert.ok(Object.isFrozen(ALLOCATION_RULES));
});

/* ───────────────────────────── mutations the audit must catch ───────────────────────────── */

test("mutation: every corruption of an allocation is caught by the audit's independent validator", () => {
  const raw = rawOf(RUN48_FILE);
  const m = adaptFile(RUN48_FILE);
  const s = m.samples.find((x) => x.runIndex === 48);
  const snap = officialOf("401873008").snapshot;
  const res = safeAllocateNflPlayers(s, m, snap);
  assert.ok(res.ok);
  const good = entryOf(raw, m, s, snap, res);
  assert.deepEqual(nflAllocatedLineInvariants(good), []);
  const firstPunt = raw.representativeRuns.find((r) => r.runIndex === 48).drives.findIndex((d) => d.result === "PUNT") + 1;
  const mut = (f) => { const e = structuredClone(good); f(e.allocation, e); return e; };
  const H = (a) => a.teams.home;
  const cases = {
    "completions > attempts (player)": mut((a) => { H(a).lines.passing[0].cmp = H(a).lines.passing[0].att + 1; }),
    "completions > attempts (team)": mut((a) => { H(a).team.completions = H(a).team.attempts + 1; }),
    "receptions > targets": mut((a) => { const r = H(a).lines.receiving[0]; r.rec = r.tgt + 1; }),
    "a receiving yard moved off the books": mut((a) => { H(a).lines.receiving[0].yds += 1; }),
    "passing yards ≠ net − rushing − unattributed": mut((a) => { H(a).team.passYds += 1; H(a).lines.passing[0].yds += 1; H(a).lines.receiving[0].yds += 1; }),
    "unattributed residual hidden": mut((a) => { a.teams.away.team.unattributedYds = 0; a.teams.away.team.rushYds -= 2; a.teams.away.lines.rushing[0].yds -= 2; }),
    "a carry invented": mut((a) => { H(a).team.carries += 1; H(a).lines.rushing[0].car += 1; }),
    "a TD on a punt drive": mut((a) => { a.touchdowns.find((x) => x.side === "home").drive = firstPunt; }),
    "a TD drive left unattributed": mut((a) => { a.touchdowns = a.touchdowns.filter((x, i) => i !== 0); }),
    "an extra rushing TD": mut((a) => { H(a).lines.rushing[1].td += 1; }),
    "a receiving TD without its passing TD": mut((a) => { H(a).lines.passing[0].td -= 1; }),
    "a row keyed by name": mut((a) => { H(a).lines.rushing[0].playerId = "Christian McCaffrey"; }),
    "another team's player": mut((a) => { H(a).lines.receiving[0].playerId = a.teams.away.lines.receiving[0].playerId; }),
    "an unofficial id": mut((a) => { H(a).lines.receiving[0].playerId = "nfl-athlete-1"; }),
    "relabelled as modeled": mut((a) => { a.status = "MODELED"; }),
    "paraphrased label": mut((a) => { a.label = "Allocated from the official projection"; }),
    "allocated from another snapshot": mut((a) => { a.snapshotId = "0".repeat(64); }),
    "a touchdown scorer with no line": mut((a) => { a.touchdowns[0].scorerId = "nfl-athlete-4421446"; }),
    "an INVARIANT refusal": mut((a, e) => { e.allocation = null; e.error = { kind: "INVARIANT", code: "YARDS_RECONCILE", reason: "x" }; }),
  };
  for (const [name, e] of Object.entries(cases)) {
    assert.ok(nflAllocatedLineInvariants(e).length > 0, `not caught: ${name}`);
  }
  // an INPUT refusal (missing inputs) is fail-closed behaviour, not an inconsistency
  assert.deepEqual(nflAllocatedLineInvariants({ ...good, allocation: null, error: { kind: "INPUT", code: "NO_PASSER", reason: "x" } }), []);
});

test("mutation: a corrupted run or snapshot never yields a non-reconciling table", () => {
  const m = adaptFile(RUN48_FILE);
  const s = m.samples.find((x) => x.runIndex === 48);
  const snap = officialOf("401873008").snapshot;
  for (let k = 0; k < s.events.length; k++) {
    for (const dy of [-7, 3]) {
      const x = structuredClone(s);
      x.events[k].netYards += dy; // a drive whose yards no longer match its spots: still reconciled to what is recorded
      const r = safeAllocateNflPlayers(x, m, snap);
      if (!r.ok) { assert.equal(r.error.kind, ALLOCATION_ERROR_KIND.INPUT); continue; }
      for (const side of SIDES) {
        const t = r.allocation.teams[side].team;
        assert.equal(t.passYds + t.rushYds + t.unattributedYds, x.events.filter((e) => e.offense === side).reduce((a, e) => a + e.netYards, 0));
      }
    }
  }
  // scaled projections (every expectation × 3) give the same lines: only proportions are read
  const scaled = { ...snap, players: snap.players.map((p) => ({ ...p, families: Object.fromEntries(Object.entries(p.families).map(([f, e]) => [f, f === "anytime_td" ? e : { ...e, expected: e.expected * 3 }])) })) };
  const strip = (a) => JSON.stringify(a.teams, (k, v) => (k === "passPlayShare" || k === "passYardShare" ? undefined : v));
  assert.equal(strip(allocateNflPlayers(s, m, scaled)), strip(allocateNflPlayers(s, m, snap)), "integer lines identical (shares equal up to float noise)");
});
