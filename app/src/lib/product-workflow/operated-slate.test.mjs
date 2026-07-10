/**
 * OPERATED PAPER SLATE — the committed 2026-07-09 paper cards + approvals + settlements are honest,
 * paper-only, deterministic, and money-walled.
 *
 * Pins: every committed card/approval/settlement validates against the schema; paperOnly + active:false +
 * realExposure:0 + officialMoneyRecordAffected:false + public:false; a pending leg is NEVER scored as a
 * loss; artifacts carry no wall-clock (deterministic); and money md5 is unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validatePaperProductCard, validateApprovalRequest, validatePaperSettlementEntry } from "./schema.ts";

const app = process.cwd();
const repo = path.join(app, "..");
const walk = (d) => (!fs.existsSync(d) ? [] : fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : e.name.endsWith(".json") ? [p] : [];
}));
const cards = walk(path.join(repo, "data/internal/product-cards/paper")).map((f) => [f, JSON.parse(fs.readFileSync(f, "utf8"))]);
const approvals = walk(path.join(repo, "data/internal/product-cards/approvals")).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const settlements = walk(path.join(repo, "data/internal/product-cards/settlements")).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));

test("1 · every committed paper card is schema-valid, paper-only, and money-walled", () => {
  if (!cards.length) return; // nothing operated yet
  for (const [f, c] of cards) {
    const v = validatePaperProductCard(c);
    assert.equal(v.valid, true, `${path.basename(f)}: ${v.errors.join("; ")}`);
    assert.equal(c.paperOnly, true);
    assert.equal(c.active, false);
    assert.equal(c.realExposure, 0);
    assert.equal(c.officialMoneyRecordAffected, false);
    assert.equal(c.public, false);
    assert.ok(c.approvalId && c.approvalSnapshot?.approvedBy, "carries founder-approval provenance");
  }
});

test("2 · every committed approval is valid + paper_only", () => {
  for (const a of approvals) {
    const v = validateApprovalRequest(a);
    assert.equal(v.valid, true, v.errors.join("; "));
    assert.equal(a.approvalMode, "paper_only");
    assert.equal(a.officialMoneyRecordAffected, false);
  }
});

test("3 · every committed settlement is valid; a PENDING leg is never a loss; no money impact", () => {
  for (const s of settlements) {
    const v = validatePaperSettlementEntry(s);
    assert.equal(v.valid, true, v.errors.join("; "));
    assert.equal(s.officialMoneyRecordAffected, false);
    // If any leg is pending, the card is not settled as won/lost falsely.
    const pending = s.legResults.filter((r) => r.status === "pending");
    if (pending.length) {
      assert.ok(["pending", "partially_settled"].includes(s.status), "pending leg ⇒ card pending/partial");
      assert.notEqual(s.cardResult, "won");
      for (const r of pending) assert.ok(typeof r.reason === "string" && r.reason.length > 0, "pending legs carry a reason (never a silent loss)");
    }
    // paper P/L is 0 while pending.
    if (s.cardResult === "pending") assert.equal(s.paperPnlUnits, 0);
  }
});

test("4 · committed workflow artifacts carry NO wall-clock (deterministic + idempotent)", () => {
  for (const [f] of cards) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /T\d{2}:\d{2}:\d{2}/, `${path.basename(f)} has no ISO wall-clock`);
  for (const s of settlements) assert.doesNotMatch(JSON.stringify(s), /T\d{2}:\d{2}:\d{2}/, "settlement has no ISO wall-clock");
});

test("5 · the operated artifacts live under data/internal (never web-served) + money unchanged", () => {
  assert.ok(!fs.existsSync(path.join(app, "public/data/product-cards")), "not under app/public");
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
