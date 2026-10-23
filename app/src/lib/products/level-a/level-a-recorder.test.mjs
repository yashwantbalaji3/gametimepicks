/**
 * Level A record = what Production showed (release owner 2026-10-23). One build instant for every Level A surface,
 * a served model the recorder reads per Production deployment, and refusals whenever record and page could differ.
 * Run: npx tsx --test src/lib/products/level-a/level-a-recorder.test.mjs
 * Selections below are FIXTURE inputs; the HTML is the real component's renderToString output (with the text separators Next also emits).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";

import { levelASuggestions } from "./suggestions.mjs";
import { LEVEL_A_SERVED_PATH, LEVEL_A_SERVED_SCHEMA, levelAPageModel, levelAServedDoc, modelSha256 } from "./model.mjs";
import { appendRecord, recordEntries, recordViolations } from "./record.mjs";
import { buildAsOfIso } from "../../build-asof.ts";
import { PAGE_FOR, runFromDeployment, shownItems, verdictLine, verifyServed } from "../../../../scripts/products/record-level-a-from-deployment.mjs";

globalThis.React = React;
const { default: LevelASuggestions } = await import("../../../components/products/level-a-suggestions.tsx");
const read = (f) => fs.readFileSync(path.resolve(process.cwd(), f), "utf8");
const SHA = "a".repeat(40);
const NEWER = "b".repeat(40);
const AS_OF = "2026-10-23T14:00:00.000Z";
let n = 0;
/** FIXTURE selection. */
const sel = (o = {}) => ({
  sport: "epl", eventId: `fx-${++n}`, eventLabel: "Home v Away", startUtc: "2026-10-23T19:00:00Z", market: "1x2",
  selection: { code: "home", label: `Club ${n} & Co to win` }, probability: 0.6,
  forecast: { owner: "fixture", modelId: "fx", stampedAt: "2026-10-23T08:00:00Z", ref: null }, uncertainty: null, participantStatuses: [],
  settlement: { grader: "soccer-1x2-official-final", market: "1x2", side: "home" }, ...o,
});
function fixture() {
  const answer = levelASuggestions({ selections: [0.82, 0.75, 0.6, 0.55, 0.45, 0.4].map((p) => sel({ probability: p })).concat(sel({ sport: "nba", market: "winner", probability: null })), now: AS_OF, productDay: "2026-10-23" });
  const model = { asOf: AS_OF, ...answer, refusedByReason: {}, nbaProjections: [] };
  const served = { schema: LEVEL_A_SERVED_SCHEMA, public: true, asOf: AS_OF, productDay: model.productDay, modelSha256: modelSha256(model), model };
  const render = (mode) => renderToString(React.createElement(LevelASuggestions, { model, mode }));
  const pages = { [PAGE_FOR["parlay-lab"]]: render("parlay-lab"), [PAGE_FOR["bank-builder"]]: render("bank-builder"), [PAGE_FOR.moonshot]: render("moonshot") };
  return { model, served, pages, buildInfo: { builtAt: AS_OF, commit: { sha: SHA } } };
}
const fetcher = (byPath) => async (url) => {
  const p = new URL(url).pathname;
  if (!(p in byPath)) throw new Error(`${p}: HTTP 404`);
  const v = byPath[p];
  return typeof v === "function" ? v() : typeof v === "string" ? v : JSON.stringify(v);
};

