/**
 * POST-BUILD: no exported /data JSON redistributes NBA sportsbook lines (provider terms, the-odds-api.com, updated
 * 2026-08-31: display in a UI or website is allowed; redistribution as "your own API, data feed, downloadable files" is
 * not). Reads the built export at app/out/ (the post-build phase of scripts/ci/run-suite.mjs).
 *   - the line-comparison artifact (gtp.nba.line-comparisons@1) is never copied into out/ — not under data/nba/lines,
 *     not under data/odds-display, not anywhere under out/data;
 *   - no JSON under out/data/nba/ or out/data/social/nba/ carries a price (overPrice / underPrice / overAmerican /
 *     underAmerican) or a book with a value, unless the display authorization record allows prices in the social feed
 *     (socialPrices — written provider confirmation);
 *   - a social-feed lineComparison carries a `line` only when the social surface is authorized;
 *   - (2026-10-29, encrypted at rest) no `.json.enc` envelope and no DECRYPTED display artifact (gtp.nba.line-comparisons@1,
 *     gtp.nfl.prop-lines@1) appears ANYWHERE in the export — not as data, not inside a page payload or script. (NFL team markets under
 *     data/nfl/markets are a pre-existing, separately governed surface and are not in scope here.)
 * Run after `npm run build`: npx tsx --test src/lib/odds/odds-display-export.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { displayAuthorization } from "./display-authorization.mjs";

const OUT = path.join(process.cwd(), "out");
const DATA = path.join(OUT, "data");
const built = fs.existsSync(DATA);
const walk = (d, acc = []) => { if (!fs.existsSync(d)) return acc; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, acc); else acc.push(p); } return acc; };
const PRICE_KEYS = new Set(["overPrice", "underPrice", "overAmerican", "underAmerican"]);

/** Every (keyPath, value) in a JSON value whose key matches `keep`. */
function findKeys(v, keep, at = "$", out = []) {
  if (Array.isArray(v)) v.forEach((x, i) => findKeys(x, keep, `${at}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (keep(k, at)) out.push([`${at}.${k}`, x]); findKeys(x, keep, `${at}.${k}`, out); }
  return out;
}

test("the line-comparison artifact is never part of the export", { skip: !built && "no built export (post-build phase only)" }, () => {
  assert.ok(!fs.existsSync(path.join(DATA, "nba", "lines")), "out/data/nba/lines must not exist");
  assert.ok(!fs.existsSync(path.join(DATA, "odds-display")), "out/data/odds-display must not exist");
  const hits = walk(DATA).filter((f) => f.endsWith(".json") && fs.readFileSync(f, "utf8").includes("gtp.nba.line-comparisons@1"));
  assert.deepEqual(hits.map((f) => path.relative(OUT, f)), []);
});

const SCHEMAS = ["gtp.nba.line-comparisons@1", "gtp.nfl.prop-lines@1", "gtp.odds-display.enc@1"];
test("no encrypted envelope and no decrypted display artifact anywhere in the export (data, pages, payloads, scripts)", { skip: !built && "no built export (post-build phase only)" }, () => {
  const files = walk(OUT);
  assert.deepEqual(files.filter((f) => f.endsWith(".enc")).map((f) => path.relative(OUT, f)), [], "no .json.enc is ever exported");
  const hits = files.filter((f) => /\.(json|txt|js|html|rsc)$/.test(f)).filter((f) => { const t = fs.readFileSync(f, "utf8"); return SCHEMAS.some((x) => t.includes(x)); });
  assert.deepEqual(hits.map((f) => path.relative(OUT, f)), []);
});

test("no exported NBA or NBA-social JSON carries a price or a book value (unless feed prices are authorized)", { skip: !built && "no built export (post-build phase only)" }, () => {
  const feedPrices = displayAuthorization("nba", "socialPrices").ok;
  const social = displayAuthorization("nba", "social").ok;
  const files = [...walk(path.join(DATA, "nba")), ...walk(path.join(DATA, "social", "nba"))].filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, "the export holds NBA data files (the scan is not vacuous)");
  const bad = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    const isFeed = f.includes(`${path.sep}social${path.sep}nba${path.sep}`);
    for (const [k, v] of findKeys(j, (key) => PRICE_KEYS.has(key) || key === "book")) if (v != null && !(isFeed && feedPrices)) bad.push(`${path.relative(OUT, f)} ${k}`);
    if (isFeed) for (const [k, v] of findKeys(j, (key, at) => key === "line" && /lineComparison/.test(at))) if (v != null && !social) bad.push(`${path.relative(OUT, f)} ${k}`);
  }
  assert.deepEqual(bad.slice(0, 20), []);
});
