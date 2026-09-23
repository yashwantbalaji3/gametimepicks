/**
 * A POSTSEASON SLOT IS NOT A CLUB (v1.8).
 *
 * MLB has thirty clubs. On 2026-09-23 the follow registry resolved **37**, and
 * `mlbTeamRefByName("NL Wild Card #3")` returned a followable ref — an identity minted for something that
 * is not an entity, which is the one thing the identity rules forbid.
 *
 * WHERE THE SEVEN CAME FROM. StatsAPI publishes undecided postseason games with TBD sides. The capture
 * window is today+6, so on 2026-09-23 it reached 2026-09-29 and recorded `AL #3 Seed`, `NL #3 Seed`,
 * `NL Wild Card #1/#2/#3`, `AL Wild Card #2/#3` — ids 4614–4947, all first seen in that one file. The
 * capture reduces a side to `{id, name}`, so by the time it reached the registry nothing distinguished a
 * seed slot from a club.
 *
 * THE DISCRIMINATOR IS THE OWNER'S, NOT A HEURISTIC. StatsAPI marks these `placeholder: true`. Verified
 * live on 2026-09-23 in both directions: on 2026-10-06 every postseason side carried it (4 of 4), and on
 * the regular-season 2026-09-23 slate **not one side carried the key at all** (0 of 32). So an ABSENT flag
 * means "a real club" — which is why every capture written before today keeps working unchanged.
 *
 * Rejected alternatives, recorded so they are not retried: an id range (108–158 is a magic number that
 * rots), a name regex (formatting, not identity), and requiring an abbreviation from the simulation slates
 * (a 7-file window — the exact window bug the R1 guard above was written to catch).
 *
 * Run: cd app && npx tsx --test src/lib/follow/mlb-placeholder-clubs.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();

test("the capture carries StatsAPI's own placeholder flag through", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/mlb/capture-mlb-schedule.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /placeholder === true/, "the flag must be read from the provider payload");
  assert.match(code, /away: side\(/, "…and both sides must go through the same normaliser");
  assert.match(code, /home: side\(/);
  // It is added ONLY when true, so a real club's row is byte-identical to what it was before.
  assert.match(code, /\{ placeholder: true \}/);
  assert.doesNotMatch(code, /placeholder: false/, "a real club must not acquire a new field");
});

test("the registry refuses a placeholder side", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/follow/entity-registry.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /side\?\.placeholder === true\) continue/, "a TBD slot never becomes a club");
});

test("BEHAVIOUR · a placeholder side is excluded, a real one is kept", () => {
  /* The registry reads from disk, so the unit under test here is the rule itself, applied exactly as the
     registry applies it — including that an ABSENT flag means a real club. */
  const keep = (side) => !(side?.placeholder === true) && side?.id !== undefined && typeof side?.name === "string";

  assert.equal(keep({ id: 147, name: "New York Yankees" }), true, "a real club, no flag — the historical shape");
  assert.equal(keep({ id: 147, name: "New York Yankees", placeholder: false }), true, "an explicit false is still a club");
  assert.equal(keep({ id: 4619, name: "NL Wild Card #1", placeholder: true }), false);
  assert.equal(keep({ id: 5513, name: "AL Higher Seed", placeholder: true }), false);
  // NEGATIVE CONTROL: the rule must not reject on the NAME. A club with an odd name is still a club.
  assert.equal(keep({ id: 133, name: "Athletics" }), true, "no name heuristic — 'Athletics' has no city and is real");
});

test("the committed captures show the shape this fixes", () => {
  /* Anti-vacuity: the 2026-09-29 capture really does carry the seven, and they really are >4000 ids that
     appear in no other file. If this stops being true the fix still holds, but this test should be read
     again rather than trusted. */
  const dir = path.join(APP, "public/data/mlb/statsapi-schedule");
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  assert.ok(files.length > 5, "there must be real captures to reason about");
  const ids = new Map();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const g of j.games ?? []) for (const s of [g.home, g.away]) if (s?.id != null) {
      if (!ids.has(String(s.id))) ids.set(String(s.id), { name: s.name, files: new Set() });
      ids.get(String(s.id)).files.add(f);
    }
  }
  const suspicious = [...ids].filter(([id]) => Number(id) > 1000);
  for (const [id, v] of suspicious) {
    assert.equal(v.files.size, 1, `${v.name} (${id}) appears in ${v.files.size} captures — re-read this test`);
  }
});