test("ONE INSTANT: the three pages render levelAPageModel (the build's stamped asOf), and the served file is that same evaluation", () => {
  for (const f of ["src/app/build/page.tsx", "src/app/bank-builder/page.tsx", "src/app/moonshot/page.tsx"]) {
    const s = read(f);
    assert.equal((s.match(/levelAPageModel\(\)/g) ?? []).length, 1, `${f}: exactly ONE Level A evaluation, at the build instant`);
    assert.doesNotMatch(s, /buildLevelAModel\(/, `${f}: never its own clock`);
    if (s.includes("const levelAModel = ")) {
      assert.match(s, /const levelAModel = LEVEL_A \? levelAPageModel\(\) : null;/, f);
      assert.match(s, /model=\{levelAModel as unknown as LevelAModel\}/, `${f}: the section renders that one model`);
      assert.match(s, /levelASports=\{levelAModel \? levelASportsShown\(levelAModel, "(bank-builder|moonshot)"\) : null\}/, `${f}: and the priced-universe pointer reads the same one`);
    } else assert.match(s, /model=\{levelAPageModel\(\) as unknown as LevelAModel\}/, f);
  }
  assert.match(read("src/app/data/level-a/v1/model.json/route.ts"), /Response\.json\(levelAServedDoc\(\)\)/);
  assert.match(read("src/components/products/level-a-suggestions.tsx"), new RegExp(`href="${LEVEL_A_SERVED_PATH.replace(/\//g, "\\/")}"`), "linked by its literal path, so the /data sweep keeps it exactly when Level A is on the page");
  const m = levelAPageModel();
  assert.equal(m.asOf, buildAsOfIso());
  const doc = levelAServedDoc();
  assert.equal(doc.asOf, buildAsOfIso());
  assert.equal(doc.modelSha256, modelSha256(doc.model));
  assert.equal(doc.model.asOf, doc.asOf);
});

test("VERIFY: a deployment whose served model matches its pages passes; React's text separators are read through", () => {
  const f = fixture();
  assert.ok(shownItems(f.model).some((i) => i.card), "the fixture shows at least one card");
  assert.match(f.pages["/build/"], /<!-- -->/, "the real render carries the separators the check must read through");
  assert.deepEqual(verifyServed({ sha: SHA, ...f }), { ok: true, problems: [] });
});

test("VERIFY refuses every record/page mismatch", () => {
  const f = fixture();
  const v = (o) => verifyServed({ sha: SHA, ...f, ...o });
  assert.equal(v({ buildInfo: { ...f.buildInfo, commit: { sha: NEWER } } }).commitMismatch, true);
  assert.equal(v({ served: { ...f.served, public: false } }).ok, false, "Level A off on that deployment");
  assert.equal(v({ buildInfo: { ...f.buildInfo, builtAt: "2026-10-23T15:00:00.000Z" } }).ok, false, "a model from another instant");
  assert.equal(v({ served: { ...f.served, modelSha256: "0".repeat(64) } }).ok, false, "a tampered or truncated model");
  const leg = f.model.parlayLab.find((t) => t.card).card.legs[0].selection.label;
  const missingLeg = v({ pages: { ...f.pages, "/build/": f.pages["/build/"].split(leg.replace(/&/g, "&amp;")).join("") } });
  assert.equal(missingLeg.ok, false);
  assert.ok(missingLeg.problems.some((p) => p.includes(leg)), "the problem names the leg the page does not show");
  const noJoint = v({ pages: { ...f.pages, "/moonshot/": f.pages["/moonshot/"].replace(/model joint probability/g, "") } });
  assert.equal(noJoint.ok, false);
  assert.equal(v({ pages: { ...f.pages, "/bank-builder/": undefined } }).ok, false, "an unreadable page proves nothing");
});

test("RUN: writes the served model with shownAt = the build instant; re-running writes nothing", async () => {
  const f = fixture();
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "levela-rec-")), "s.jsonl");
  const fetchText = fetcher({ "/data/build-info.json": f.buildInfo, [LEVEL_A_SERVED_PATH]: f.served, ...f.pages });
  const r1 = await runFromDeployment({ sha: SHA, origin: "https://example.test", write: true, file, now: "2026-10-23T14:05:00.000Z", fetchText });
  assert.equal(r1.ok, true);
  assert.ok(r1.added > 0);
  const rows = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  for (const e of rows) {
    assert.equal(e.shownAt, AS_OF);
    assert.deepEqual(e.source, { kind: "production-deployment", sha: SHA, origin: "https://example.test", servedModelSha256: f.served.modelSha256 });
    assert.equal(e.price, null);
  }
  assert.deepEqual(recordViolations({ beforeText: "", afterText: fs.readFileSync(file, "utf8") }), []);
  const r2 = await runFromDeployment({ sha: SHA, origin: "https://example.test", write: true, file, now: "2026-10-23T14:10:00.000Z", fetchText });
  assert.equal(r2.added, 0);
});

