#!/usr/bin/env node
/**
 * RECOVER OMITTED FORECAST HISTORY — Program 235 · Release C.
 *
 * WHAT WENT MISSING, AND WHY IT IS NOT WHAT WAS REPORTED.
 *
 * Program 234 recorded an archive gap and named the EPL Newcastle v Bournemouth fixture: its dated
 * artifact `forecasts/2026-09-05.json` was created after the 11:30Z kickoff and omits it. That
 * observation is correct and the CONCLUSION drawn from it was wrong. The dated files are named by
 * GENERATION date, not kickoff date, so a fixture forecast the evening before appears under that
 * evening's file — Newcastle is in `2026-09-03.json` and `2026-09-04.json`, and its report page has
 * been reachable the whole time. There was no gap there.
 *
 * There is a real one, and it has a different cause. `2026-08-20.json` carries nine rows with full
 * probabilities and NO `slug`: the producer had not started emitting slugs yet. `loadEplForecastArchive`
 * keys on `r.slug && r.probs`, so every one of them is invisible to the archive — present in the
 * file, absent from the product. Eight are harmless, because the same fixtures reappear in later
 * dated files once slugs existed. One does not: Arsenal v Coventry City kicked off at 19:00Z on
 * 2026-08-21, and the next dated file was written at 23:51Z, correctly retiring the started event.
 * Its forecast was public with probabilities in three committed revisions, the last 42 minutes
 * before kickoff, and it has no report page.
 *
 * A schema transition, not a retirement bug. Retirement behaved correctly throughout.
 *
 * WHAT THIS DOES. Nothing is regenerated and no probability is recomputed. For a dated row that has
 * probabilities but no slug, it recovers the AUTHENTIC slug from a committed public revision of
 * `latest.json` carrying the same canonical `eventId` — the identity both artifacts already share.
 * A row whose slug cannot be found that way is left missing and reported, because deriving one from
 * the event id would be inventing an identity rather than recovering it.
 *
 * The recovered rows are written to a separate artifact with their own provenance: which dated file
 * the forecast came from, when it was generated, which commit supplied the slug and when that commit
 * landed, and when this repair ran. Forecast creation, commit time, and production delivery are
 * three different facts and are recorded as three fields.
 *
 *   node app/scripts/archive/recover-forecast-history.mjs [--apply]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const FORECASTS = path.join(APP, "public/data/soccer/epl/forecasts");
const PUBLIC_LATEST = "app/public/data/soccer/epl/forecasts/latest.json";
const OUT = path.join(FORECASTS, "recovered.json");

const apply = process.argv.includes("--apply");
const NOW = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const git = (...args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/* ── 1 · every slug ever published, by canonical event id ─────────────────────────────────────
 * The slug is recovered from a revision that actually carried it. Deriving one from the event id
 * would produce a string that looks right and was never published.
 */
function publishedSlugs() {
  const byEvent = new Map();
  let revisions = [];
  try {
    revisions = git("log", "--format=%H %cI", "--", PUBLIC_LATEST).trim().split("\n").filter(Boolean);
  } catch { return byEvent; }
  for (const line of revisions) {
    const [sha, committedAt] = line.trim().split(" ");
    let doc;
    try { doc = JSON.parse(git("show", `${sha}:${PUBLIC_LATEST}`)); } catch { continue; }
    if (doc?.public !== true) continue;                       // a private revision is not publication
    for (const r of doc.rows ?? []) {
      if (!r?.eventId || !r?.slug) continue;
      /* Oldest wins: the first revision that published this slug is the one that published it. */
      if (!byEvent.has(r.eventId)) byEvent.set(r.eventId, { slug: r.slug, sha, committedAt });
    }
  }
  return byEvent;
}

