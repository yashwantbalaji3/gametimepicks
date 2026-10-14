/**
 * WHAT IN AN MLB SLATE COMMIT IS WORTH A PRODUCTION BUILD (COST-001 Stage B, 2026-10-14).
 *
 * The NBA results gate (lib/sports/nba/results-publishable.mjs) applied to the two MLB writers that
 * re-run all day: mlb-lineup-refresh (hourly 15:30–00:30Z) and mlb-daily-production (the morning slate
 * plus its recovery re-runs). Both regenerate deterministically from committed inputs, so a run whose
 * inputs did not move reproduces the same simulation and predictions byte for byte — except for the
 * run's own clock stamps. Those stamps alone made every run a commit to app/, and every such commit a
 * full Vercel build: in the 24h to 2026-10-14 16:00Z, 14 of 16 builds from these two workflows changed
 * nothing but `generatedAt` (docs/research/build-necessity, COST-001).
 *
 * THE RULE. A run's staged files are split three ways:
 *   1. GATED — a build input with a declared stamp allowlist (STAMP_RULES). It is "stamp-only" when the
 *      new file equals HEAD's after deleting exactly the allowlisted stamp paths. A new prediction
 *      snapshot is stamp-only when it equals the newest snapshot already committed for that date.
 *   2. FREE — not a Vercel build input (the ignore step's own lists, parsed by the CLI): ops verdicts,
 *      admin/status.json, internal provenance and run history. They always commit, as today; a commit
 *      of only these costs no build.
 *   3. UNKNOWN — a build input with no stamp rule. Never judged: its presence publishes.
 *
 * The gated set is all-or-nothing. It is suppressed (restored to HEAD, new identical snapshots dropped)
 * only when EVERY gated file is stamp-only, no unknown build input is staged, the public projection of
 * the publication-SLO verdict is unchanged, and the committed stamps are inside the heartbeat bound.
 * Anything else — one changed probability, one new lineup, a deletion, an unreadable file — publishes
 * everything exactly as the workflow did before this gate existed. Uncertainty publishes.
 *
 * WHY THE PUBLICATION-SLO CLAUSE. app/public/data/ops/ is excluded from the build trigger, yet the
 * public pages read ops/publication-slo.json at build time (lib/ops/read-publication-slo.ts). Until
 * now its changes reached the site only by riding these stamp commits. If the verdict a reader can see
 * moved, the gated set publishes so the build carries it.
 *
 * WHY A HEARTBEAT. Suppression keeps the last content-changing stamp ("Simulated 10:49 AM"), which is
 * true — the simulation has not changed since. No staleness verdict reads these stamps (the MLB
 * product-day stamp is the board's, the footer is the build's). The heartbeat still bounds how far a
 * rendered stamp can trail the latest confirming run: once the oldest committed gated stamp is older
 * than `heartbeatHours`, the run publishes.
 */

/** Stamp allowlists, by repo path. `*` walks an array. Mined from 157 commits (2026-10-04..14). */
export const STAMP_RULES = Object.freeze([
  { id: "mlb-full-game-simulations", pattern: /^app\/public\/data\/mlb\/full-game-simulations\/\d{4}-\d{2}-\d{2}\.json$/, stamps: ["generatedAt"] },
  { id: "mlb-predictions", pattern: /^app\/public\/data\/mlb\/predictions\/\d{4}-\d{2}-\d{2}\.json$/, stamps: ["generatedAt"] },
  { id: "mlb-game-simulations", pattern: /^app\/public\/data\/mlb\/game-simulations\/\d{4}-\d{2}-\d{2}\.json$/, stamps: ["generatedAt", "games.*.freshness.generatedAt"] },
  { id: "mlb-homer-nukes", pattern: /^app\/public\/data\/mlb\/homer-nukes\/\d{4}-\d{2}-\d{2}\.json$/, stamps: ["generatedAt"] },
  // priceAgeDays is (generatedAt − evidence.pricesCapturedAt) in days (scripts/parlays/lab-eligibility.mjs).
  // pricesCapturedAt is NOT allowlisted, so new prices always publish; an age that crosses an eligibility
  // bar changes `reason`/eligibility fields, which are not allowlisted either.
  { id: "mlb-tier-grid", pattern: /^app\/public\/data\/parlays\/tier-grid\/mlb-(\d{4}-\d{2}-\d{2}|latest)\.json$/, stamps: ["generatedAt", "evidence.priceAgeDays"] },
  { id: "mlb-schedule", pattern: /^app\/public\/data\/mlb\/schedule\/\d{4}-\d{2}-\d{2}\.json$/, stamps: ["generatedAt"] },
  { id: "mlb-prediction-snapshot", pattern: /^data\/internal\/mlb\/prediction-snapshots\/\d{4}-\d{2}-\d{2}\/snapshot-\d{12}\.json$/, stamps: ["generatedAt"], snapshot: true },
]);

export const PUBLICATION_SLO_PATH = "app/public/data/ops/publication-slo.json";
/** The fields lib/ops/read-publication-slo.ts hands to public pages. */
export const PUBLICATION_SLO_PUBLIC_FIELDS = Object.freeze(["date", "state", "platformState", "publishDeadlineUtc", "reason"]);
export const DEFAULT_HEARTBEAT_HOURS = 6;

export const ruleFor = (file) => STAMP_RULES.find((r) => r.pattern.test(file)) ?? null;

/** Stable serialisation: key order is not something a reader can see. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

function deletePath(node, segs) {
  if (node == null || typeof node !== "object" || segs.length === 0) return;
  const [head, ...rest] = segs;
  if (head === "*") {
    if (Array.isArray(node)) for (const el of node) deletePath(el, rest);
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(node, head)) return;
  if (rest.length === 0) delete node[head];
  else deletePath(node[head], rest);
}

/** A deep copy with exactly the allowlisted stamp paths removed. */
export function stripStamps(doc, stamps) {
  const copy = structuredClone(doc);
  for (const s of stamps) deletePath(copy, s.split("."));
  return copy;
}

