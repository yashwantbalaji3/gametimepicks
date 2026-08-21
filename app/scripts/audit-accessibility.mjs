/**
 * Structural accessibility audit over the BUILT export (Program 137).
 *
 * SCOPE, STATED HONESTLY. The repository has Playwright but no axe/accessibility tooling, and
 * this is not a substitute for one. It checks the deterministic, high-signal structure that can
 * be verified from exported HTML — the defect classes that actually block a screen-reader or
 * keyboard user and that a static check can prove:
 *
 *   lang · unique page title · exactly one h1 · no skipped heading levels · main landmark ·
 *   accessible names on links and buttons · alt on images · labels on inputs · table headers
 *
 * It CANNOT judge colour contrast, focus visibility, focus order, live regions, or anything
 * requiring layout or interaction. Those are checked in the browser and reported separately.
 * A route this script passes is NOT "accessible" — it is "free of these structural defects".
 *
 *   node app/scripts/audit-accessibility.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(APP, "out");
const JSON_MODE = process.argv.includes("--json");

if (!fs.existsSync(OUT)) {
  console.error("no build at app/out — run `npm run build` first");
  process.exit(2);
}

/** Launch-critical public routes: the first-time-user journey. */
// P177-A: `nfl` was absent from this list while the Playwright matrix already covered it — the two
// lists are supposed to stay in sync and had silently diverged. The per-game report joins too, and
// is DISCOVERED from the export rather than pinned: event ids change every slate, so a hard-coded
// one would audit a 404 within a day and report "no findings" for a page nobody can reach.
const NFL_GAME_DIR = path.join(OUT, "nfl", "game");
const firstNflGame = fs.existsSync(NFL_GAME_DIR)
  ? fs.readdirSync(NFL_GAME_DIR).filter((d) => /^\d+$/.test(d)).sort()[0]
  : null;
/* P188: the EPL per-fixture report joins on the SAME terms — discovered, never pinned. Fixture slugs
   change every matchweek, so a hard-coded one would audit a 404 and report "clean" for a dead page. */
const EPL_MATCH_DIR = path.join(OUT, "epl", "match");
const firstEplMatch = fs.existsSync(EPL_MATCH_DIR)
  ? fs.readdirSync(EPL_MATCH_DIR).filter((d) => /-v-.+-\d{4}-\d{2}-\d{2}$/.test(d)).sort()[0]
  : null;
const ROUTES = ["", "today", "markets", "results", "methodology", "learn", "moonshot", "bank-builder", "mlb", "nfl", "simulate", "sports",
  "ufc", "goal-rush", "bucket-blitz", "epl",   // kept in sync with ROUTES in e2e/accessibility.spec.ts
  ...(firstNflGame ? [`nfl/game/${firstNflGame}`] : []),
  ...(firstEplMatch ? [`epl/match/${firstEplMatch}`] : [])];

const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
const textOf = (s) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();

