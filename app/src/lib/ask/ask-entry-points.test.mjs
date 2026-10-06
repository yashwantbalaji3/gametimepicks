/**
 * ASK ENTRY POINTS (2026-10-05 audit, A5 · A6 · A10).
 *
 *   A10  `/ask/?q=…` types a question in for the reader, cleaned and bounded, and never sends it.
 *   A5   a typed word must START a word of a name: "saka" is Bukayo Saka, not ambiguous with Wan-Bissaka.
 *   A6   "what is Moonshot?" (and nine other product questions) has a help chunk to retrieve.
 *
 * Run: cd app && npx tsx --test src/lib/ask/ask-entry-points.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { makeExecutor } from "./executor.mjs";
import { buildHelpCorpus } from "./help-source.mjs";
import { makeAskLoader, fixtureFetchText } from "./loader.mjs";
import { ASK_PREFILL_MAX, askHrefFor, askPrefillFromSearch, cleanAskPrefill } from "./prefill.mjs";
import { isApprovedLink } from "./contract.mjs";

/* ═══════════════════════════  A10 · /ask/?q= prefill  ═══════════════════════════ */

test("a ?q= link carries its question into the composer, decoded", () => {
  assert.equal(askPrefillFromSearch("?q=How%20has%20Bijan%20Robinson%20done%20lately%3F"), "How has Bijan Robinson done lately?");
  assert.equal(askPrefillFromSearch("?q=Saka+goals"), "Saka goals", "a + in a query string is a space");
});

test("no question, an empty one, or a different parameter prefills nothing", () => {
  for (const s of ["", "?", "?q=", "?q=%20%20", "?question=hi", null, undefined]) {
    assert.equal(askPrefillFromSearch(s), "", `${JSON.stringify(s)} must prefill nothing`);
  }
});

test("control characters and runs of whitespace are cleaned, and the length is capped at a word", () => {
  assert.equal(cleanAskPrefill("Who\u0000 leads\n\n the\tNFL?"), "Who leads the NFL?");
  const long = cleanAskPrefill("word ".repeat(200));
  assert.ok(long.length <= ASK_PREFILL_MAX, `capped at ${ASK_PREFILL_MAX}, got ${long.length}`);
  assert.ok(!long.endsWith(" ") && /word$/.test(long), "cut at a word boundary, never mid-word");
});

test("askHrefFor builds an approved Ask link, and round-trips through the reader's side", () => {
  const q = "Is Aaron Judge on today's board?";
  const href = askHrefFor(q);
  assert.match(href, /^\/ask\/\?q=/);
  assert.ok(isApprovedLink(href), `${href} must be an approved Ask link`);
  assert.equal(askPrefillFromSearch(href.slice(href.indexOf("?"))), q);
  assert.equal(askHrefFor("   "), "/ask/", "a blank question gives the bare route");
});

test("the Ask page prefills from the URL but never sends on load", () => {
  /* Read the component, because the property that matters — no answer is requested until the reader presses Ask —
     is about which function the effect calls. Each answer spends the model budget, and crawlers follow links. */
  const src = fs.readFileSync(path.join(process.cwd(), "src", "components", "ask", "ask-app.tsx"), "utf8");
  const effect = src.match(/askPrefillFromSearch\(window\.location\.search\)[\s\S]*?\}, \[\]\);/);
  assert.ok(effect, "the composer must read ?q= on mount");
  assert.match(effect[0], /setDraft\(q\)/, "it fills the composer");
  assert.doesNotMatch(effect[0], /\bsend\(/, "and it must not send the question by itself");
});

/* ═══════════════════════════  A5 · name matching  ═══════════════════════════ */

const ENTITIES = [
  { id: "epl-athlete-1", kind: "player", sport: "EPL", label: "Bukayo Saka", slug: "bukayo-saka", path: "/epl/players/bukayo-saka/" },
  { id: "epl-athlete-2", kind: "player", sport: "EPL", label: "Aaron Wan-Bissaka", slug: "aaron-wan-bissaka", path: "/epl/players/aaron-wan-bissaka/" },
  { id: "nfl-athlete-1", kind: "player", sport: "NFL", label: "Keenan Allen", slug: "keenan-allen", path: "/players/nfl/keenan-allen/" },
  { id: "nfl-athlete-2", kind: "player", sport: "NFL", label: "Josh Allen", slug: "josh-allen", path: "/players/nfl/josh-allen/" },
  { id: "nfl-athlete-3", kind: "player", sport: "NFL", label: "Jaxon Smith-Njigba", slug: "jaxon-smith-njigba", path: "/players/nfl/jaxon-smith-njigba/" },
];

