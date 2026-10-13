/**
 * Fighter profiles render four categories, and a tendency never wears a strength's "+" or a weakness's "−"
 * (founder decision on PR #1059, 2026-10-10). Server renders of the shared lines and of the whole /ufc card.
 *
 * Run: npx tsx --test src/components/sports/ufc-profile-lines.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { default: UfcProfileLines, PROFILE_CATEGORY_LABEL, PROFILE_MARKER } = await import("./ufc-profile-lines.tsx");
const { default: UfcCard } = await import("./ufc-card.tsx");

const PRADO = {
  bouts: 6, record: { wins: 1, losses: 5 }, last5: [],
  summary: "1-4 in the last 5 tracked bouts. 1 of 1 win came by finish (100%); 5 of 6 tracked fights reached the judges (83%).",
  strengths: [],
  weaknesses: ["83% of tracked bouts are losses (5 of 6)"],
  tendencies: ["Often goes the distance — 5 of 6 tracked fights reached the judges"],
  unknowns: ["Only 1 tracked win — too few to say how wins come"],
};

/** Every rendered profile line, as [kind, text]. */
const linesOf = (html) => [...html.matchAll(/data-profile-line="(\w+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2].replace(/&#x27;/g, "'")]);

test("each category renders under its own label, with its own marker", () => {
  const html = renderToStaticMarkup(React.createElement(UfcProfileLines, { profile: PRADO, size: "full" }));
  for (const l of Object.values(PROFILE_CATEGORY_LABEL)) assert.ok(html.includes(l), `label ${l}`);
  assert.deepEqual(linesOf(html), [
    ["weakness", "− 83% of tracked bouts are losses (5 of 6)"],
    ["tendency", "· Often goes the distance — 5 of 6 tracked fights reached the judges"],
    ["unknown", "? Only 1 tracked win — too few to say how wins come"],
  ]);
});

test("a tendency never carries the strength or weakness marker, and is never green", () => {
  assert.notEqual(PROFILE_MARKER.tendency, PROFILE_MARKER.strength);
  assert.notEqual(PROFILE_MARKER.tendency, PROFILE_MARKER.weakness);
  const html = renderToStaticMarkup(React.createElement(UfcProfileLines, { profile: PRADO }));
  for (const [kind, text] of linesOf(html)) {
    if (kind !== "tendency") continue;
    assert.ok(!text.startsWith("+") && !text.startsWith("−"), text);
  }
  const tendencyDiv = /<div data-profile-line="tendency" style="([^"]*)"/.exec(html)?.[1] ?? "";
  assert.doesNotMatch(tendencyDiv, /vault-success/, "a tendency is not coloured as a strength");
});

test("an empty category renders no label (no 'Strengths' heading over nothing)", () => {
  const html = renderToStaticMarkup(React.createElement(UfcProfileLines, { profile: { summary: "x", strengths: [], weaknesses: [], tendencies: [], unknowns: ["Only 1 tracked bout"] } }));
  assert.ok(!html.includes(PROFILE_CATEGORY_LABEL.edges));
  assert.ok(!html.includes(PROFILE_CATEGORY_LABEL.tendencies));
  assert.ok(html.includes(PROFILE_CATEGORY_LABEL.unknowns));
});

test("the /ufc card renders a profile with no strengths at all, and its tendencies without + or −", () => {
  const fighter = (name, profile) => ({ athleteId: name, name, record: null, photoUrl: null, priorBoutsInCorpus: profile.bouts, profile });
  const card = {
    event: { name: "Fixture Night", startUtc: "2026-10-10T21:00Z" }, model: { publishes: [] },
    bouts: [{
      boutId: "b1", weightClass: "Lightweight", scheduledRounds: 3, startUtc: "2026-10-10T21:00Z", titleFight: false,
      red: fighter("Francisco Prado", PRADO), blue: fighter("Ismael Bonfim", { ...PRADO, tendencies: [], weaknesses: [] }),
      prediction: null, unmodelledReason: "fixture",
    }],
  };
  const html = renderToStaticMarkup(React.createElement(UfcCard, { card }));
  const lines = linesOf(html);
  assert.ok(lines.some(([k]) => k === "tendency"), "the profile block renders even with no strengths (it used to be gated on strengths)");
  for (const [kind, text] of lines) if (kind === "tendency") assert.match(text, /^· /);
  assert.ok(!html.includes("+ Often goes the distance") && !html.includes("− Often goes the distance"));
});

test("SOURCE PIN · both renderers draw profile lines through the shared component, never their own +/− maps", () => {
  for (const f of ["src/components/sports/ufc-card.tsx", "src/app/ufc/bout/[boutId]/page.tsx"]) {
    const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
    assert.match(src, /<UfcProfileLines profile=\{/, `${f} renders the shared lines`);
    assert.doesNotMatch(src, /\.(strengths|weaknesses|tendencies|unknowns)\.map\(/, `${f} maps a profile category itself`);
  }
});
