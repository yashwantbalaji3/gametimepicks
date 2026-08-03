/**
 * Base-board immutability guard (Program 108-111 §4.3, §16.1).
 *
 * After the Aug 3 cutover the base board is frozen: coverage may only ever be ADDED through
 * append-only official-addition patches. A changed base is a hard stop — it means something
 * regenerated a board whose rows were already shown to users and are already the settlement
 * population.
 *
 * The pin is deliberately the row-identity digest plus the row count, not the file bytes:
 * downstream tooling may legitimately reformat or re-serialize the artifact, but it may never
 * change WHICH predictions the base contains.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { rowIdentity } from "./board-patches.mjs";

// Resolve relative to THIS file (src/lib/mlb → app/public/data), never cwd: the suite is invoked
// from app/ but guards are also run from the repo root, and a cwd-dependent path silently
// "passes" by finding nothing.
const BOARDS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../public/data/mlb/boards");

/** Frozen bases: date → {rows, identityDigest}. Add a date only at a declared cutover. */
const FROZEN = new Map([
  [
    "2026-08-03",
    {
      rows: 211,
      // sha256 over the sorted row identities — pinned at the 10:20 ET cutover. Pinning the
      // DIGEST (not just the count) means a same-count row SWAP is caught too.
      identityDigest: "5e69fa7bf785c998e53024782e13e6c2fc1381253d2cc555d906cbc65ed7ed69",
      note: "cutover 2026-08-03 10:20 ET; base file sha256 d2e81ca3…bebf41",
    },
  ],
]);

function digestOf(board) {
  const ids = (board.leans ?? []).map(rowIdentity).filter(Boolean).sort();
  return { digest: crypto.createHash("sha256").update(ids.join("\n")).digest("hex"), count: ids.length };
}

test("frozen base boards keep their exact prediction population", () => {
  for (const [date, pin] of FROZEN) {
    const p = path.join(BOARDS, `${date}.json`);
    assert.ok(fs.existsSync(p), `${date}: frozen base board must exist`);
    const board = JSON.parse(fs.readFileSync(p, "utf8"));
    const { count, digest } = digestOf(board);

    assert.equal(
      board.leans.length,
      pin.rows,
      `${date}: base row count changed (${board.leans.length} vs frozen ${pin.rows}) — the base was regenerated after cutover. ` +
        `Coverage may only be ADDED via official-addition patches.`,
    );
    assert.equal(count, pin.rows, `${date}: every base row must carry a resolvable identity`);
    assert.equal(
      digest,
      pin.identityDigest,
      `${date}: the base's prediction population CHANGED (same count, different rows) — ` +
        `a post-cutover regeneration or row swap. This is a hard stop, not a refresh.`,
    );
  }
});

test("frozen base rows are 1:1 with identities (no silent collapse)", () => {
  // The collapse this catches is real: on 2026-08-03 the pre-fix identity produced 206 for 211
  // rows because different players shared a null playerId. A patch would then have refused a
  // legitimate addition as a duplicate.
  for (const [date, pin] of FROZEN) {
    const board = JSON.parse(fs.readFileSync(path.join(BOARDS, `${date}.json`), "utf8"));
    const ids = board.leans.map(rowIdentity);
    assert.equal(new Set(ids).size, pin.rows, `${date}: identities must be 1:1 with rows`);
    assert.ok(ids.every((i) => typeof i === "string" && i.length > 0), `${date}: no null identity`);
  }
});

test("every frozen base row was captured before its event started", () => {
  for (const [date] of FROZEN) {
    const board = JSON.parse(fs.readFileSync(path.join(BOARDS, `${date}.json`), "utf8"));
    const startByPk = new Map((board.games ?? []).map((g) => [g.gamePk, Date.parse(g.gameDate ?? "")]));
    for (const l of board.leans ?? []) {
      const start = startByPk.get(l.gamePk);
      if (!Number.isFinite(start)) continue;
      const cap = Date.parse(l.capturedAt ?? "");
      assert.ok(Number.isFinite(cap), `${date}: row ${l.id} has no capturedAt`);
      assert.ok(cap < start, `${date}: row ${l.id} captured at/after first pitch — not a pregame prediction`);
    }
  }
});
