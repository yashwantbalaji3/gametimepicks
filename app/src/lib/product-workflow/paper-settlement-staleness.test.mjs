/**
 * PAPER SETTLEMENT STALENESS GUARD (Sprint 025).
 *
 * `settle-paper-product-cards.mjs` skips rewriting a settlement that has not changed. The original
 * predicate compared only the two CARD-level fields (`status`, `cardResult`), so a LEG that later
 * resolved — pending → win, once its settled_leans row arrived — was computed correctly and then
 * thrown away, because the card verdict was already final. The card looked correctly settled while
 * its leg detail stayed frozen forever.
 *
 * That is not cosmetic: `build-paper-track-record.mjs` tallies LEG-level performance, so the frozen
 * leg silently understated the paper leg record (observed: 1-2 with 3 pending, when the truth was
 * 2-2 with 2 pending).
 *
 * This drives the REAL script against a throwaway --out-root seeded with a deliberately stale
 * settlement, and asserts it repairs it and then goes quiet. Money is asserted untouched.
 *
 * Run: npx tsx --test src/lib/product-workflow/paper-settlement-staleness.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const app = process.cwd();
const repo = path.join(app, "..");
const script = path.join(app, "scripts", "settle-paper-product-cards.mjs");
const portfolio = path.join(app, "public", "data", "mr-dub", "portfolio.json");

const CARD_DATE = "2026-07-09";
const CARD_ID = "moonshot-2026-07-09-cb3cade37e8d";
const rel = path.join("data", "internal", "product-cards");
const settlementRel = path.join(rel, "settlements", "moonshot", CARD_DATE, `${CARD_ID}.json`);

/** Copy the committed paper store + settlements into a temp root so the real repo is never written. */
function seedRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-paper-settle-"));
  fs.cpSync(path.join(repo, rel, "paper"), path.join(dir, rel, "paper"), { recursive: true });
  fs.cpSync(path.join(repo, rel, "settlements"), path.join(dir, rel, "settlements"), { recursive: true });
  return dir;
}

const runSettle = (root) =>
  execFileSync("npx", ["tsx", script, "--date", CARD_DATE, "--write", "--out-root", root], {
    cwd: app,
    stdio: "pipe",
    encoding: "utf8",
  });

const readSettlement = (root) => JSON.parse(fs.readFileSync(path.join(root, settlementRel), "utf8"));

test("a leg that resolved after the card was graded is repaired, not skipped", () => {
  const root = seedRoot();
  try {
    const current = readSettlement(root);
    const resolved = current.legResults.find((r) => r.status === "win");
    assert.ok(resolved, "fixture precondition: the committed settlement has a graded leg to stale out");

    // Rewind ONE leg to the stale state, leaving the card-level verdict untouched — this is exactly
    // the shape the old predicate could not see.
    const stale = {
      ...current,
      legResults: current.legResults.map((r) =>
        r.legId === resolved.legId
          ? { legId: r.legId, marketKey: r.marketKey, side: r.side, status: "pending", reason: "no committed settled_leans row (date not settled / no match)" }
          : r,
      ),
      unsettledReasons: [`${resolved.legId}: no committed settled_leans row (date not settled / no match)`],
    };
    assert.equal(stale.status, current.status, "card status is unchanged by the staling — the whole point");
    assert.equal(stale.cardResult, current.cardResult, "card result is unchanged by the staling");
    fs.writeFileSync(path.join(root, settlementRel), JSON.stringify(stale, null, 2) + "\n");

    runSettle(root);

    const after = readSettlement(root);
    const repaired = after.legResults.find((r) => r.legId === resolved.legId);
    assert.equal(repaired.status, "win", "the resolved leg must be re-graded, not left pending behind a final card");
    assert.deepEqual(after.unsettledReasons, [], "the stale unsettled reason must clear");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an unchanged settlement is left alone (idempotent — no nightly churn)", () => {
  const root = seedRoot();
  try {
    runSettle(root); // converge first, in case the committed state is behind
    const before = fs.readFileSync(path.join(root, settlementRel));
    const out = runSettle(root);
    const after = fs.readFileSync(path.join(root, settlementRel));
    assert.deepEqual(after, before, "a second run must not rewrite an unchanged settlement");
    assert.match(out, /WROTE 0/, "a converged run reports no writes, so automation produces no empty commit");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("settling paper cards never mutates canonical money", () => {
  const root = seedRoot();
  try {
    const before = crypto.createHash("md5").update(fs.readFileSync(portfolio)).digest("hex");
    runSettle(root);
    const after = crypto.createHash("md5").update(fs.readFileSync(portfolio)).digest("hex");
    assert.equal(after, before, "portfolio.json untouched by paper settlement");
    assert.equal(after, "affe6b21071f2b3be96bb2774eb347c3", "money stays canonical 19-14");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
