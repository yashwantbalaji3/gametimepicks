/**
 * ASK CI + BUILT-EXPORT GUARDS.
 *
 * Two families of check that both answer the same question: does the thing we believe protects Ask
 * actually protect it?
 *
 *   CI PATHS        — the quality gate must RUN when Ask's runtime changes. It did not, for the whole
 *                     of `app/api/**`, from the day the Live gateway shipped until v1.6 found it.
 *   BUILT EXPORT    — the page must exist, the assets must be published, and the key must not be in
 *                     the bundle. "We did not put it there" is a claim; "it is not in the output" is
 *                     a measurement.
 *
 * The built-export half reads `out/`, so this file runs in the post-build phase. The runner partitions
 * by content, and it REFUSES to run that phase with `out/` missing — a guard that cannot look must
 * not report that it looked.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ASK_ASSET_PREFIX, ASK_ROUTE } from "./contract.mjs";
import { ASK_REQUIRED_ENV } from "./provider.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const REPO = path.join(APP, "..");
const OUT = path.join(APP, "out");

/* ═══════════════════════════  CI PATH COVERAGE  ═══════════════════════════ */

const WORKFLOW = path.join(REPO, ".github", "workflows", "quality-gate.yml");
const workflow = fs.existsSync(WORKFLOW) ? fs.readFileSync(WORKFLOW, "utf8") : "";

/** The `paths:` list under a given trigger. Parsed textually — this file must not add a YAML dependency. */
function pathsUnder(trigger) {
  const block = workflow.split(/^\s{2}(?=\w)/m).find((b) => b.startsWith(`${trigger}:`)) ?? "";
  return [...block.matchAll(/^\s*-\s*"([^"]+)"/gm)].map((m) => m[1]);
}

test("the quality gate workflow exists and declares both triggers", () => {
  assert.ok(workflow.length > 0, "quality-gate.yml is missing");
  assert.match(workflow, /^\s{2}push:/m);
  assert.match(workflow, /^\s{2}pull_request:/m);
});

test("a PUSH that changes a serverless function runs the quality gate", () => {
  /*
   * ⚠ THE BLIND SPOT v1.6 FOUND. The push filter listed app/src, app/e2e, app/scripts and the config
   * files — but not app/api. Vercel deploys `app/api/*.mjs` as functions independently of the Next
   * build, so the Live gateway, the analytics collector and the slip reader are all production runtime
   * code that landed on main with no gate run. The pull_request trigger uses `app/**` and DID cover
   * them, which is precisely why nobody noticed: PRs were green and pushes ran nothing.
   */
  const push = pathsUnder("push");
  assert.ok(push.includes("app/api/**"), "app/api/** must trigger the gate on push — Ask's endpoint lives there");
  assert.ok(push.includes("app/vercel.json"), "app/vercel.json must trigger the gate on push — routing is deployment behaviour");
});

test("a PULL REQUEST touching anything in app/ still runs the gate", () => {
  assert.ok(pathsUnder("pull_request").includes("app/**"));
});

test("the push filter still covers the source, scripts and pipeline it always did", () => {
  // Widening one filter must not be an opportunity to quietly narrow another.
  const push = pathsUnder("push");
  for (const required of ["app/src/**", "app/e2e/**", "app/scripts/**", "pipeline/**", "scripts/ci/**"]) {
    assert.ok(push.includes(required), `${required} must still trigger the gate on push`);
  }
});

test("the path filter is not so wide that data-only bot commits rebuild the site", () => {
  /*
   * The other direction matters too. Nightly automation pushes generated artifacts to
   * app/public/data/** many times a day; those commits change no code and must not trigger a build.
   * A filter widened to `app/**` would turn every one of them into a 17-minute gate run.
   */
  const push = pathsUnder("push");
  assert.ok(!push.includes("app/**"), "the push filter must not be `app/**` — bot data commits would rebuild the site");
  assert.ok(!push.some((p) => p.startsWith("app/public/")), "generated public data must not trigger the gate");
});

test("CI is told to use the fake model provider and can never be given a real key", () => {
  // The eval refuses a real-provider run inside CI outright; this asserts the workflow's own intent.
  assert.ok(!/ANTHROPIC_API_KEY/.test(workflow), "the quality gate must never receive an Anthropic key");
  assert.ok(!/secrets\.ANTHROPIC/.test(workflow));
});


/**
 * Every JS chunk in the export, RECURSIVELY.
 *
 * ⚠ Next writes per-route client chunks to `_next/static/chunks/app/<route>/page-*.js`, not to the
 * top level. A non-recursive read found plenty of chunks — so it did not look empty — while missing
 * the only one that actually contains the Ask component. The guard caught itself because it refuses
 * to pass when it finds nothing to inspect; without that refusal it would have reported a clean scan
 * of the wrong files.
 */
function allChunks(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...allChunks(abs));
    else if (e.name.endsWith(".js")) out.push(abs);
  }
  return out;
}

/* ═══════════════════════════  THE BUILT EXPORT  ═══════════════════════════ */

