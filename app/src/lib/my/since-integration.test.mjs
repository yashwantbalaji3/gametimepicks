/**
 * SINCE YOUR LAST VISIT — integration guards (v1.1.4 · §26–§29, §32, §43–§45). Source scans strip comments first
 * (these files describe what they must not do); every negative scan has a positive control.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const code = (rel) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGE = "src/components/my/my-gametime.tsx";
const OBSERVATION = ["src/lib/my/observation-schema.mjs", "src/lib/my/observation-browser.mjs", "src/lib/my/observation-store.ts", "src/lib/my/since.mjs", "src/lib/my/saved-settlements.mjs"];
const NETWORK = /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|\/api\//;

test("SI1 · ⚠ the observation owner and the delta engine make NO network call and send nothing anywhere", () => {
  for (const rel of OBSERVATION) assert.equal(NETWORK.test(code(rel)), false, `${rel} touches the network`);
  assert.equal(NETWORK.test('await fetch("/x")'), true, "positive control");
});

test("SI2 · ⚠ Since adds ZERO Live requests: still exactly one Live hook, in the conditionally mounted child, and Since reads its slate", () => {
  const src = code(PAGE);
  assert.equal((src.match(/useLiveSlate\(/g) || []).length, 1);
  assert.equal((src.match(/<LiveNowModule/g) || []).length, 1);
  // [\s\S]*? not [^>]*: the props contain an arrow function, whose ">" ended the first version of this probe early.
  const mount = /\{followsMlb \? \(\s*<LiveNowModule[\s\S]*?onSlate=\{onSlate\} \/>/;
  assert.match(src, mount, "Since receives the slate from the one mounted Live module");
  assert.equal(mount.test('{followsMlb ? (<LiveNowModule followed={followed} />'), false, "positive control: a mount without onSlate fails");
  assert.match(src, /envelopesByGamePk: followsMlb && live\.settled \? live\.byGamePk : null/, "no MLB follow ⇒ no envelopes are read");
  for (const rel of OBSERVATION) assert.equal(/useLiveSlate|liveUrl|use-live-/.test(code(rel)), false, `${rel} reaches for Live`);
});

test("SI3 · ⚠ the player file is still fetched ONLY by the players module; Since adds no player request", () => {
  const src = code(PAGE);
  assert.equal((src.match(/fetch\(PLAYERS_URL\)/g) || []).length, 1);
  const players = src.slice(src.indexOf("function PlayersModule"), src.indexOf("/* ─", src.indexOf("function PlayersModule")) > 0 ? src.indexOf("function SavedModule") : undefined);
  assert.match(players, /fetch\(PLAYERS_URL\)/, "inside PlayersModule");
  assert.equal(/nfl-players|PLAYERS_URL/.test(code("src/lib/my/since.mjs")), false);
});

test("SI4 · ⚠ the settlement projection is fetched only when a forecast is saved, from a LITERAL path, once", () => {
  const src = code(PAGE);
  assert.match(src, /const SETTLEMENTS_URL = "\/data\/my\/saved-settlements\.json"/, "literal (keeps the /data sweep from pruning it)");
  assert.equal((src.match(/fetch\(SETTLEMENTS_URL\)/g) || []).length, 1);
  assert.match(src, /useSavedSettlements\(saved\.ready && saved\.items\.length > 0\)/, "enabled only by a saved forecast");
  assert.match(src, /if \(!enabled \|\| started\.current\) return;/, "and at most once per page");
  // ⚠ Browser QA: an effect that depended on its own status discarded its own fetch and stayed LOADING forever.
  const hook = src.slice(src.indexOf("function useSavedSettlements"), src.indexOf("function SinceCard"));
  assert.match(hook, /\}, \[enabled\]\);/, "the fetch effect depends on `enabled` only");
  assert.match(src, /const ownersLoading = pendingOwner\(owners\) !== null;/, "delta readiness does not go through the visibility gate");
  assert.match(read("src/app/data/my/saved-settlements.json/route.ts"), /export const dynamic = "force-static"/);
});

test("SI5 · ⚠ writes: only the adapter writes, only its own key; the hook and engine never write", () => {
  const writers = OBSERVATION.filter((rel) => /\.setItem\(/.test(code(rel)));
  assert.deepEqual(writers, ["src/lib/my/observation-browser.mjs"]);
  const calls = code("src/lib/my/observation-browser.mjs").match(/\w+\.setItem\([^,]+,/g) || [];
  assert.deepEqual(calls, ["storage.setItem(OBSERVATION_STORAGE_KEY,"]);
  assert.equal(/\.setItem\(|removeItem\(|\.clear\(\)/.test(code(PAGE)), false, "the page writes nothing directly");
  assert.equal(/removeItem\(|\.clear\(\)/.test(OBSERVATION.map(code).join("\n")), false, "nothing is ever deleted or cleared");
});

test("SI6 · ⚠ the observation owner cannot reach sports truth: it imports no forecast, settlement-writer, or model module", () => {
  for (const rel of OBSERVATION) {
    const imports = [...read(rel).matchAll(/^import[^;]*from\s+"([^"]+)";/gm)].map((m) => m[1]);
    for (const i of imports) assert.equal(/forecast|settle|grade|model|prediction|sim/i.test(i), false, `${rel} imports ${i}`);
  }
  // The page resolves saved settlement with the Saved owner's OWN function — no second rule.
  assert.match(code(PAGE), /resolveResult\(s, settlements\.ledgers as any, nowIso\)\.state === "FINAL"/);
});

test("SI7 · the commit is gated, and the gate is the tested pure function", () => {
  const src = code(PAGE);
  assert.match(src, /const gate = commitGate\(\{/);
  assert.match(src, /if \(gate\.allowed\) commit\(JSON\.parse\(freshKey\)\);/);
  assert.match(src, /visible: observation\.visible/);
  assert.match(code("src/lib/my/observation-store.ts"), /document\.visibilityState === "visible"/);
  assert.equal(/beforeunload|pagehide|unload/.test(src + code("src/lib/my/observation-store.ts")), false, "browser close is never authoritative");
});

test("SI8 · the Since module is first in the personalized view, and state never enters a URL", () => {
  const src = code(PAGE);
  const view = src.slice(src.lastIndexOf("return (\n    <div>"));
  assert.ok(view.indexOf("<SinceModule") > -1 && view.indexOf("<SinceModule") < view.indexOf("<LiveNowModule"), "Since precedes Live Now");
  assert.equal(/router\.(push|replace)|searchParams|location\.search|\?since=|\?prior=/.test(src), false);
});

test("SI9 · accessibility: list semantics for updates, no aria-live announcements, no auto-scroll", () => {
  const src = code(PAGE);
  const since = src.slice(src.indexOf("function SinceModule"), src.indexOf("export default function MyGameTime"));
  assert.match(since, /<ul style=\{grid\}>/);
  assert.match(since, /<li key=\{d\.key\}/);
  assert.equal(/aria-live|role="alert"|role="status"|scrollIntoView|\.focus\(\)/.test(since), false);
});

test("SI10 · ⚠ 'You're up to date' is rendered only when nothing was left unchecked", () => {
  const src = code(PAGE);
  assert.match(src, /content = gap \? <Quiet>Nothing new could be confirmed — \{gap\}\.<\/Quiet> : <Quiet>You&apos;re up to date\.<\/Quiet>;/);
  assert.equal((read(PAGE).match(/You&apos;re up to date/g) || []).length, 1, "exactly one place can say it");
  assert.match(src, /failed: !loading && !!unavailable && !has/, "an empty slate is not a Live failure; a refusal with no slate is");
});
