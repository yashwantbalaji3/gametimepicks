/**
 * UFC forward event + bout capture — ESPN MMA public scoreboard (Program 150 · Release B).
 *
 * Event-level and bout-level records are SEPARATE but linked: an event (card) is a container with
 * its own provider id, date and venue; each bout carries its own provider id, red/blue fighters,
 * weight class and status, plus the parent event's id. The settled archive under public/data/ufc/
 * is a RESULT store and is never read or written here — forward coverage and history stay apart.
 *
 * Raw provider statuses are preserved (the adapter normalizes through the closed taxonomy + the
 * UFC bout extension). --now pinned; zero-event windows refused.
 *
 * Run: node scripts/ufc/capture-ufc-events.mjs --now 2026-08-10T02:30:00Z --days 60
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = path.join(APP, "public", "data", "ufc", "schedule");

const arg = (name, fb = null) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const DAYS = Math.min(120, Math.max(1, Number(arg("--days", "60"))));

const d0 = new Date(NOW);
const fmt = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
const url = `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${fmt(d0)}-${fmt(new Date(d0.getTime() + DAYS * 86400_000))}&limit=1000`; // P196: default page size truncated a 13-bout card to 7

const res = await fetch(url);
if (!res.ok) { console.error(`REFUSED: scoreboard fetch ${res.status}`); process.exit(1); }
const data = await res.json();

const events = [];
const bouts = [];
for (const e of data.events ?? []) {
  if (!e.id || !e.date || !e.name) continue;
  events.push({
    providerEventId: String(e.id),
    name: e.name,
    dateUtc: e.date,
    venue: e.competitions?.[0]?.venue?.fullName ?? null,
    statusRaw: e.status?.type?.name ?? e.competitions?.[0]?.status?.type?.name ?? null,
    boutCount: e.competitions?.length ?? 0,
    capturedAt: NOW,
  });
  for (const c of e.competitions ?? []) {
    const red = c.competitors?.[0]?.athlete?.displayName ?? null;
    const blue = c.competitors?.[1]?.athlete?.displayName ?? null;
    if (!c.id || !red || !blue) continue; // an unnamed bout is not renderable — dropped, counted below
    bouts.push({
      providerBoutId: String(c.id),
      eventProviderId: String(e.id),
      red, blue,
      /*
       * THE ID IS ON THE COMPETITOR, not on the nested athlete.
       *
       * The scoreboard's `athlete` object carries only fullName / displayName / shortName / flag —
       * no id — so this read null for every bout on every capture and the tale-of-the-tape ingest
       * had nothing to join on. The competitor wrapper is where the id lives, and it is the id the
       * core athlete endpoint accepts. Falls back to the athlete id in case a future payload moves
       * it back.
       */
      redProviderId: c.competitors?.[0]?.id != null ? String(c.competitors[0].id)
        : c.competitors?.[0]?.athlete?.id != null ? String(c.competitors[0].athlete.id) : null,
      blueProviderId: c.competitors?.[1]?.id != null ? String(c.competitors[1].id)
        : c.competitors?.[1]?.athlete?.id != null ? String(c.competitors[1].athlete.id) : null,
      weightClass: c.type?.abbreviation ?? c.type?.text ?? null,
      dateUtc: c.date ?? e.date,
      statusRaw: c.status?.type?.name ?? null,
      capturedAt: NOW,
    });
  }
}

if (events.length === 0) { console.error("REFUSED: zero usable events — an empty capture would render as an empty slate"); process.exit(1); }
for (const [label, list, key] of [["event", events, "providerEventId"], ["bout", bouts, "providerBoutId"]]) {
  const dupes = list.length - new Set(list.map((r) => r[key])).size;
  if (dupes > 0) { console.error(`REFUSED: ${dupes} duplicate ${label} provider ids in one window`); process.exit(1); }
}

/*
 * THE NEXT EVENT IS THE NEXT UPCOMING ONE — never simply the first the provider listed.
 *
 * This called `events[0]` "next", which is whatever order ESPN returned. A card that has already
 * been fought stays in the scoreboard window for days, so the site went on pointing at UFC 329 for
 * five weeks after it happened: the moment a card finished, nothing advanced.
 *
 * A UFC week has a rhythm — the card ends Saturday night and the next one is the story by Tuesday —
 * so the capture resolves it explicitly: drop anything already final, sort by start time, take the
 * earliest. If every event in the window has been fought, `nextEvent` is null and the surface says
 * the schedule is between cards rather than showing a finished one as upcoming.
 */
const FINAL_STATUSES = new Set(["STATUS_FINAL", "STATUS_FULL_TIME", "STATUS_CANCELED", "STATUS_POSTPONED"]);
const upcoming = events
  .filter((e) => !FINAL_STATUSES.has(String(e.statusRaw ?? "").toUpperCase()))
  .filter((e) => Date.parse(e.dateUtc) > Date.parse(NOW) - 6 * 3600_000)   // a live card is still "next"
  .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc));
const nextEvent = upcoming[0] ?? null;

const artifact = {
  schemaVersion: 1,
  nextEvent,
  upcomingCount: upcoming.length,
  sport: "ufc",
  dataClass: "SCHEDULE_CAPTURE",
  generatedAt: NOW,
  windowDays: DAYS,
  coverageNote: "forward cards as the provider lists them; bout lists shift with replacements and cancellations — each capture is a point-in-time snapshot, and the settled archive is a separate store",
  source: {
    id: "espn_scoreboard",
    name: "ESPN MMA public scoreboard (site.api.espn.com)",
    url,
    license: "public JSON endpoint, no key; point-in-time snapshot with attribution",
  },
  events,
  bouts,
  droppedUnnamedBouts: (data.events ?? []).reduce((n, e) => n + (e.competitions?.length ?? 0), 0) - bouts.length,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `capture-${NOW.replace(/[:]/g, "").slice(0, 15)}.json`), JSON.stringify(artifact, null, 1));
fs.writeFileSync(path.join(OUT, "latest.json"), JSON.stringify(artifact, null, 1));
console.log(`captured ${events.length} events / ${bouts.length} named bouts (${artifact.droppedUnnamedBouts} unnamed dropped), window ${DAYS}d`);
console.log(nextEvent
  ? `next upcoming: ${nextEvent.name} @ ${nextEvent.dateUtc} (${upcoming.length} upcoming in window)`
  : "no upcoming event in the window — between cards, and the surface says so rather than showing a finished one");