test("RUN: a refused read writes nothing; a superseded deployment writes nothing; a lagging alias is re-read", async () => {
  const f = fixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "levela-rec-"));
  const base = { "/data/build-info.json": f.buildInfo, [LEVEL_A_SERVED_PATH]: f.served, ...f.pages };
  const bad = await runFromDeployment({ sha: SHA, origin: "https://example.test", write: true, file: path.join(dir, "a.jsonl"), fetchText: fetcher({ ...base, "/build/": "<html></html>" }) });
  assert.equal(bad.ok, false);
  assert.equal(fs.existsSync(path.join(dir, "a.jsonl")), false, "nothing written on a mismatch");
  const sup = await runFromDeployment({ sha: SHA, origin: "https://example.test", write: true, file: path.join(dir, "b.jsonl"), fetchText: fetcher({ ...base, "/data/build-info.json": { ...f.buildInfo, commit: { sha: NEWER } } }), isNewer: (s) => s === NEWER });
  assert.deepEqual([sup.ok, sup.superseded, sup.wrote], [true, true, false]);
  const stale = await runFromDeployment({ sha: SHA, origin: "https://example.test", write: true, file: path.join(dir, "c.jsonl"), attempts: 2, sleep: async () => {}, fetchText: fetcher({ ...base, "/data/build-info.json": { ...f.buildInfo, commit: { sha: "c".repeat(40) } } }) });
  assert.equal(stale.ok, false, "an older build still served after every read is a refusal, not a pass");
  let reads = 0;
  const lag = await runFromDeployment({ sha: SHA, origin: "https://example.test", write: true, file: path.join(dir, "d.jsonl"), attempts: 3, sleep: async () => {}, fetchText: fetcher({ ...base, "/data/build-info.json": () => JSON.stringify(++reads < 2 ? { ...f.buildInfo, commit: { sha: "c".repeat(40) } } : f.buildInfo) }) });
  assert.equal(lag.ok, true);
  assert.ok(lag.added > 0);
});

test("SHOWN BEFORE START: the gate reads shownAt (the build), not when the recorder happened to run", () => {
  const { model } = fixture();
  const late = recordEntries(model, { recordedAt: "2026-10-23T21:00:00.000Z", shownAt: AS_OF });
  assert.ok(appendRecord([], late).length > 0, "shown at 14:00Z, recorded after the 19:00Z start: it was shown before start, so it counts");
  const after = recordEntries(model, { recordedAt: "2026-10-23T21:00:00.000Z", shownAt: "2026-10-23T19:00:00.000Z" });
  assert.equal(appendRecord([], after).length, 0, "shown at or after its first start: never recorded");
  const manual = recordEntries(model, { recordedAt: "2026-10-23T21:00:00.000Z" });
  assert.equal(appendRecord([], manual).length, 0, "an entry without shownAt still gates on recordedAt");
});

test("WORKFLOW: per Production deployment, commits only the record, builds nothing, holds no secret", () => {
  const wf = read("../.github/workflows/level-a-record.yml");
  assert.match(wf, /^on:\n  deployment_status:/m);
  assert.match(wf, /github\.event\.deployment_status\.state == 'success' && github\.event\.deployment\.environment == 'Production'/);
  assert.match(wf, /record-level-a-from-deployment\.mjs --sha "\$DEPLOY_SHA" --served-from "\$SERVED_FROM" --attempts 5 --write/);
  assert.match(wf, /SERVED_FROM: \$\{\{ github\.event\.deployment_status\.created_at \}\}/, "servedFrom is the success status: when the deployment went live");
  assert.match(wf, /echo "## Level A record: \$\(head -n 1 \/tmp\/level-a-record\.txt\)"/, "the summary leads with the verdict line");
  assert.match(wf, /exit \$CODE/, "a REFUSED run stays red");
  assert.match(wf, /permissions:\n  contents: write\n(?:  #.*\n)*  deployments: read\n\n/, "read-only deployments, nothing else");
  assert.match(wf, /git add data\/internal\/products\/level-a\/suggestions\.jsonl/);
  assert.equal((wf.match(/git add /g) ?? []).length, 1, "the record is the only path it stages");
  assert.match(wf, /\[skip ci\]/);
  assert.doesNotMatch(wf, /secrets\.|ODDS_API|VERCEL_TOKEN/);
  const ignore = read("scripts/vercel-ignore-build.sh");
  assert.doesNotMatch(ignore, /data\/internal\/products/, "the record is not a BUILD_INPUT, so its commits build nothing and cannot re-trigger this workflow");
});

test("SERVED FROM: the gate reads when readers could first see the page; a status before the build is refused", async () => {
  const { model } = fixture();
  const firstStart = "2026-10-23T19:00:00Z";
  assert.ok(appendRecord([], recordEntries(model, { recordedAt: "2026-10-23T14:05:00.000Z", shownAt: AS_OF, servedFrom: "2026-10-23T14:04:00.000Z" })).length > 0);
  assert.equal(appendRecord([], recordEntries(model, { recordedAt: "2026-10-23T19:10:00.000Z", shownAt: AS_OF, servedFrom: firstStart })).length, 0, "built before the start but live only at it: never recorded");
  const f = fixture();
  const fetchText = fetcher({ "/data/build-info.json": f.buildInfo, [LEVEL_A_SERVED_PATH]: f.served, ...f.pages });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "levela-rec-")), "s.jsonl");
  const early = await runFromDeployment({ sha: SHA, servedFrom: "2026-10-23T13:59:00.000Z", origin: "https://example.test", write: true, file, fetchText });
  assert.equal(early.ok, false, "a deployment cannot go live before it was built");
  assert.equal(fs.existsSync(file), false);
  const ok = await runFromDeployment({ sha: SHA, servedFrom: "2026-10-23T14:03:00.000Z", origin: "https://example.test", write: true, file, fetchText });
  assert.equal(ok.ok, true);
  for (const l of fs.readFileSync(file, "utf8").trim().split("\n")) assert.equal(JSON.parse(l).servedFrom, "2026-10-23T14:03:00.000Z");
});

