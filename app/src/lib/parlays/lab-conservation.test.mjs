/**
 * PARLAY LAB CONSERVATION (Program 201 · Release I).
 *
 * The frozen population must reconcile: every card a ladder PUBLISHED is accounted for in the
 * settlement receipts — settled, pending inside the settlement window, or NAMED in the quarantine
 * below. A card that simply vanishes is how a record flatters itself without anyone lying (the
 * published hit rate quietly computes over only the cards that happened to be settleable).
 *
 * ── The pre-merge quarantine, adjudicated 2026-08-24 ────────────────────────────────────────────
 * The UFC ladder's first day (2026-08-18) published three cards STAMPED WITH THE BUILD DATE while
 * their bouts belonged to the 2026-08-22/23 fight card — the same build-day-vs-slate-day class the
 * repo has hit before. The settler's date confinement (correct, load-bearing) can therefore never
 * grade them under the date they carry: UFC results dated 2026-08-18 do not exist. They are
 * quarantined BY NAME here — accounted, never graded, never silently entering the record — and the
 * ladder builders have since keyed cards to the slate day, so the class cannot recur forward.
 *
 * Run: npx tsx --test src/lib/parlays/lab-conservation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const DATA = path.join(app, "public", "data", "parlays");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const LANES = { mlb: "risk-ladder", epl: "risk-ladder-epl", ufc: "risk-ladder-ufc", nfl: "risk-ladder-nfl" };

/** Adjudicated pre-merge orphans: accounted here, excluded from the record, never regrown. */
const QUARANTINED_PRE_MERGE = new Set([
  "ufc-medium-2026-08-18",
  "ufc-high-2026-08-18",
  "ufc-longshot-2026-08-18",
]);

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etToday = () => ET_DAY.format(new Date());

test("conservation: every published card is settled, pending in-window, or a named quarantine", () => {
  const today = etToday();
  const failures = [];
  for (const [lane, dir] of Object.entries(LANES)) {
    const files = fs.existsSync(path.join(DATA, dir))
      ? fs.readdirSync(path.join(DATA, dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      : [];
    for (const f of files) {
      const doc = readJson(path.join(DATA, dir, f));
      const date = doc?.date ?? f.replace(".json", "");
      const cards = (doc?.cards ?? []).map((c) => c.slipId).filter(Boolean);
      if (cards.length === 0) continue;                     // an honest empty/refused day owes nothing
      if (date >= today) continue;                          // settlement window: ET-yesterday settles overnight
      /*
       * P206: the nightly settle runs at ~04:12 ET the NEXT morning, so between ET midnight and
       * the nightly, yesterday's cards are PENDING-IN-WINDOW by cadence — the first gate run in
       * that gap failed every night's cards as "unaccounted" — and the first fix hit the Intl
       * midnight-hour-24 trap (hour12:false renders 00:xx as "24"; hourCycle h23 is the fix,
       * relearned from this repo's own Aug-1 incident). After 06:00 ET (nightly + slack) a
       * missing receipt for yesterday is a real conservation failure again.
       */
      const etHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date()));
      const etYesterday = ET_DAY.format(new Date(Date.now() - 86_400_000));
      if (date === etYesterday && etHour < 6) continue;
      const receipt = readJson(path.join(DATA, "lab-settled", `${date}.json`));
      const accounted = new Set((receipt?.cards ?? []).map((c) => c.slipId));
      for (const slip of cards) {
        if (accounted.has(slip)) continue;
        if (QUARANTINED_PRE_MERGE.has(slip)) continue;
        failures.push(`${lane} ${date}: ${slip} published and unaccounted — not settled, not pending in a receipt, not quarantined`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("receipts never invent a card: every receipt slipId traces to a published ladder card", () => {
  const failures = [];
  const ladderSlips = new Set();
  for (const dir of Object.values(LANES)) {
    const root = path.join(DATA, dir);
    if (!fs.existsSync(root)) continue;
    for (const f of fs.readdirSync(root).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
      for (const c of readJson(path.join(root, f))?.cards ?? []) if (c.slipId) ladderSlips.add(c.slipId);
    }
  }
  for (const f of fs.readdirSync(path.join(DATA, "lab-settled")).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const c of readJson(path.join(DATA, "lab-settled", f))?.cards ?? []) {
      /* Multi-sport cards are assembled by the multi builder, not a ladder dir — their slipIds
         carry the multi prefix and are owned by the tier grid's own artifacts. */
      if (String(c.slipId ?? "").startsWith("multi")) continue;
      if (c.slipId && !ladderSlips.has(c.slipId)) failures.push(`${f}: receipt names ${c.slipId}, which no ladder published`);
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("the quarantine never regrows and never enters the record", () => {
  // Named, dated, closed: exactly these three, and no receipt may ever carry them.
  assert.equal(QUARANTINED_PRE_MERGE.size, 3);
  for (const f of fs.readdirSync(path.join(DATA, "lab-settled")).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const c of readJson(path.join(DATA, "lab-settled", f))?.cards ?? []) {
      assert.ok(!QUARANTINED_PRE_MERGE.has(c.slipId), `${f}: a quarantined card entered the record (${c.slipId})`);
    }
  }
});

test("forward guard: the build-day-vs-slate-day class cannot recur — ladders stamp the slate day", () => {
  // The UFC builder derives the card date from the EVENT it serves; the EPL/NFL builders walk to
  // the first servable slate day. Structural words, asserted where they live.
  const ufc = fs.readFileSync(path.join(app, "scripts/ufc/build-ufc-ladder.mjs"), "utf8");
  const epl = fs.readFileSync(path.join(app, "scripts/epl/build-epl-ladder.mjs"), "utf8");
  const nfl = fs.readFileSync(path.join(app, "scripts/nfl/build-nfl-ladder.mjs"), "utf8");
  assert.match(epl, /servable/, "EPL keys the ladder to the first servable slate day");
  assert.match(nfl, /servable/, "NFL keys the ladder to the first servable slate day");
  assert.ok(/slateDate|eventDate|event\.date|card date/i.test(ufc), "UFC keys the ladder to its event's own date");
});
