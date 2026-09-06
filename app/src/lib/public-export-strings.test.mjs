/**
 * PROGRAM 073 — the production export must not ship internal language.
 *
 * Calibrated against the real export before this guard existed: /picks and /market-guide were
 * shipping sprint-numbered engineering notes ("Sprint 035 the category is shown for transparency
 * only…") to the public. Nothing failed, because nothing looked. Unlinked and noindex are not
 * privacy boundaries; the only boundary that holds is "the string is not in the shipped bytes".
 *
 * Structure follows internal-route-exclusion.test.mjs: the scanner itself is proven on synthetic
 * positive/negative cases in every run (so a broken scanner cannot pass silently), and the sweep of
 * out/ runs whenever a build exists. Terms are matched with word-ish boundaries and a small,
 * individually-justified allowlist — an over-broad ban that fires on ordinary public English would
 * get this guard deleted, which is worse than not having it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd(); // app/

/**
 * Banned in public output. Each entry names internal machinery, not product vocabulary:
 * assistant/session names, program/sprint labels, repo mechanics, secret/env names, protected
 * hashes, and operator instructions. `re` is deliberately specific — "Sprint 035" is internal,
 * "sprint" as a verb is English.
 */
export const BANNED = [
  { id: "assistant-names", re: /\b(?:Claude|Fable 5|Ultracode)\b/ },
  { id: "sprint-label", re: /\bSprint\s+\d/i },
  { id: "program-label", re: /\bProgram\s+0\d/i },
  { id: "cowork-vp", re: /\bcowork\b|(?:^|[\s"(])vp\//i },
  { id: "local-paths", re: /\/Users\/|\/home\/runner\// },
  { id: "localhost", re: /\blocalhost\b/ },
  { id: "secret-names", re: /OPS_WEBHOOK_URL|ODDS_API_KEY|NEXT_PUBLIC_ANALYTICS_(?:ENABLED|ENDPOINT)/ },
  /*
   * The two protected money hashes stay matched literally. The generic half used to be the bare word
   * `\bmd5\b`, which is not a hash — it is a word — and on 2026-09-06 it flagged four public pages
   * over the EPL canonical event id `epl:premier-league:2026-09-18:2026-27:md5:brentford-v-chelsea`,
   * where "md5" is an id-scheme segment label. That is identity data, not a leaked digest.
   *
   * The fix keeps the original intent — "md5" in PROSE is internal language — and excludes the case
   * where it is a colon-delimited segment of an identifier. A first attempt also flagged any bare
   * 32-char hex run, which was worse: this repository uses content-derived 32-hex ids as public
   * game identity, so that clause failed on legitimate gameIds across the build.
   */
  { id: "protected-hashes", re: /affe6b21071f2b3be96bb2774eb347c3|cb80473f88f3cb5f67208fa568925295|(?<![:\w-])md5(?![:\w-])/i },
  { id: "repo-mechanics", re: /\bgit (?:rebase|push|stash|checkout)\b|force-push/ },
  { id: "dev-markers", re: /\bTODO:|\bFIXME\b/ },
  { id: "ops-language", re: /founder decision|mutation test|pipefail|wall-clock proof/i },
];

/** Every banned-term hit in one document, with a short excerpt for the failure message. */
export function scanDocument(text) {
  const hits = [];
  for (const { id, re } of BANNED) {
    const m = re.exec(text);
    if (m) hits.push({ id, excerpt: text.slice(Math.max(0, m.index - 40), m.index + 60).replace(/\s+/g, " ") });
  }
  return hits;
}

// ── the scanner is proven before it is trusted ─────────────────────────────────

test("known-negative: ordinary public copy passes the scanner", () => {
  const publicCopy = [
    "The sportsbook price converts to 42.2% and the simulation produced 54.2%.",
    "Rows resolve as they finish; nothing is counted early.",
    "A late sprint to the finish line decided the game.", // 'sprint' as English, no number
    "This program of daily settlement runs every night.", // 'program' as English, no label
    "Games are graded only from official results.",
  ].join(" ");
  assert.deepEqual(scanDocument(publicCopy), []);
});

test("known-positive: each banned class is caught individually", () => {
  const cases = [
    ["assistant-names", "generated with Claude assistance"],
    ["sprint-label", "Sprint 035 the category is shown for transparency"],
    ["program-label", "delivered in Program 069 as part of the cleanup"],
    ["local-paths", "read from /Users/someone/repo/app/data.json"],
    ["secret-names", "set OPS_WEBHOOK_URL to receive alerts"],
    ["protected-hashes", "verify the md5 before deploying"],
    ["protected-hashes", "the bankroll is affe6b21071f2b3be96bb2774eb347c3"],
    ["repo-mechanics", "then git rebase onto main and push"],
    ["dev-markers", "TODO: remove before launch"],
    ["ops-language", "closes the wall-clock proof for pipefail"],
  ];
  for (const [id, text] of cases) {
    const hits = scanDocument(text);
    assert.ok(hits.some((h) => h.id === id), `'${text}' must be caught by ${id}, got ${JSON.stringify(hits)}`);
  }
});

test("known-negative: an id-scheme segment is not a leaked hash", () => {
  /*
   * The counter-case to the narrowing above. `md5` as a SEGMENT LABEL inside a canonical event id is
   * identity data that belongs on the page; flagging it made four correct public pages fail. If this
   * ever starts matching again, the pattern has widened back into a word match.
   */
  const benign = [
    "epl:premier-league:2026-09-18:2026-27:md5:brentford-v-chelsea",
    "canonical id epl:premier-league:2026-09-19:2026-27:md5:tottenham-hotspur-v-aston-villa",
  ];
  for (const text of benign) {
    const hits = scanDocument(text).filter((h) => h.id === "protected-hashes");
    assert.deepEqual(hits, [], `'${text}' is an identifier, not a hash leak`);
  }
  // A public content-derived game id is 32 hex characters and belongs on the page.
  assert.deepEqual(scanDocument('"gameId":"35ced11ee1bb21f179e3ac5a39a75fd2"').filter((h) => h.id === "protected-hashes"), []);
  // …and the narrowing must not have cost us either real thing.
  assert.ok(scanDocument("verify the md5 first").some((h) => h.id === "protected-hashes"));
  assert.ok(scanDocument("bankroll affe6b21071f2b3be96bb2774eb347c3").some((h) => h.id === "protected-hashes"));
});

// ── the sweep of the real export, when a build exists ──────────────────────────

function* htmlFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith(".html")) yield p;
  }
}

test("if a build exists, no exported HTML carries a banned internal string", () => {
  const out = path.join(APP, "out");
  if (!fs.existsSync(out)) return; // no build in this run — the pre-deploy build always runs this
  const offenders = [];
  for (const file of htmlFiles(out)) {
    const hits = scanDocument(fs.readFileSync(file, "utf8"));
    for (const h of hits) offenders.push(`${path.relative(out, file)} [${h.id}]: …${h.excerpt}…`);
  }
  assert.deepEqual(offenders, [], `internal language shipped to the public:\n  ${offenders.join("\n  ")}`);
});