test("VERDICT: the first line says OK / SUPERSEDED / REFUSED and why", () => {
  assert.match(verdictLine({ ok: true, added: 2, entries: ["a/high", "b/longshot"] }), /^OK: 2 new entries recorded \(a\/high, b\/longshot\)$/);
  assert.match(verdictLine({ ok: true, added: 0, entries: [] }), /^OK: 0 new entries recorded$/);
  assert.match(verdictLine({ ok: true, superseded: true, servedSha: NEWER }), /^SUPERSEDED: Production already serves the newer bbbbbbbbbb/);
  assert.match(verdictLine({ ok: false, problems: ["x", "y"] }), /^REFUSED: x; y$/);
  const script = read("scripts/products/record-level-a-from-deployment.mjs");
  assert.match(script, /catch \(e\) \{[\s\S]*?out = \{ ok: false, problems: \[String\(e\?\.message \?\? e\)\]/, "a thrown read still produces a REFUSED verdict");
});

test("PUBLIC BY DESIGN: the served model carries no price, odds, payout, internal path or private id; a flag-OFF build emits no file", () => {
  const doc = levelAServedDoc();
  const json = JSON.stringify(doc);
  for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey", "ODDS_API", "internal/platform", "private-data", "GTP_PRIVATE"]) assert.ok(!json.includes(banned), `the served model must not carry "${banned}"`);
  assert.doesNotMatch(json, /"(americanOdds|overAmerican|underAmerican|odds|book|bookmaker|ev|edge|stake)":/);
  for (const m of json.matchAll(/"(price|payout)":([^,}]+)/g)) assert.equal(m[2], "null", `${m[1]} is always null`);
  for (const m of json.matchAll(/"priced":([^,}]+)/g)) assert.equal(m[1], "false");
  /* Flag OFF: the doc says public:false, the Level A section (the only literal link) is absent, the file is in no
     always-public list, so the post-build sweep removes it. */
  assert.match(read("src/lib/products/level-a/model.mjs"), /public: levelAEnabled\(\)/);
  const prune = read("scripts/prune-internal-routes.mjs");
  assert.doesNotMatch(prune.match(/const ALWAYS_PUBLIC_DATA = \[[^\]]*\]/)[0] + prune.match(/const ALWAYS_PUBLIC_DATA_DIRS = \[[^\]]*\]/)[0], /level-a/);
  const linkers = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(tsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) { const t = fs.readFileSync(f, "utf8"); if (t.includes(LEVEL_A_SERVED_PATH) && !f.includes(`${path.sep}data${path.sep}level-a${path.sep}`) && !f.endsWith("model.mjs")) linkers.push(path.relative(process.cwd(), f)); } } };
  walk(path.resolve(process.cwd(), "src"));
  assert.deepEqual(linkers, ["src/components/products/level-a-suggestions.tsx"], "only the Level A section links the file, and it renders only when Level A is on");
  /* The client-graph lesson: no client component reaches the Level A model, its readers or the record. */
  const clientHits = [];
  const walkC = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walkC(f); else if (/\.(tsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) { const t = fs.readFileSync(f, "utf8"); if (/^["']use client["']/m.test(t) && /level-a\/(model|sources|record)/.test(t)) clientHits.push(path.relative(process.cwd(), f)); } } };
  walkC(path.resolve(process.cwd(), "src"));
  assert.deepEqual(clientHits, []);
});