const built = fs.existsSync(OUT);

test("the Ask page is in the built export", () => {
  assert.ok(built, "out/ is missing — the post-build phase must not run without it");
  const page = path.join(OUT, ASK_ROUTE.replace(/^\/|\/$/g, ""), "index.html");
  assert.ok(fs.existsSync(page), `${ASK_ROUTE} did not render into the export`);
  const html = fs.readFileSync(page, "utf8");
  assert.match(html, /Ask GameTime/, "the page must name itself");
  assert.match(html, /does not search the web/i, "the page must state what Ask cannot do");
});

test("the Ask assets survived the route prune", () => {
  /*
   * ⚠ prune-internal-routes.mjs keeps only NAMED /data prefixes. An unlisted prefix is swept out of
   * the export, and the failure is invisible from the page: /ask/ would render perfectly while every
   * tool returned ASSET_UNAVAILABLE in production and nowhere else.
   */
  const dir = path.join(OUT, ASK_ASSET_PREFIX.replace(/^\//, ""));
  assert.ok(fs.existsSync(dir), `${ASK_ASSET_PREFIX} was pruned from the export — add it to ALWAYS_PUBLIC_DATA_DIRS`);
  for (const required of ["entities.json", "forecasts.json", "parlays.json", "help.json", "matchups.json"]) {
    assert.ok(fs.existsSync(path.join(dir, required)), `${ASK_ASSET_PREFIX}/${required} is missing from the export`);
  }
});

test("no Anthropic key, header or endpoint reaches the client bundle", () => {
  /*
   * THE NEGATIVE BUILD TEST (§55, §137). Scans every byte the browser can download. A key in server
   * code is safe; a key in a chunk is a disclosure, and the only way to know which happened is to read
   * the output rather than the intention.
   */
  const scanned = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { walk(abs); continue; }
      if (!/\.(js|mjs|html|json|css|txt|map)$/.test(e.name)) continue;
      // The published Ask assets are data, not code, and are checked by their own leak guard.
      if (abs.includes(path.join("data", "ask"))) continue;
      scanned.push(abs);
    }
  };
  walk(OUT);
  assert.ok(scanned.length > 100, `only ${scanned.length} files scanned — this guard would pass vacuously`);

  const forbidden = [
    [/\bsk-ant-[A-Za-z0-9_-]{16,}/, "an Anthropic API key"],
    [/x-api-key/i, "an Anthropic auth header"],
    [/api\.anthropic\.com/i, "the Anthropic endpoint"],
    [/NEXT_PUBLIC_ANTHROPIC/i, "a public-prefixed Anthropic variable"],
    [/anthropic-version/i, "the Anthropic version header"],
  ];
  for (const file of scanned) {
    const text = fs.readFileSync(file, "utf8");
    for (const [re, what] of forbidden) {
      assert.ok(!re.test(text), `${path.relative(OUT, file)} contains ${what}`);
    }
  }
});

test("no server-only Ask variable name is compiled into the client", () => {
  for (const name of ASK_REQUIRED_ENV) {
    assert.ok(!name.startsWith("NEXT_PUBLIC"), `${name} must never be a NEXT_PUBLIC variable`);
  }
  /*
   * Next inlines only LITERAL `process.env.NEXT_PUBLIC_*` references, so a server-only name cannot be
   * inlined — but the check is on the OUTPUT, because that reasoning is exactly the kind that stops
   * being true after a refactor nobody re-examined.
   */
  const files = allChunks(path.join(OUT, "_next", "static", "chunks"));
  assert.ok(files.length > 0, "no chunks found — this guard would pass vacuously");
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    for (const name of ASK_REQUIRED_ENV) {
      assert.ok(!text.includes(name), `chunk ${path.relative(OUT, f)} mentions ${name}`);
    }
  }
});

test("the Ask page ships no conversation persistence", () => {
  /*
   * v1.6 stores nothing. A localStorage key would be a persistence system created by accident, and the
   * privacy claim on the page ("nothing you type here is stored") would become false.
   */
  const askChunks = allChunks(path.join(OUT, "_next", "static", "chunks"))
    .map((f) => ({ f, text: fs.readFileSync(f, "utf8") }))
    .filter(({ text }) => text.includes("Ask GameTime a question") || text.includes("ask-composer"));

  assert.ok(askChunks.length > 0, "the Ask component was not found in any chunk — this guard would pass vacuously");
  for (const { f, text } of askChunks) {
    const where = path.relative(OUT, f);
    for (const key of ["gtp.ask", "askConversation", "ask-history", "askMessages"]) {
      assert.ok(!text.includes(key), `chunk ${where} appears to persist a conversation under "${key}"`);
    }
    // Nothing in the Ask surface may reach browser storage at all — not a key we thought of, any key.
    for (const api of ["localStorage", "sessionStorage", "indexedDB", "document.cookie"]) {
      assert.ok(!text.includes(api), `chunk ${where} touches ${api} — v1.6 stores no conversation`);
    }
  }
});
