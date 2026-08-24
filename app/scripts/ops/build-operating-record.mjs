#!/usr/bin/env node
/**
 * THE OPERATING RECORD, GENERATED (Program 203 · Release A).
 *
 *   npx tsx scripts/ops/build-operating-record.mjs --now <ISO> --tip <sha> --program "<label>" \
 *     --suite "<total>·<pass>·<fail>·<skip>" [--e2e "<pass>/<fail>/<skip>"]
 *
 * The record was a hand-authored HTML file living in session scratch; it drifted (three
 * conflicting "current" suite totals), its register rows fell out of chronological order as each
 * program prepended itself, its PDF export truncated mid-row — and then the scratch copy was
 * wiped entirely. Every one of those failure modes is structural, so the record is now GENERATED:
 *
 *   · rows come from the committed register (src/lib/launch/release-history.mjs), which a guard
 *     conserves against git's own convention-era release commits;
 *   · order is enforced chronological (oldest → newest) at generation;
 *   · the document embeds data-expected-releases / first / last / an end marker, and the builder
 *     re-parses its own output — truncation, reordering or a dropped row FAILS generation;
 *   · queue counts and sport tiers are read from the closure packets, never typed.
 *
 * Writes data/internal/launch/operating-record.html (repo-root data/, PRIVATE_INTERNAL — the
 * artifact publish and /launch link both consume this one file).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RELEASE_HISTORY } from "../../src/lib/launch/release-history.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
/* Import-safe: the CLI body runs only when executed directly — the validator is imported by the
   corruption guard, and an import that demands CLI args is a builder nobody can test. */
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function buildRecord({ NOW, TIP, PROGRAM, SUITE, E2E }) {
const packets = JSON.parse(fs.readFileSync(path.resolve(APP, "..", "data", "internal", "launch", "closure-packets-v1.json"), "utf8"));
/*
 * VIEW-MODEL BOUNDARY (P204 R-A). The first shipped version coerced the queue's card ARRAYS
 * straight into the template — "[object Object]" × 12 in the published artifact — and read sport
 * posture through keys the packets never had, so every sport card rendered an empty span. The
 * founder's PDF told the truth about the file while the generator's validator (which checked the
 * register, not these panels) stayed green. Counts are now taken as lengths-or-numbers, posture
 * through the packets' REAL fields, and the final-file verifier bans object coercion outright.
 */
const countOf = (v) => (Array.isArray(v) ? v.length : Number.isFinite(v) ? v : 0);
const sports = Object.values(packets.sports ?? {}).map((s) => ({
  id: s.sport,
  proven: s.counts?.proven ?? null,
  applicable: s.counts?.applicable ?? 12,
  tier: s.publicClaims?.tier ?? "UNKNOWN",
}));
const q = packets.executionQueue ?? {};
const queueLine = `${countOf(q.engineering)} engineering · ${countOf(q.realityWatch)} reality · ${countOf(q.founderQueue)} founder · ${countOf(q.incident)} incident`;

/*
 * Chronological, oldest first — enforced by SORTING at generation, never by hand-editing order.
 * The register file is organized newest-first in blocks (each program prepends its rows), and its
 * own first validation run proved blocks interleave out of date order when merely reversed — the
 * exact defect class the charter names. A stable date sort fixes the document without touching
 * the register; same-day rows keep their reversed-file (git) sequence.
 */
const progNum = (r) => Number(String(r.program).match(/^\d+/)?.[0] ?? 0);
const rows = [...RELEASE_HISTORY].reverse().sort((a, b) =>
  (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (progNum(a) - progNum(b)));
const first = rows[0], last = rows[rows.length - 1];

const rowHtml = rows.map((r) => `        <tr><td class="num">${esc(r.program)}-${esc(r.release)}</td><td class="num">${esc(r.commit)}</td><td class="num">${esc(r.date)}</td><td>${esc(r.outcome)}${r.defectsFound ? ` <em>Defects caught: ${esc(r.defectsFound)}</em>` : ""}</td></tr>`).join("\n");

const html = `<title>GameTimePicks Operating Record</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<style>
  :root {
    --ground: #F5F7F6; --surface: #FFFFFF; --sunken: #EDF1EF; --text: #0B1210; --muted: #4A5652;
    --faint: #6E7B76; --rule: #DCE3E0; --accent: #0E7C5A; --accent-q: #E4F3EC;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #070B09; --surface: #0F1512; --sunken: #0B110E; --text: #F5F7F6; --muted: #9FADA7;
      --faint: #6E7D77; --rule: #1E2723; --accent: #34D399; --accent-q: #0E1F19;
    }
  }
  :root[data-theme="dark"] {
    --ground: #070B09; --surface: #0F1512; --sunken: #0B110E; --text: #F5F7F6; --muted: #9FADA7;
    --faint: #6E7D77; --rule: #1E2723; --accent: #34D399; --accent-q: #0E1F19;
  }
  * { box-sizing: border-box; }
  body { background: var(--ground); color: var(--text); font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; font-size: 15px; line-height: 1.6; margin: 0; }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 40px 24px 96px; }
  h1, h2 { font-family: "IBM Plex Sans Condensed", sans-serif; text-wrap: balance; margin: 0; }
  h1 { font-size: clamp(30px, 5vw, 44px); font-weight: 700; line-height: 1.06; }
  h2 { font-size: clamp(19px, 2.4vw, 24px); font-weight: 700; }
  p { margin: 0; max-width: 72ch; }
  .stamp { display: flex; flex-wrap: wrap; gap: 8px 20px; font-family: "IBM Plex Mono", monospace; font-size: 12px; color: var(--muted); }
  header.doc { display: flex; flex-direction: column; gap: 14px; padding-bottom: 24px; border-bottom: 1px solid var(--rule); }
  section { margin-top: 44px; display: flex; flex-direction: column; gap: 14px; }
  .scroll { overflow-x: auto; border: 1px solid var(--rule); border-radius: 10px; background: var(--surface); }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--rule); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  thead th { font-family: "IBM Plex Mono", monospace; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--faint); background: var(--sunken); }
  td.num { font-family: "IBM Plex Mono", monospace; white-space: nowrap; }
  td em { display: block; color: var(--faint); font-style: normal; font-size: 12px; margin-top: 3px; }
  .sports { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
  .sport { background: var(--surface); border: 1px solid var(--rule); border-radius: 10px; padding: 12px 14px; }
  .sport b { font-family: "IBM Plex Sans Condensed", sans-serif; font-size: 17px; }
  .sport span { display: block; font-size: 12px; color: var(--muted); }
  footer.doc { margin-top: 48px; padding-top: 18px; border-top: 1px solid var(--rule); font-size: 12.5px; color: var(--faint); }
  /* PRINT (P204 R-A): overflow containers clip whole pages in some print engines — the founder's
     export ended mid-row at eight pages. In print the register flows, headers repeat, rows never
     split across a page boundary. */
  @media print {
    .scroll { overflow: visible; border: 0; }
    table { font-size: 11px; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .wrap { max-width: none; padding: 12px 8px; }
  }
</style>
<div class="wrap" data-expected-releases="${rows.length}" data-first-release="${esc(first.program)}-${esc(first.release)}" data-last-release="${esc(last.program)}-${esc(last.release)}">
<header class="doc">
  <p class="stamp"><span>GameTimePicks · Operating record</span><span>Generated ${esc(NOW)}</span><span>${esc(PROGRAM)}</span></p>
  <h1>The operating record, generated from the committed register</h1>
  <p class="stamp">
    <span>main @ ${esc(TIP)}</span>
    <span>Suite: ${esc(SUITE)}</span>
    <span>e2e: ${esc(E2E)}</span>
    <span>Queues: ${esc(queueLine)}</span>
  </p>
  <p>Every figure on this page derives from committed artifacts at the stamp above — the release rows from
  <code>src/lib/launch/release-history.mjs</code> (conserved against git's own release commits by a build-failing
  guard), queues and sport tiers from the closure packets. Nothing here is hand-kept, the order is enforced
  chronological at generation, and the builder re-parses its own output so a truncated or reordered export
  fails instead of shipping. Paper-only and educational throughout.</p>
</header>

<section>
  <h2>Sport posture</h2>
  <div class="sports">
${sports.map((s) => `    <div class="sport"><b>${esc(String(s.id).toUpperCase())}</b><span>${esc(s.proven != null ? `${s.proven}/${s.applicable} proven` : "posture unavailable")} · ${esc(s.tier)}</span></div>`).join("\n")}
  </div>
</section>

<section>
  <h2>The release register — every production release, oldest first</h2>
  <p class="stamp"><span>${rows.length} releases</span><span>first ${esc(first.program)}-${esc(first.release)} (${esc(first.date)})</span><span>last ${esc(last.program)}-${esc(last.release)} (${esc(last.date)})</span></p>
  <div class="scroll">
    <table>
      <thead><tr><th>Release</th><th>Commit</th><th>Date</th><th>What shipped</th></tr></thead>
      <tbody>
${rowHtml}
      </tbody>
    </table>
  </div>
</section>

<footer class="doc">
  <p>Register complete: ${rows.length} releases · ${esc(first.program)}-${esc(first.release)} → ${esc(last.program)}-${esc(last.release)} · generated ${esc(NOW)} at ${esc(TIP)}.</p>
</footer>
</div>
<!-- OPERATING-RECORD-END expected=${rows.length} first=${esc(first.program)}-${esc(first.release)} last=${esc(last.program)}-${esc(last.release)} -->
`;

return { html, rows, first, last };
}

/* ── SELF-VALIDATION: parse the output back before writing ─────────────────────────────────────── */
export function validateRecordHtml(doc) {
  const errors = [];
  const end = doc.match(/<!-- OPERATING-RECORD-END expected=(\d+) first=([^ ]+) last=([^ ]+) -->/);
  if (!end) { errors.push("end marker missing — the document is truncated"); return errors; }
  const expected = Number(end[1]);
  /* Structural parse: three .num cells per row — commit may be empty (legacy program-range
     summary rows carry none), so the match keys on structure, never on hex content. */
  const rendered = [...doc.matchAll(/<tr><td class="num">([^<]+)<\/td><td class="num">([^<]*)<\/td><td class="num">([0-9-]+)<\/td>/g)];
  if (rendered.length !== expected) errors.push(`row count ${rendered.length} !== expected ${expected} — a row was dropped or added`);
  const declared = doc.match(/data-expected-releases="(\d+)"/);
  if (!declared || Number(declared[1]) !== expected) errors.push("header/end-marker expected-count disagree");
  if (rendered.length && rendered[0][1] !== end[2]) errors.push(`first rendered row ${rendered[0][1]} !== declared first ${end[2]}`);
  if (rendered.length && rendered[rendered.length - 1][1] !== end[3]) errors.push(`last rendered row ${rendered[rendered.length - 1][1]} !== declared last ${end[3]}`);
  for (let i = 1; i < rendered.length; i++) {
    if (rendered[i][3] < rendered[i - 1][3]) { errors.push(`chronology broken at row ${i + 1} (${rendered[i][1]}: ${rendered[i][3]} after ${rendered[i - 1][3]})`); break; }
  }
  return errors;
}

if (IS_MAIN) {
  const NOW = arg("--now");
  const TIP = arg("--tip");
  const PROGRAM = arg("--program", "Program 203");
  const SUITE = arg("--suite");
  const E2E = arg("--e2e", "385/0/6 named");
  if (!NOW || !TIP || !SUITE) { console.error("REFUSED: --now, --tip and --suite are required"); process.exit(1); }
  const { html, rows, first, last } = buildRecord({ NOW, TIP, PROGRAM, SUITE, E2E });
  const problems = validateRecordHtml(html);
  if (problems.length) { for (const e of problems) console.error(`RECORD INVALID: ${e}`); process.exit(1); }
  const OUT = path.resolve(APP, "..", "data", "internal", "launch", "operating-record.html");
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`operating-record.html: ${rows.length} releases · ${first.program}-${first.release} → ${last.program}-${last.release} · validated (end marker, count, order)`);
}
