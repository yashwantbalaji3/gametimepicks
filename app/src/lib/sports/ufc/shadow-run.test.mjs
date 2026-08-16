/**
 * UFC shadow-run guards (Program 167 · Release F): the per-bout ladder, card certainty from
 * lineage, and the REAL UFC 330 card through the real committed captures.
 * Run: npx tsx --test src/lib/sports/ufc/shadow-run.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runUfcShadow, boutCardCertainty } from "./shadow-run.mjs";
import { fitUfcV1 } from "./model-v1.mjs";
import { validateShadowRun } from "../research/shadow-contract.mjs";

const corpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/ufc/corpus-v1.json"), "utf8"));
const FIT = fitUfcV1(corpus.rows);

const CAP = (generatedAt, bouts) => ({ generatedAt, events: [{ providerEventId: "600059185", name: "UFC 330", dateUtc: "2026-08-15T21:00Z" }], bouts });
const BOUT = { providerBoutId: "b1", eventProviderId: "600059185", red: "Fighter A", blue: "Fighter B", redProviderId: null, blueProviderId: null, weightClass: "Lightweight", dateUtc: "2026-08-15T21:30Z", statusRaw: "STATUS_SCHEDULED" };
const NOW = "2026-08-14T12:00:00Z";

test("post-start refuses; unparseable start refuses", () => {
  const out = runUfcShadow({ bout: { ...BOUT, dateUtc: "2026-08-14T11:00Z" }, nowIso: NOW, fit: FIT, prevCapture: CAP("2026-08-13T14:00Z", [BOUT]), nextCapture: CAP("2026-08-14T02:00Z", [BOUT]) });
  assert.equal(out.state, "REFUSED_POST_START");
});

test("card certainty: replacement between captures ABSTAINS with the lineage class named", () => {
  const prev = CAP("2026-08-13T14:00Z", [BOUT]);
  const next = CAP("2026-08-14T02:00Z", [{ ...BOUT, blue: "Fighter Z" }]);
  const out = runUfcShadow({ bout: { ...BOUT, blue: "Fighter Z" }, nowIso: NOW, fit: FIT, prevCapture: prev, nextCapture: next });
  assert.equal(out.state, "ABSTAIN");
  assert.equal(out.rule, "CARD_UNCERTAIN");
  assert.match(out.reason, /REPLACEMENT/);
  assert.match(out.reason, /weigh-in/i, "the missing weigh-in source is stated, never papered over");
});

test("card certainty: stale newest capture, missing bout, and single-observation bouts all abstain", () => {
  const stale = boutCardCertainty({ providerBoutId: "b1", prevCapture: CAP("2026-08-10T02:00Z", [BOUT]), nextCapture: CAP("2026-08-10T14:00Z", [BOUT]), nowIso: NOW });
  assert.equal(stale.certain, false);
  assert.match(stale.reason, /card-certainty bound/);
  const missing = boutCardCertainty({ providerBoutId: "bX", prevCapture: CAP("2026-08-13T14:00Z", [BOUT]), nextCapture: CAP("2026-08-14T02:00Z", [BOUT]), nowIso: NOW });
  assert.equal(missing.certain, false);
  const added = boutCardCertainty({ providerBoutId: "b2", prevCapture: CAP("2026-08-13T14:00Z", [BOUT]), nextCapture: CAP("2026-08-14T02:00Z", [BOUT, { ...BOUT, providerBoutId: "b2" }]), nowIso: NOW });
  assert.equal(added.certain, false);
  assert.match(added.reason, /one observation is not stability/);
});

test("stable card + unknown fighters → model IDENTITY abstention (never a guess)", () => {
  const prev = CAP("2026-08-13T14:00Z", [BOUT]);
  const next = CAP("2026-08-14T02:00Z", [BOUT]);
  const out = runUfcShadow({ bout: BOUT, nowIso: NOW, fit: FIT, prevCapture: prev, nextCapture: next });
  assert.equal(out.state, "ABSTAIN");
  assert.equal(out.rule, "IDENTITY");
});

test("covered pairing without odds → READY_EXCEPT_ODDS with zero probabilities emitted", () => {
  // pick two well-covered corpus fighters and fabricate a stable current bout between them
  const counts = new Map();
  for (const r of corpus.rows) { if (r.outcome === "R" || r.outcome === "B") { counts.set(r.red.id, (counts.get(r.red.id) ?? 0) + 1); counts.set(r.blue.id, (counts.get(r.blue.id) ?? 0) + 1); } }
  const busy = [...counts.entries()].filter(([, n]) => n >= 6).map(([id]) => id);
  const recent = corpus.rows.filter((r) => r.dateUtc >= "2026-01-01").reverse();
  const pick = (exclude) => {
    for (const r of recent) { if (busy.includes(r.red.id) && r.red.id !== exclude) return r.red; if (busy.includes(r.blue.id) && r.blue.id !== exclude) return r.blue; }
    return null;
  };
  const f1 = pick(null);
  const f2 = pick(f1.id);
  assert.ok(f1 && f2, "two busy recent fighters exist in the corpus");
  const bout = { providerBoutId: "b9", eventProviderId: "600059185", red: f1.name, blue: f2.name, redProviderId: f1.id, blueProviderId: f2.id, weightClass: "Lightweight", dateUtc: "2026-08-15T21:30Z", statusRaw: "STATUS_SCHEDULED" };
  const out = runUfcShadow({ bout, nowIso: NOW, fit: FIT, prevCapture: CAP("2026-08-13T14:00Z", [bout]), nextCapture: CAP("2026-08-14T02:00Z", [bout]) });
  assert.equal(out.state, "READY_EXCEPT_ODDS", out.reason);
  assert.ok(!JSON.stringify(out).includes('"probs"'), "no probabilities on the odds-refusal rung");

  // and WITH a fresh authorized snapshot → CURRENT_PRE_EVENT, validator-clean, model≠market
  const odds = { capturedAt: "2026-08-14T10:00:00Z", rows: [{ providerBoutId: "b9", bookmaker: "bookx", marketType: "h2h", sourceAsOf: "2026-08-14T09:55:00Z", outcomes: [{ name: f1.name, price: -150 }, { name: f2.name, price: 130 }] }] };
  const current = runUfcShadow({ bout, nowIso: NOW, fit: FIT, prevCapture: CAP("2026-08-13T14:00Z", [bout]), nextCapture: CAP("2026-08-14T02:00Z", [bout]), oddsSnapshot: odds });
  assert.equal(current.state, "CURRENT_PRE_EVENT", current.reason);
  assert.deepEqual(validateShadowRun(current.artifact).errors, []);
  assert.equal(current.artifact.publicActivation, "OFF");
  assert.ok(current.artifact.market.bookmakers[0].impliedSum > 1, "vig visible");
});

test("REAL ARTIFACTS · UFC 330's twelve bouts run the real ladder from the newest two committed captures", () => {
  const dir = path.join(process.cwd(), "public/data/ufc/schedule");
  // P195: this regression is ABOUT UFC 330, so it selects the newest two captures THAT CONTAIN IT
  // rather than the newest two on disk. Once the schedule rolled to the next event the newest capture
  // stopped carrying 330 at all — the same trap the Bank Builder regressions hit, where a test about
  // a specific past state was reading whatever the product happens to be doing today.
  const EVENT = "600059185";
  const all = fs.readdirSync(dir).filter((f) => f.startsWith("capture-")).sort();
  const files = all.filter((f) => {
    try { return (JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).bouts ?? []).some((b) => b.eventProviderId === EVENT); }
    catch { return false; }
  });
  assert.ok(files.length >= 2, "two committed captures carry UFC 330");
  const prev = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 2]), "utf8"));
  const next = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8"));
  const bouts330 = (next.bouts ?? []).filter((b) => b.eventProviderId === EVENT);
  assert.equal(bouts330.length, 12, "UFC 330 carries twelve bouts in the newest capture");
  const nowIso = next.generatedAt; // run AT the capture instant: fresh by construction, pre-event
  const states = {};
  for (const bout of bouts330) {
    const out = runUfcShadow({ bout, nowIso, fit: FIT, prevCapture: prev, nextCapture: next });
    states[out.state] = (states[out.state] ?? 0) + 1;
    assert.ok(["ABSTAIN", "READY_EXCEPT_ODDS"].includes(out.state), `${bout.red} vs ${bout.blue}: ${out.state} — CURRENT is impossible without an authorized odds snapshot, and nothing may crash`);
    assert.ok(!JSON.stringify(out).includes('"probs"'), "no probabilities leak pre-authorization");
  }
  assert.ok((states.READY_EXCEPT_ODDS ?? 0) + (states.ABSTAIN ?? 0) === 12);
});
