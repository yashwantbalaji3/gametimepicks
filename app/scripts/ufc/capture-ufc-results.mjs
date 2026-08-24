/**
 * UFC current results capture — ESPN MMA public scoreboard → results artifact
 * (Program 162 · Release J). Registered source: espn_scoreboard, the same endpoint and id space
 * the forward event/bout capture uses, so the downstream join is bout-id-based.
 *
 * THE HONEST EMPTY STATE: with no completed bout in the trailing window the artifact is state
 * NO_RESULTS_YET with fresh stamps and zero completed rows. A source failure writes NOTHING and
 * exits 0 with SOURCE_STALE on stdout — last-known-good stands. One window request only (the
 * rate-limit lesson: singles are fine, bursts are not).
 *
 * Rows keep RAW provider statuses and the competitor-level winner flags exactly as the corpus
 * proved them; grading happens downstream through the winner-only settlement contract, which
 * quarantines draw/no-contest ambiguity rather than guessing.
 *
 * Run: node scripts/ufc/capture-ufc-results.mjs --now <ISO> [--days 9]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "public", "data", "ufc", "results");

const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const DAYS = Math.min(31, Math.max(1, Number(arg("--days", "9"))));

const fmt = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
const from = fmt(new Date(Date.parse(NOW) - DAYS * 86400_000));
const to = fmt(new Date(Date.parse(NOW)));
/*
 * P196 · Release C: `limit=1000` is load-bearing. Without it ESPN's default page size truncated
 * the 08-22 event to 7 of 13 bouts — the ENTIRE MAIN CARD, headliner included, silently absent
 * while every returned row read STATUS_FINAL. A capture that looks complete and is not is the
 * worst kind; the history fetcher always carried the parameter and this one had to learn it.
 */
const url = `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${from}-${to}&limit=1000`;

let data = null;
try {
  const res = await fetch(url);
  const parsed = JSON.parse(await res.text());
  if (!Array.isArray(parsed.events)) throw new Error("no events array");
  data = parsed;
} catch (err) {
  console.log(`SOURCE_STALE: mma scoreboard unavailable (${String(err?.message ?? err).slice(0, 80)}) — last-known-good artifact stands, nothing written`);
  process.exit(0);
}

const rows = [];
for (const e of data.events ?? []) {
  for (const c of e.competitions ?? []) {
    const side = (i) => {
      const x = c.competitors?.[i];
      return x ? {
        name: x.athlete?.displayName ?? null,
        providerId: x.athlete?.id != null ? String(x.athlete.id) : (x.id != null ? String(x.id) : null),
        winner: x.winner === true,
      } : null;
    };
    const red = side(0), blue = side(1);
    if (!c.id || !red?.name || !blue?.name) continue; // unnamed placeholder bouts classify nothing
    rows.push({
      providerBoutId: String(c.id),
      providerCardId: String(e.id ?? ""),
      cardName: e.name ?? null,
      dateUtc: c.date ?? e.date ?? null,
      /*
       * P196 · Release C: the EVENT's own date, kept beside the bout's. A main-card bout starts
       * after midnight UTC, so day(dateUtc) is the day AFTER the card it belongs to — which made
       * every main-card key miss the snapshot's slate-dated boutId and left the 08-22 headliner
       * ungradeable while the prelims graded fine. Downstream keys on this, falling back to the
       * bout date only for old captures that predate the field.
       */
      eventDateUtc: e.date ?? null,
      statusRaw: c.status?.type?.name ?? e.status?.type?.name ?? null,
      weightClass: c.type?.text ?? null,
      red: { name: red.name, providerId: red.providerId },
      blue: { name: blue.name, providerId: blue.providerId },
      redWinner: red.winner,
      blueWinner: blue.winner,
      capturedAt: NOW,
    });
  }
}

const completed = rows.filter((r) => /^STATUS_FINAL/.test(r.statusRaw ?? ""));
const artifact = {
  schemaVersion: 1,
  sport: "ufc",
  dataClass: "RESULTS_CAPTURE",
  generatedAt: NOW,
  sourceAsOf: NOW,
  windowDays: DAYS,
  state: completed.length > 0 ? "RESULTS" : "NO_RESULTS_YET",
  source: { id: "espn_scoreboard", name: "ESPN MMA public scoreboard", license: "public JSON endpoint, no key; point-in-time snapshot with attribution — same class as the forward bout capture" },
  rowCount: rows.length,
  completedCount: completed.length,
  rows,
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(artifact, null, 1));
console.log(`ufc results/latest.json: state ${artifact.state}, rows ${rows.length}, completed ${completed.length}`);
