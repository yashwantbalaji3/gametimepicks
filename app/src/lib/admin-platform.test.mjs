/**
 * ADMIN PLATFORM v1 — the Claude "operating company" foundations must exist and stay honest:
 *   • all 8 agent mission files exist with the required sections,
 *   • the tool-usage guide + CEO workflow + custom-change workflow exist and carry their contract,
 *   • /ops exposes NO secrets,
 *   • the enhanced admin/status.json carries the new derived fields (still matching canonical),
 *   • the core playbooks state the hard rules.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repo = path.join(process.cwd(), "..");
const readRepo = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(repo, rel));

const AGENTS = ["ops-manager", "quant-analyst", "product-manager", "qa-engineer", "ui-ux-designer", "data-engineer", "launch-manager", "content-analyst"];

test("all 8 agent mission files exist with the required sections", () => {
  for (const a of AGENTS) {
    const rel = `agents/${a}/mission.md`;
    assert.ok(exists(rel), `${rel} exists`);
    const src = readRepo(rel);
    for (const section of ["Mission", "Responsibilities", "Gates", "Never", "Example prompt"]) {
      assert.match(src, new RegExp(`\\*\\*${section}`, "i"), `${a} has a ${section} section`);
    }
  }
});

test("the tool-usage guide separates Chat / Code / Cowork", () => {
  const g = readRepo("docs/CLAUDE_TOOL_USAGE_GUIDE.md");
  assert.match(g, /Use Claude Chat for/i);
  assert.match(g, /Use Claude Code for/i);
  assert.match(g, /Use Claude Cowork/i);
});

test("the CEO daily workflow covers morning / afternoon / night", () => {
  const w = readRepo("docs/CEO_DAILY_WORKFLOW.md");
  assert.match(w, /Morning/i); assert.match(w, /Afternoon/i); assert.match(w, /Night/i);
  assert.match(w, /only you decide|judgment call/i, "names the founder's judgment calls");
});

test("the custom-change workflow has all five risk classes + a template + checklists", () => {
  const c = readRepo("docs/CUSTOM_CHANGE_WORKFLOW.md");
  for (const cls of ["Copy", "UI", "Product logic", "Data refresh", "Settlement"]) assert.match(c, new RegExp(cls, "i"), `class ${cls}`);
  assert.match(c, /Admin request template/i);
  assert.match(c, /Deployment checklist/i);
  assert.match(c, /Blocked/, "has a Blocked risk level (the refusal path)");
});

test("/ops exposes NO secrets (no keys/tokens/.env in the page source)", () => {
  const src = readRepo("app/src/app/ops/page.tsx");
  assert.ok(!/API_KEY|SECRET|TOKEN|process\.env|\.env|ODDS_API|API_FOOTBALL/i.test(src), "no secret material referenced");
});

test("enhanced admin/status.json carries the new derived fields and still matches canonical money", () => {
  const s = JSON.parse(readRepo("app/public/data/admin/status.json"));
  const pf = JSON.parse(readRepo("app/public/data/mr-dub/portfolio.json"));
  for (const f of ["productReadiness", "counts", "workflowHealth", "warnings", "dailyChecklist", "nextSettlementDate", "nextRefreshDate"]) {
    assert.ok(f in s, `status.json has ${f}`);
  }
  assert.equal(s.canonical.bankroll, Math.round(pf.currentBankroll * 100) / 100, "still derived from canonical (no drift)");
  assert.ok(Array.isArray(s.dailyChecklist) && s.dailyChecklist.every((x) => typeof x.done === "boolean"), "checklist items are booleans");
});

test("the core playbooks state the hard rules (money-only-via-settlement + no fabrication)", () => {
  for (const doc of ["docs/CLAUDE_TEAM_OPERATING_SYSTEM.md", "docs/CLAUDE_TOOL_USAGE_GUIDE.md", "docs/CEO_DAILY_WORKFLOW.md"]) {
    const src = readRepo(doc);
    assert.match(src, /official settlement/i, `${doc} states money-only-via-official-settlement`);
    assert.match(src, /fabricat/i, `${doc} states no fabrication`);
  }
});
