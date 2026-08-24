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

import { canonicalTeamId, NBA_CANONICAL_TRICODES } from "./identity-contract.ts";

const capture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nba/schedule/latest.json"), "utf8"));

test("every team in the committed capture resolves to a canonical tricode — no alias gaps", () => {
  const unresolved = [];
  const resolved = new Set();
  for (const r of capture.rows ?? []) {
    for (const side of ["home", "away"]) {
      const raw = r[side]?.abbr ?? r[side]?.name ?? null;
      const canon = canonicalTeamId(raw);
      if (!canon) unresolved.push(String(raw));
      else resolved.add(canon);
    }
  }
  assert.deepEqual([...new Set(unresolved)], [], "a provider code the contract does not know must be added as an alias, not fuzzy-joined");
  assert.ok(resolved.size >= 28, `the confirmed window spans the league (${resolved.size} canonical teams resolved)`);
  for (const t of resolved) assert.ok(NBA_CANONICAL_TRICODES.includes(t));
});

test("season types in the capture stay within the contract's own vocabulary", () => {
  const types = new Set((capture.rows ?? []).map((r) => r.seasonType));
  for (const t of types) assert.ok([1, 2, 3, 4, 5].includes(t), `seasonType ${t} is a provider code the settlement separation understands`);
});
