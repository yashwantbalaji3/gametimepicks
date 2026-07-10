/**
 * FOUNDER-APPROVAL PROMOTION — the approval gate + money wall, exercised end-to-end via the real CLI.
 *
 * Pins: promotion REFUSES without an explicit approval flag + approver; a fully-approved run writes a
 * schema-valid PAPER card to an internal path only; it is idempotent; it never writes the real repo or a
 * money artifact; and the official money md5 is unchanged.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { validatePaperProductCard } from "./schema.ts";

const app = process.cwd();
const repo = path.join(app, "..");
const SCRIPT = "scripts/promote-founder-review-to-paper-card.mjs";
const run = (args) => spawnSync("npx", ["tsx", SCRIPT, ...args], { cwd: app, encoding: "utf8" });
const moneyMd5 = () => crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");

const previewPath = path.join(repo, "data/internal/product-previews/bank-builder/2026-07-09.json");
const preview = fs.existsSync(previewPath) ? JSON.parse(fs.readFileSync(previewPath, "utf8")) : null;
const promotable = preview && preview.status === "founder_review" && preview.paperPromotionEligible === true;

test("1 · promotion REFUSES without the explicit approval flag + approver", () => {
  const noFlag = run(["--product", "bank_builder", "--date", "2026-07-09", "--approved-by", "Yash"]);
  assert.notEqual(noFlag.status, 0, "must exit non-zero without --approve-founder-review");
  assert.match(noFlag.stderr + noFlag.stdout, /REFUSED/);
  const noBy = run(["--product", "bank_builder", "--date", "2026-07-09", "--approve-founder-review"]);
  assert.notEqual(noBy.status, 0, "must exit non-zero without --approved-by");
});

test("2 · a fully-approved run writes a schema-valid PAPER card to an internal path only + is idempotent", () => {
  if (!promotable) { console.log("  (07-09 BB preview not promotable — skipping the write assertions)"); return; }
  const md5Before = moneyMd5();
  const out = path.join(os.tmpdir(), `gtp-promo-${md5Before.slice(0, 8)}`);
  fs.rmSync(out, { recursive: true, force: true });
  const args = ["--product", "bank_builder", "--date", "2026-07-09", "--approve-founder-review", "--approved-by", "Test", "--write", "--out-root", out];
  // Snapshot the REAL repo's paper cards before the tmp run (the operated slate may have committed some).
  const repoCardsDir = path.join(repo, "data/internal/product-cards");
  const repoBefore = fs.existsSync(repoCardsDir) ? walk(repoCardsDir).length : 0;

  const r1 = run(args);
  assert.equal(r1.status, 0, `promotion failed: ${r1.stderr}`);
  const cardFiles = fs.existsSync(path.join(out, "data/internal/product-cards/paper")) ? walk(path.join(out, "data/internal/product-cards/paper")) : [];
  assert.equal(cardFiles.length, 1, "exactly one paper card written");
  const card = JSON.parse(fs.readFileSync(cardFiles[0], "utf8"));
  const v = validatePaperProductCard(card);
  assert.equal(v.valid, true, `written card invalid: ${v.errors.join("; ")}`);
  assert.equal(card.paperOnly, true);
  assert.equal(card.active, false);
  assert.equal(card.realExposure, 0);

  // Idempotent rerun.
  const r2 = run(args);
  assert.match(r2.stdout, /SKIPPED/, "rerun is idempotent");
  assert.equal(walk(path.join(out, "data/internal/product-cards/paper")).length, 1, "no duplicate card");

  // The tmp run is isolated: it adds NO card to the real repo; money unchanged.
  const repoAfter = fs.existsSync(repoCardsDir) ? walk(repoCardsDir).length : 0;
  assert.equal(repoAfter, repoBefore, "the tmp --out-root run wrote nothing to the real repo");
  assert.equal(moneyMd5(), md5Before, "official money md5 unchanged");
  fs.rmSync(out, { recursive: true, force: true });
});

test("3 · the promotion script writes no money artifact", () => {
  const src = fs.readFileSync(path.join(app, SCRIPT), "utf8");
  assert.doesNotMatch(src, /writeFileSync[^\n]*(mr-dub|portfolio\.json|bankroll|daily-portfolio)/, "no money write");
  assert.doesNotMatch(src, /writeFileSync[^\n]*public\//, "never writes under public/");
});

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith(".json") ? [p] : [];
  });
}