/* ── 2 · the dated archive, and what the loader can actually see ─────────────────────────────── */
function datedRows() {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(FORECASTS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch { return out; }
  for (const file of files) {
    const doc = readJson(path.join(FORECASTS, file));
    for (const r of doc?.rows ?? []) out.push({ file, generatedAt: doc?.generatedAt ?? null, row: r });
  }
  return out;
}

const slugs = publishedSlugs();
const dated = datedRows();

const visible = new Set(dated.filter(({ row }) => row?.slug && row?.probs).map(({ row }) => row.slug));

const recoverable = [];
const alreadyRepresented = [];
const unavailable = [];
const conflicting = [];

/* Newest generation wins for a given event — the forecast of record is the latest revision written
   before the lock, and a later dated file is a later revision. */
const bestByEvent = new Map();
for (const d of dated) {
  const r = d.row;
  if (!r?.probs || r?.slug || !r?.eventId) continue;          // only slug-less rows need recovery
  const prior = bestByEvent.get(r.eventId);
  if (!prior || String(d.generatedAt ?? "") > String(prior.generatedAt ?? "")) bestByEvent.set(r.eventId, d);
  else if (prior && JSON.stringify(prior.row.probs) !== JSON.stringify(r.probs)) {
    conflicting.push({ eventId: r.eventId, files: [prior.file, d.file] });
  }
}

for (const [eventId, d] of bestByEvent) {
  const published = slugs.get(eventId);
  if (!published) {
    unavailable.push({ eventId, matchup: d.row.matchup, file: d.file, why: "no committed public revision ever carried a slug for this event id" });
    continue;
  }
  if (visible.has(published.slug)) {
    alreadyRepresented.push({ eventId, slug: published.slug, matchup: d.row.matchup });
    continue;
  }
  /* The forecast is carried through UNCHANGED and given the slug it was actually published under. */
  recoverable.push({
    ...d.row,
    slug: published.slug,
    recovery: {
      method: "slug recovered from a committed public revision carrying the same canonical eventId; probabilities, model and state are the dated artifact's own and are unmodified",
      forecastSourceFile: `app/public/data/soccer/epl/forecasts/${d.file}`,
      forecastGeneratedAt: d.generatedAt,
      slugSourceCommit: published.sha,
      slugPublishedAt: published.committedAt,
      materializedAt: NOW,
    },
  });
}

/* ── 3 · the report ──────────────────────────────────────────────────────────────────────────── */
console.log(`EPL forecast-history recovery — ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`  public revisions scanned: ${slugs.size} event ids carry a published slug`);
console.log(`  dated rows: ${dated.length} · visible to the archive loader: ${visible.size}`);
console.log(`  already represented: ${alreadyRepresented.length}`);
console.log(`  RECOVERABLE: ${recoverable.length}`);
for (const r of recoverable) console.log(`     ${r.slug} · ${r.matchup} · kickoff ${r.kickoffUtc} · from ${r.recovery.forecastSourceFile}`);
console.log(`  conflicting revisions: ${conflicting.length}`);
for (const c of conflicting) console.log(`     ${c.eventId} differs between ${c.files.join(" and ")}`);
console.log(`  genuinely unavailable: ${unavailable.length}`);
for (const u of unavailable) console.log(`     ${u.eventId} — ${u.why}`);

if (!apply) { console.log("\ndry run — nothing written. Re-run with --apply."); process.exit(0); }

if (recoverable.length === 0) {
  console.log("\nnothing to recover — no artifact written.");
  process.exit(0);
}

/* Deterministic ordering so a rerun produces an identical file except for its own timestamp. */
recoverable.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));

fs.writeFileSync(OUT, JSON.stringify({
  schemaVersion: 1,
  artifact: "epl-forecast-recovery",
  dataClass: "PUBLIC_DERIVED",
  competition: "epl",
  materializedAt: NOW,
  note: "Forecasts that were published publicly with probabilities before their kickoff and are absent from the archive the product reads, because the producer had not yet started emitting slugs. Nothing here was regenerated: every probability, model id and state is the dated artifact's own, and each row carries the commit that published its slug. This is a view of what was said at the time, not a new forecast.",
  rows: recoverable,
}, null, 2) + "\n");
console.log(`\nwrote ${path.relative(REPO, OUT)} — ${recoverable.length} recovered fixture(s)`);
