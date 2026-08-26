/**
 * NBA schedule ↔ identity full-slate coverage (Program 197 · Release E).
 *
 * The identity stage sat PARTIAL on one sentence — "team coverage unverified for a full slate" —
 * and the verification is cheap and permanent: every team the committed schedule capture names
 * must resolve through canonicalTeamId, and the capture must span the whole league. A provider
 * alias the contract does not know fails HERE, on the committed artifact, before it can fail in a
 * join at settlement time. Structural over the live capture — team count and resolvability, never
 * today's matchups.
 *
 * Run: npx tsx --test src/lib/nba/schedule-identity-coverage.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { canonicalTeamId, exhibitionOpponent, NBA_CANONICAL_TRICODES } from "./identity-contract.ts";

const capture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/schedule/latest.json"), "utf8"));

test("every team in the committed capture resolves — canonical tricode or REGISTERED exhibition club", () => {
  /*
   * P210: preseason captures carry non-NBA exhibition opponents (first live case: LON · London
   * Lions at POR, 2026-10-12). An exhibition club is not an alias of any tricode — mapping it to
   * one would be a false join — and not an unknown code either: it is its own typed registry in
   * the contract. A code in NEITHER registry still fails exactly as before.
   */
  const unresolved = [];
  const resolved = new Set();
  const exhibitions = new Set();
  for (const r of capture.rows ?? []) {
    for (const side of ["home", "away"]) {
      const raw = r[side]?.abbr ?? r[side]?.name ?? null;
      const canon = canonicalTeamId(raw);
      if (canon) { resolved.add(canon); continue; }
      const ex = exhibitionOpponent(raw);
      if (ex) { exhibitions.add(ex); continue; }
      unresolved.push(String(raw));
    }
  }
  assert.deepEqual([...new Set(unresolved)], [], "a provider code in neither registry must be added deliberately, never fuzzy-joined");
  assert.ok(resolved.size >= 28, `the confirmed window spans the league (${resolved.size} canonical teams resolved)`);
  for (const t of resolved) assert.ok(NBA_CANONICAL_TRICODES.includes(t));
  // Exhibition clubs never count toward league span and never resolve as NBA teams.
  for (const ex of exhibitions) assert.equal(canonicalTeamId(ex), null, `${ex} must not double as an NBA team`);
});

test("season types in the capture stay within the contract's own vocabulary", () => {
  const types = new Set((capture.rows ?? []).map((r) => r.seasonType));
  for (const t of types) assert.ok([1, 2, 3, 4, 5].includes(t), `seasonType ${t} is a provider code the settlement separation understands`);
});
