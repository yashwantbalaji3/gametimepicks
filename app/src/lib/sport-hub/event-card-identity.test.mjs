/**
 * S1 (2026-09-30) · THE EVENT CARD'S FAVOURITE AND SPLIT BAR.
 *
 * The card emphasises the side the model favours and draws the owner's own outcome probabilities as a
 * bar. Both are claims, so both are gated: a favourite is marked only by a MODEL read that names a side
 * exactly, and a bar is drawn only from probabilities the owner published — never a derived complement.
 *
 * Run: npx tsx --test src/lib/sport-hub/event-card-identity.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { drawableSplit } from "./contract.ts";

/* The NFL read reader uses `require("node:fs")` (the Next build is CJS). Under tsx's ESM there is no
   `require`, the reader's catch returns an EMPTY map, and every NFL read is null — which would make the
   NFL half of the artifact test below pass vacuously. Give it a real one before the module loads. */
globalThis.require ??= createRequire(import.meta.url);
const { ufcHub, nflHub, mlbHub, mlbLineFavorite } = await import("./adapters.ts");

const NOW = "2026-09-30T15:00:00Z";

test("drawableSplit · draws only real probabilities that do not exceed 1 in total", () => {
  assert.deepEqual(drawableSplit({ label: "x", kind: "MODEL_FORECAST", split: [{ label: "PIT", p: 0.544 }, { label: "CLE", p: 0.456 }] })?.length, 2);
  assert.ok(drawableSplit({ label: "x", kind: "MODEL_FORECAST", split: [{ label: "A", p: 0.5 }, { label: "Draw", p: 0.25 }, { label: "B", p: 0.2 }] }), "a total below 1 (tie mass) still draws — the gap stays empty");
  for (const bad of [
    undefined, null, { label: "x", kind: "MODEL_FORECAST" },
    { label: "x", kind: "MODEL_FORECAST", split: [{ label: "A", p: 0.6 }] },                           // one side only
    { label: "x", kind: "MODEL_FORECAST", split: [{ label: "A", p: 0.7 }, { label: "B", p: 0.4 }] },   // sums past 1
    { label: "x", kind: "MODEL_FORECAST", split: [{ label: "A", p: NaN }, { label: "B", p: 0.4 }] },
    { label: "x", kind: "MODEL_FORECAST", split: [{ label: "A", p: null }, { label: "B", p: 0.4 }] },  // missing ≠ zero
    { label: "x", kind: "MODEL_FORECAST", split: [{ label: "", p: 0.5 }, { label: "B", p: 0.4 }] },
    { label: "x", kind: "MODEL_FORECAST", split: [{ label: "A", p: 0 }, { label: "B", p: 0 }] },
  ]) assert.equal(drawableSplit(bad), null, JSON.stringify(bad));
});

test("MLB · the prediction line marks its winner only when the first segment is a bare side of THIS game", () => {
  assert.equal(mlbLineFavorite("NYY · UNDER 8 · BOS +1.5", "BOS", "NYY"), "NYY");
  assert.equal(mlbLineFavorite("ATL · PHI +1.5", "PHI", "ATL"), "ATL");
  assert.equal(mlbLineFavorite("LAD · UNDER 8", "BOS", "NYY"), null, "a team not in this game");
  assert.equal(mlbLineFavorite("UNDER 8 · BOS +1.5", "BOS", "NYY"), null, "a total first names no winner");
  assert.equal(mlbLineFavorite("BOS +1.5", "BOS", "NYY"), null, "a run line is not a win call");
  assert.equal(mlbLineFavorite(null, "BOS", "NYY"), null);
});

const bout = (read) => ({ id: "b1", matchup: "Natalia Silva vs Weili Zhang", startUtc: "2026-10-04T02:00:00Z", read });

test("UFC · a MODEL read that opens with a fighter's exact name marks that fighter", () => {
  const [r] = ufcHub(NOW, [bout({ label: "Natalia Silva · 72%", kind: "MODEL_FORECAST" })], "UFC 332").rows;
  assert.equal(r.read.favored, "Natalia Silva");
  assert.ok(r.participants.some((p) => p.name === r.read.favored), "the favourite is one of the two sides");
});

test("UFC · a market price never marks a favourite, and a label naming neither side marks nobody", () => {
  assert.equal(ufcHub(NOW, [bout({ label: "Natalia Silva · 72%", kind: "MARKET_PRICE" })], "UFC 332").rows[0].read.favored, undefined);
  assert.equal(ufcHub(NOW, [bout({ label: "Decision likely", kind: "MODEL_FORECAST" })], "UFC 332").rows[0].read.favored, undefined);
  assert.equal(ufcHub(NOW, [bout({ label: "Natalia · 72%", kind: "MODEL_FORECAST" })], "UFC 332").rows[0].read.favored, undefined, "a prefix of a name is not the name");
  assert.equal(ufcHub(NOW, [bout(null)], "UFC 332").rows[0].read, null, "no read stays no read");
});

test("NFL / MLB (committed artifacts) · any favourite is one of the row's two sides, and any bar is drawable", () => {
  const nfl = nflHub(NOW);
  assert.ok(nfl.rows.every((r) => !r.read) || nfl.rows.some((r) => r.read?.split), "NFL reads carry the index's two published sides");
  for (const hub of [nfl, mlbHub(NOW)]) {
    for (const r of hub.rows) {
      if (!r.read) continue;
      if (r.read.favored !== undefined) {
        assert.ok(r.read.kind === "MODEL_FORECAST" || r.read.kind === "MODEL_PICK", `${r.id}: favourite on a ${r.read.kind}`);
        assert.ok(r.participants?.some((p) => p.name === r.read.favored), `${r.id}: favourite ${r.read.favored} is not a side`);
      }
      if (r.read.split !== undefined) assert.ok(drawableSplit(r.read), `${r.id}: undrawable split ${JSON.stringify(r.read.split)}`);
    }
  }
});