const turn = () =>
  makeAskLoader(fixtureFetchText({
    "/data/ask/v1/entities.json": { schemaVersion: 1, entries: ENTITIES },
    "/data/ask/v1/help.json": buildHelpCorpus(),
  })).beginTurn();

const resolve = async (text, sport) => (await makeExecutor({ turn: turn() }).run({ name: "resolveEntity", arguments: { text, kind: "player", sport } })).data;

test("'Saka' resolves to Bukayo Saka, not an ambiguity with Wan-Bissaka", async () => {
  const r = await resolve("Saka", "EPL");
  assert.equal(r.resolution, "UNIQUE_SEARCH_MATCH");
  assert.equal(r.entity.id, "epl-athlete-1");
});

test("CONTROL: a shared surname is still a question, never a guess", async () => {
  const r = await resolve("Allen", "NFL");
  assert.equal(r.resolution, "AMBIGUOUS");
  assert.equal(r.candidates.length, 2);
});

test("a word may start a name word (typing in progress, hyphenated names) but not sit inside one", async () => {
  assert.equal((await resolve("Smith", "NFL")).entity?.id, "nfl-athlete-3");
  assert.equal((await resolve("njig", "NFL")).entity?.id, "nfl-athlete-3", "a prefix of 'njigba' still matches");
  assert.equal((await resolve("bissaka", "EPL")).entity?.id, "epl-athlete-2");
  assert.equal((await resolve("issaka", "EPL")).resolution, "NONE", "the inside of a word is not a match");
});

/* ═══════════════════════════  A6 · product help  ═══════════════════════════ */

const help = (query) => makeExecutor({ turn: turn() }).run({ name: "searchGameTimeHelp", arguments: { query, limit: 3 } });

for (const [question, id] of [
  ["What is Moonshot?", "moonshot"],
  ["How does Bank Builder work?", "bank-builder"],
  ["What is Homer Nukes?", "homer-nukes"],
  ["Who is Mr. Dub?", "mr-dub"],
  ["What is the Model Lab?", "model-lab"],
  ["What is Endzone Vault?", "endzone-vault"],
  ["What is Cage Chaos?", "cage-chaos"],
  ["Does Goal Rush have picks?", "goal-rush"],
  ["What is Bucket Blitz?", "bucket-blitz"],
  ["How do I send feedback?", "feedback"],
  ["Where did player trends go?", "retired-pages"],
]) {
  test(`help: "${question}" retrieves ${id} first`, async () => {
    const r = await help(question);
    assert.equal(r.status, "OK", `${r.error ?? ""}`);
    assert.equal(r.data.sections[0].id, id, `got ${r.data.sections.map((s) => s.id).join(", ")}`);
  });
}

test("product help states no record, hit rate or money figure beyond each page's own description", () => {
  /* Records change daily and come from the results tools. A number in help text would go stale silently. */
  const ids = ["bank-builder", "moonshot", "mr-dub", "homer-nukes", "endzone-vault", "cage-chaos", "goal-rush", "bucket-blitz"];
  for (const c of buildHelpCorpus().chunks.filter((x) => ids.includes(x.id))) {
    const numbers = (c.text.match(/\d[\d,.]*%?/g) ?? []).filter((n) => !["100", "10,000", "10", "five"].includes(n.replace(/K$/, "")));
    assert.deepEqual(numbers, [], `${c.id} carries a figure the page description does not: ${numbers.join(", ")}`);
    assert.match(c.text, /paper|in development|no .* picks publish/i, `${c.id} must say it is paper-only or not publishing`);
  }
});

test("a possessive is not part of the name: \"Josh Allen's\" is Josh Allen", async () => {
  /* Found by the golden eval (player-02): folding turns the apostrophe into a space and left a stray "s" word. */
  const r = await resolve("Josh Allen's", "NFL");
  assert.equal(r.resolution, "EXACT");
  assert.equal(r.entity.id, "nfl-athlete-2");
  assert.equal((await resolve("Saka’s", "EPL")).entity?.id, "epl-athlete-1", "a curly apostrophe too");
});
