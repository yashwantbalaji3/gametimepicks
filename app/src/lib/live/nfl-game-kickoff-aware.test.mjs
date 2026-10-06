/**
 * Pregame mode until rebuild (Live & Today, MNF 2026-10-05). The static NFL game page decided "started" at BUILD
 * time, so a page built before kickoff framed a live game as upcoming until something rebuilt it. The kickoff
 * slots re-ask on the reader's clock; these tests pin the rule and its wiring.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { kickedOff, KickoffSlot } = await import("../../components/live/kickoff-aware.tsx");

const strip = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const page = strip(fs.readFileSync(path.join(process.cwd(), "src/app/nfl/game/[eventId]/page.tsx"), "utf8"));

const KICK = "2026-10-06T00:15Z";
const at = (iso) => Date.parse(iso);

test("🔴 the reader's clock advances 'started' at kickoff", () => {
  assert.equal(kickedOff(KICK, false, at("2026-10-06T00:14:59Z")), false);
  assert.equal(kickedOff(KICK, false, at("2026-10-06T00:15:00Z")), true);
});

test("🔴 it never rewinds: a build that already said started stays started, whatever the reader's clock says", () => {
  assert.equal(kickedOff(KICK, true, at("2026-10-05T12:00:00Z")), true);
});

test("an unreadable kickoff never advances the stamp", () => {
  assert.equal(kickedOff(null, false, Date.now()), false);
  assert.equal(kickedOff("not a date", false, Date.now()), false);
});

test("the first render is the build's answer, so server and client markup agree", () => {
  const before = (built) => renderToStaticMarkup(React.createElement(KickoffSlot, { kickoffUtc: "2000-01-01T00:00Z", startedAtBuild: built, when: "before" }, "PRE"));
  const after = (built) => renderToStaticMarkup(React.createElement(KickoffSlot, { kickoffUtc: "2000-01-01T00:00Z", startedAtBuild: built, when: "after" }, "LIVE"));
  /* Kickoff is long past, but no effect runs on the server: the build's answer decides the markup. */
  assert.equal(before(false), "PRE");
  assert.equal(after(false), "");
  assert.equal(before(true), "");
  assert.equal(after(true), "LIVE");
});

test("🔴 the page wires every build-time 'started' surface through a kickoff slot", () => {
  assert.match(page, /<KickoffSlot kickoffUtc=\{f\.kickoffUtc\} startedAtBuild=\{started\} when="after">\{" · started"\}<\/KickoffSlot>/, "header suffix");
  assert.match(page, /<KickoffSlot kickoffUtc=\{f\.kickoffUtc\} startedAtBuild=\{started\} when="after">\s*<p[^>]*>\s*This game has kicked off\./, "kicked-off note");
  assert.match(page, /lifecycle === "UPCOMING" \? <><KickoffSlot[^>]*when="before">UPCOMING<\/KickoffSlot><KickoffSlot[^>]*when="after">STARTED<\/KickoffSlot><\/> : lifecycle/, "provenance state");
  assert.doesNotMatch(page, /\{started \? " · started" : ""\}/, "no build-time-only suffix remains");
  assert.doesNotMatch(page, /\{liveTop \? null : livePanel\}/, "no build-time-only panel slot remains");
});
