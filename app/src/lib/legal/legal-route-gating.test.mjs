/**
 * THE LEGAL GATE, CHECKED AGAINST WHAT THE PUBLIC BUILD ACTUALLY SERVES (P290).
 *
 * The gate was inverted and nothing noticed. `REQUIRED_SECTIONS` governs three sections;
 * `LEGAL_ROUTES` (which the prune sweep derives its withhold-list from) lists two. So
 * `/responsible-use` shipped publicly while its status is `LEGAL_COUNSEL_REQUIRED` — the strongest
 * status in the vocabulary — and /terms and /privacy, merely `DRAFT_FOR_REVIEW`, were withheld.
 *
 * Every existing check passed, because each one asked a question that was true:
 *   · `canPublishLegal` correctly said all three sections are unpublishable — but it is consulted
 *     only for sections someone listed in LEGAL_ROUTES.
 *   · the prune sweep correctly removed everything it was told about.
 *   · the manifest test correctly validated the manifest's own shape.
 * Nobody compared the manifest's verdict to the bytes the export serves. That is this file.
 *
 * Run in the post-build phase: it reads out/, and a missing export must FAIL rather than skip —
 * "I could not look" has been mistaken for "I looked and it was fine" in this repo before.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  LEGAL_CONTENT_MANIFEST,
  REQUIRED_SECTIONS,
  PRE_APPROVAL_DISPOSITION,
  DISPOSITIONS,
  CONTRACTUAL_PHRASES,
  canPublishLegal,
} from "./content-manifest.mjs";
import { LEGAL_ROUTES } from "./texts.mjs";

const APP = process.cwd();
const OUT = path.join(APP, "out");

/** The route a section publishes at — the declared one, or the conventional /<id>. */
const routeFor = (id) => LEGAL_ROUTES[id] ?? `/${id}`;
const servedPublicly = (route) => fs.existsSync(path.join(OUT, route.replace(/^\//, ""), "index.html"));

/** Rendered <main> text, scripts stripped and entities decoded — never the RSC payload or the nav. */
function visibleText(route) {
  const f = path.join(OUT, route.replace(/^\//, ""), "index.html");
  const html = fs.readFileSync(f, "utf8");
  const i = html.indexOf("<main");
  const j = html.indexOf("</main>");
  const body = (i >= 0 && j > i ? html.slice(i, j) : html).replace(/<script\b[\s\S]*?<\/script>/g, " ");
  return body
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&(?:apos|#39);/g, "'")
    .replace(/&(?:nbsp|#160);/g, " ")
    .replace(/\s+/g, " ");
}

test("the export exists — this phase must not pass by being unable to look", () => {
  assert.ok(fs.existsSync(OUT), "out/ is missing; run the build before the post-build phase");
});

test("every governed section declares a pre-approval disposition from the closed set", () => {
  for (const id of REQUIRED_SECTIONS) {
    const d = PRE_APPROVAL_DISPOSITION[id];
    assert.ok(d, `${id}: governed by REQUIRED_SECTIONS with no declared disposition — the omission that inverted the gate`);
    assert.ok(DISPOSITIONS.includes(d), `${id}: disposition ${d} is outside the closed set`);
  }
  for (const id of Object.keys(PRE_APPROVAL_DISPOSITION)) {
    assert.ok(REQUIRED_SECTIONS.includes(id), `${id}: declared a disposition but is not a governed section`);
  }
});

test("an unapproved WITHHOLD_UNTIL_APPROVED section is not reachable in the public export", () => {
  let checked = 0;
  for (const id of REQUIRED_SECTIONS) {
    if (PRE_APPROVAL_DISPOSITION[id] !== "WITHHOLD_UNTIL_APPROVED") continue;
    const { allowed, reasons } = canPublishLegal(LEGAL_CONTENT_MANIFEST, id);
    if (allowed) continue; // approved: it is supposed to be there
    checked += 1;
    assert.equal(
      servedPublicly(routeFor(id)), false,
      `${routeFor(id)} is served publicly while unapproved (${reasons[0]}) — unapproved contractual text must not be reachable`,
    );
  }
  assert.ok(checked > 0, "no unapproved withheld section to check — this guard is measuring nothing");
});

test("a PUBLISH_AS_PROTECTIVE page is served, and makes no contractual claim", () => {
  let checked = 0;
  for (const id of REQUIRED_SECTIONS) {
    if (PRE_APPROVAL_DISPOSITION[id] !== "PUBLISH_AS_PROTECTIVE") continue;
    checked += 1;
    const route = routeFor(id);
    assert.ok(
      servedPublicly(route),
      `${route} is declared PUBLISH_AS_PROTECTIVE but is not in the export — its protections (age guidance, the helpline) are exactly what a reader needs before approval`,
    );
    const text = visibleText(route).toLowerCase();
    for (const phrase of CONTRACTUAL_PHRASES) {
      assert.ok(
        !text.includes(phrase),
        `${route} contains "${phrase}" — it has become a contract, so it must move to WITHHOLD_UNTIL_APPROVED rather than publish unreviewed`,
      );
    }
  }
  assert.ok(checked > 0, "no protective section declared — this guard is measuring nothing");
});

test("the protective page still carries the protections that justify publishing it early", () => {
  /*
   * The whole argument for shipping this page unreviewed is that its presence protects the reader. If
   * the helpline or the age guidance were ever edited out, that argument evaporates and the page
   * would be publishing unreviewed legal-adjacent text for no benefit.
   */
  const protective = REQUIRED_SECTIONS.filter((id) => PRE_APPROVAL_DISPOSITION[id] === "PUBLISH_AS_PROTECTIVE");
  for (const id of protective) {
    const text = visibleText(routeFor(id));
    assert.match(text, /1-800-GAMBLER/i, `${id}: the problem-gambling helpline is the load-bearing protection here`);
    assert.match(text, /ncpgambling\.org/i, `${id}: the helpline's organisation must be reachable too`);
    assert.match(text, /\b18\b/, `${id}: the age guidance must survive`);
    assert.match(text, /not a recommendation to wager|not betting advice/i, `${id}: the not-advice disclaimer must survive`);
  }
});

test("no governed section is reachable at a route the manifest does not govern", () => {
  /*
   * The inversion's root cause in one assertion: a legal page existing in src/app that no registry
   * knows about. Any route whose name matches a governed section must be the one the registry checks.
   */
  for (const id of REQUIRED_SECTIONS) {
    const conventional = `/${id}`;
    const declared = routeFor(id);
    if (conventional === declared) continue;
    assert.equal(
      servedPublicly(conventional), false,
      `${conventional} is served but ${id} is governed at ${declared} — two routes for one section means one of them is ungated`,
    );
  }
});
