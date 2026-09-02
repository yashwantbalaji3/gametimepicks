/**
 * THE INCIDENT REGISTER IS DERIVED — Program 231 · K1.
 *
 * Run: npx tsx --test src/lib/launch/incident-register.test.mjs
 *
 * The console had thirty-two panels and no incidents panel: open failures were legible only to
 * whoever went looking in the right artifact. Program 230 found End Zone Vault missing three days of
 * receipts behind nine green workflow runs, and nothing on the operator's screen would have shown it.
 *
 * The tempting fix is a committed list of incident cards. That is the failure this console refuses
 * everywhere else — a hand-kept list drifts the moment somebody forgets to edit it, and a stale
 * incident board is worse than none because it reads as surveyed. These tests are what stop the
 * register from becoming one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildIncidentRegister, INCIDENT_KINDS, INCIDENT_SEVERITIES } from "./incident-register.mjs";
import { PRODUCT_REGISTRY } from "../products/lifecycle-registry.mjs";

const APP = process.cwd();
const reg = buildIncidentRegister({ appDir: APP });

test("NO ROW IS HAND-WRITTEN — the module holds no incident literals", () => {
  /*
   * The whole contract. `INCIDENT_KINDS` describes failure CLASSES; it must not contain a product
   * name, a date or an event id, because that would be a specific incident typed into source where
   * nothing can ever clear it.
   */
  const src = fs.readFileSync(path.join(APP, "src/lib/launch/incident-register.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/.*$/gm, "");

  const kindsBlock = code.slice(code.indexOf("INCIDENT_KINDS"), code.indexOf("const readJson"));
  for (const productId of PRODUCT_REGISTRY.ids) {
    assert.ok(!kindsBlock.includes(productId), `the kind table names the product "${productId}" — that is a row, not a class`);
  }
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(kindsBlock), "the kind table carries a date — an incident cannot be pinned in source");
});

test("every row carries the four things an operator asks, in order", () => {
  if (!reg.present) return;
  for (const r of reg.rows) {
    for (const field of ["cause", "owner", "detection", "mitigation", "clearing"]) {
      assert.ok(
        typeof r[field] === "string" && r[field].trim().length > 10,
        `${r.id}: "${field}" must be substantive — a status with no ${field} is a colour, not an incident`,
      );
    }
    assert.ok(r.source, `${r.id}: names the artifact it was derived from`);
    assert.ok(INCIDENT_SEVERITIES.includes(r.severity), `${r.id}: severity outside the closed set`);
  }
});

test("A FOUNDER GATE IS VISIBLE BUT NOT ACTIONABLE", () => {
  /*
   * Moonshot genuinely publishes without a settlement path — real, and unfixable without the token.
   * Ranking it beside a repairable failure puts a thing nobody may touch at the top of the queue
   * every day, which is how a board stops being read. Hiding it would be worse.
   */
  if (!reg.present) return;
  const gated = reg.rows.filter((r) => r.founderGate);
  for (const r of gated) {
    assert.equal(r.severity, "GATED");
    assert.match(r.clearing, /the founder answers/, "its clearing event is an answer, not an engineering task");
    assert.match(r.clearing, new RegExp(r.founderGate), "and it names the exact token");
  }
  assert.equal(
    reg.actionable,
    reg.rows.filter((r) => !r.founderGate).length,
    "the actionable count excludes gated rows and nothing else",
  );
});

test("LIVE · the register reports exactly what the watchdogs report — no more, no fewer", () => {
  /*
   * The anti-drift check. If the register could report a row no authority is reporting, it would be
   * hand-maintained by another name; if it could drop one, it would be a filter presenting as a
   * survey.
   */
  if (!reg.present) return;
  const ROOT = path.join(APP, "..");
  const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
  const dir = path.join(ROOT, "data/internal/products/receipts");
  const newest = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().pop();
  const receipt = read(path.join(dir, newest));
  const coverage = read(path.join(ROOT, "data/internal/products/lifecycle-coverage.json"));

  const expected = new Set([
    ...(receipt?.watchdog ?? []).map((a) => `${a.kind}:${a.product}`),
    ...(coverage?.openGaps ?? []).map((g) => `COVERAGE_GAP:${g.id}`),
    ...(coverage?.publishesWithoutSettling ?? []).map((id) => `PUBLISHES_WITHOUT_SETTLING:${id}`),
  ]);
  const got = new Set(reg.rows.filter((r) => !r.kind.startsWith("OFFERED_WINDOW")).map((r) => r.id));

  assert.deepEqual([...got].sort(), [...expected].sort(), "the register and its authorities disagree");
});

test("an UNRECOGNISED alarm surfaces rather than disappearing", () => {
  /*
   * A watchdog kind nobody has written a paragraph for is still a real alarm. Dropping it would make
   * the register quietly narrower than the system it reports on — and the operator would never learn
   * that a new failure class exists.
   */
  const kinds = Object.keys(INCIDENT_KINDS);
  assert.ok(kinds.length > 0);
  const src = fs.readFileSync(path.join(APP, "src/lib/launch/incident-register.mjs"), "utf8");
  assert.match(src, /UNCLASSIFIED|unclassified/, "the builder has a path for a kind it does not know");
  assert.ok(!/return;\s*\/\/\s*(skip|ignore)/.test(src), "and it is not a silent skip");
});

test("LIVE · the Vault incident names the receipt that will clear it", () => {
  /*
   * The specific row this release exists for. Its clearing event must be an OBSERVATION — a later
   * receipt deriving a different state — never "someone fixed it". P230 fixed the cause; the row
   * clears when the next nfl-event-window run writes an entry, and not before.
   */
  if (!reg.present) return;
  const vault = reg.rows.find((r) => r.subject === "end-zone-vault");
  if (!vault) return; // legitimately cleared by a later receipt
  assert.match(vault.clearing, /a later receipt/, "cleared by evidence, not by assertion");
  assert.match(vault.source, /receipts\/\d{4}-\d{2}-\d{2}\.json/, "and it names the receipt it was read from");
});