/** True only when both parse and differ in nothing but the allowlisted stamps. */
export function stampOnly(beforeText, afterText, stamps) {
  if (typeof beforeText !== "string" || typeof afterText !== "string") return false;
  let a, b;
  try { a = JSON.parse(beforeText); b = JSON.parse(afterText); } catch { return false; }
  return canonical(stripStamps(a, stamps)) === canonical(stripStamps(b, stamps));
}

/** The publication-SLO verdict as a public page sees it. null when unreadable. */
export function publicSloKey(text) {
  try {
    const d = JSON.parse(text);
    return canonical(Object.fromEntries(PUBLICATION_SLO_PUBLIC_FIELDS.map((k) => [k, d?.[k] ?? null])));
  } catch { return null; }
}

function headStamp(text) {
  try {
    const d = JSON.parse(text);
    const t = Date.parse(d?.generatedAt ?? d?.updatedAt ?? "");
    return Number.isFinite(t) ? t : null;
  } catch { return null; }
}

/**
 * @param {object} o
 * @param {{ path: string, status: "A"|"M"|"D", before: string|null, after: string|null, buildInput: boolean, priorSnapshot?: string|null }[]} o.changes
 *        Every staged file. `before` is HEAD's text, `after` the staged text, `priorSnapshot` (snapshots
 *        only) the newest snapshot committed at HEAD for the same date, or null when there is none.
 * @param {number} o.nowMs
 * @param {number} [o.heartbeatHours]
 * @returns {{ verdict: "SUPPRESS"|"PUBLISH", reasons: string[], restore: string[], drop: string[], free: string[] }}
 */
export function decide({ changes, nowMs, heartbeatHours = DEFAULT_HEARTBEAT_HOURS }) {
  const reasons = [];
  const restore = [], drop = [], free = [];
  const stamps = [];
  for (const c of changes ?? []) {
    if (c.path === PUBLICATION_SLO_PATH) {
      const was = c.before == null ? null : publicSloKey(c.before);
      const now = c.after == null ? null : publicSloKey(c.after);
      if (was == null || now == null || was !== now) reasons.push("the publication-SLO verdict public pages read has changed");
      free.push(c.path);
      continue;
    }
    const rule = ruleFor(c.path);
    if (!c.buildInput && !rule) { free.push(c.path); continue; }
    if (!rule) { reasons.push(`${c.path}: a build input with no stamp rule`); continue; }
    if (c.status === "D") { reasons.push(`${c.path}: deleted`); continue; }
    if (rule.snapshot) {
      if (c.status !== "A") { reasons.push(`${c.path}: an immutable snapshot was rewritten`); continue; }
      if (c.priorSnapshot == null) { reasons.push(`${c.path}: the first snapshot of its date`); continue; }
      if (!stampOnly(c.priorSnapshot, c.after, rule.stamps)) { reasons.push(`${c.path}: differs from the newest committed snapshot`); continue; }
      drop.push(c.path);
      continue;
    }
    if (c.status === "A") { reasons.push(`${c.path}: new file`); continue; }
    if (!stampOnly(c.before, c.after, rule.stamps)) { reasons.push(`${c.path}: content changed beyond ${rule.stamps.join(", ")}`); continue; }
    const t = headStamp(c.before);
    if (t == null) { reasons.push(`${c.path}: committed stamp unreadable`); continue; }
    stamps.push(t);
    restore.push(c.path);
  }
  if (restore.length === 0 && drop.length === 0 && reasons.length === 0) {
    return { verdict: "PUBLISH", reasons: ["no gated file staged — nothing to suppress"], restore: [], drop: [], free };
  }
  if (stamps.length > 0 && Number.isFinite(nowMs)) {
    const ageH = (nowMs - Math.min(...stamps)) / 3_600_000;
    if (ageH > heartbeatHours) reasons.push(`heartbeat: committed stamps are ${ageH.toFixed(1)}h old (bound ${heartbeatHours}h)`);
  } else if (!Number.isFinite(nowMs)) {
    reasons.push("no clock — heartbeat cannot be judged");
  }
  if (reasons.length > 0) return { verdict: "PUBLISH", reasons, restore: [], drop: [], free };
  return { verdict: "SUPPRESS", reasons: [`${restore.length} file(s) changed only in stamps; ${drop.length} snapshot(s) identical to the last committed`], restore, drop, free };
}

/**
 * Parse the ignore step's BUILD_INPUTS / NON_BUILD_INPUTS out of scripts/vercel-ignore-build.sh and return
 * a predicate. Returns null when either list cannot be parsed — the caller must then treat every file as
 * a build input (more publishing, never less).
 */
export function buildInputPredicate(shText) {
  const nbi = /# GTP-NON-BUILD-INPUTS-BEGIN\s*\nNON_BUILD_INPUTS=\(([\s\S]*?)\)\s*\n# GTP-NON-BUILD-INPUTS-END/.exec(shText ?? "");
  const bi = /\nBUILD_INPUTS=\(([\s\S]*?)\n\)/.exec(shText ?? "");
  if (!nbi || !bi) return null;
  const excluded = [...nbi[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const included = [...bi[1].matchAll(/':\(top\)([^']+)'/g)].map((m) => m[1]);
  if (included.length === 0) return null;
  const under = (f, p) => (p.endsWith("/") ? f.startsWith(p) : f === p);
  return (file) => included.some((p) => under(file, p)) && !excluded.some((p) => under(file, p));
}