function auditRoute(route) {
  const file = path.join(OUT, route, "index.html");
  if (!fs.existsSync(file)) return { route: route || "/", missing: true, findings: [] };
  const raw = fs.readFileSync(file, "utf8");
  const html = strip(raw);
  const f = [];
  const add = (severity, rule, detail) => f.push({ severity, rule, detail });

  // 1. lang — without it a screen reader guesses pronunciation for the whole document.
  if (!/<html[^>]*\slang=["'][a-z]/i.test(raw)) add("serious", "html-has-lang", "<html> has no lang attribute");

  // 2. Page title — the first thing announced, and the tab/bookmark identity.
  const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  if (!title || !title.trim()) add("serious", "document-title", "no <title>");

  // 3. Headings — exactly one h1, and no skipped levels (h2 → h4).
  const heads = [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: +m[1], text: textOf(m[2]) }));
  const h1s = heads.filter((h) => h.level === 1);
  if (h1s.length === 0) add("moderate", "page-has-heading-one", "no <h1>");
  if (h1s.length > 1) add("moderate", "heading-one-unique", `${h1s.length} <h1> elements`);
  for (let i = 1; i < heads.length; i++) {
    if (heads[i].level - heads[i - 1].level > 1) {
      add("moderate", "heading-order", `h${heads[i - 1].level} → h${heads[i].level} ("${heads[i].text.slice(0, 40)}")`);
      break; // one report per route is enough to action
    }
  }
  const empty = heads.filter((h) => !h.text);
  if (empty.length) add("moderate", "empty-heading", `${empty.length} empty heading(s)`);

  // 4. Landmark — keyboard users jump by landmark; without <main> there is nothing to jump to.
  if (!/<main[\s>]/i.test(html)) add("moderate", "landmark-main", "no <main> landmark");

  // 5. Accessible names on interactive elements.
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  const namelessLinks = anchors.filter(([, attrs, inner]) =>
    !textOf(inner) && !/aria-label=|aria-labelledby=|title=/i.test(attrs) && !/<img[^>]+alt=["'][^"']+/i.test(inner));
  if (namelessLinks.length) add("serious", "link-name", `${namelessLinks.length} link(s) with no accessible name`);

  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  const namelessButtons = buttons.filter(([, attrs, inner]) =>
    !textOf(inner) && !/aria-label=|aria-labelledby=|title=/i.test(attrs));
  if (namelessButtons.length) add("serious", "button-name", `${namelessButtons.length} button(s) with no accessible name`);

  // 6. Images — every <img> needs alt (empty alt is valid for decorative).
  const imgs = [...html.matchAll(/<img\b([^>]*)>/gi)];
  const noAlt = imgs.filter(([, attrs]) => !/\salt=/i.test(attrs));
  if (noAlt.length) add("serious", "image-alt", `${noAlt.length} <img> without an alt attribute`);

  // 7. Inputs — a control with no programmatic label is unusable non-visually.
  const inputs = [...html.matchAll(/<input\b([^>]*)>/gi)].filter(([, a]) => !/type=["'](hidden|submit|button)["']/i.test(a));
  const unlabelled = inputs.filter(([, attrs]) => {
    if (/aria-label=|aria-labelledby=|title=/i.test(attrs)) return false;
    const id = (attrs.match(/\sid=["']([^"']+)["']/i) || [])[1];
    return !(id && new RegExp(`<label[^>]+for=["']${id}["']`, "i").test(html));
  });
  if (unlabelled.length) add("serious", "label", `${unlabelled.length} input(s) with no associated label`);

  // 8. Data tables need headers; a caption is strongly preferred.
  for (const [tbl] of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    if (!/<th\b/i.test(tbl)) { add("moderate", "table-headers", "a <table> has no <th> cells"); break; }
  }

  return { route: route || "/", missing: false, findings: f, headings: heads.length, links: anchors.length };
}

const results = ROUTES.map(auditRoute);
const all = results.flatMap((r) => r.findings.map((f) => ({ ...f, route: r.route })));

if (JSON_MODE) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), routes: results, total: all.length }, null, 2));
} else {
  console.log("=== structural accessibility audit (built export) ===");
  for (const r of results) {
    if (r.missing) { console.log(`  ${(r.route).padEnd(14)} — route not in export (skipped)`); continue; }
    const s = r.findings.filter((x) => x.severity === "serious").length;
    const m = r.findings.filter((x) => x.severity === "moderate").length;
    console.log(`  ${r.route.padEnd(14)} ${r.findings.length === 0 ? "clean" : `${s} serious, ${m} moderate`}`);
    for (const f of r.findings) console.log(`       [${f.severity}] ${f.rule}: ${f.detail}`);
  }
  const serious = all.filter((x) => x.severity === "serious").length;
  console.log(`\n  TOTAL: ${all.length} finding(s) — ${serious} serious`);
  console.log("  NOTE: structural only. Contrast, focus visibility/order, live regions and");
  console.log("        interaction are NOT covered here and are checked in the browser.");
}
process.exit(0);
