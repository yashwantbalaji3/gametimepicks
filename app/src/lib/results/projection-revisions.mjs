/**
 * SAME-DAY RESTATEMENTS OF THE DATED RESULTS PROJECTION (Session 1B · founder decision F1(a), 2026-09-30).
 *
 * V18 §9.3 left one choice open for a second same-day run whose cells differ: an operator deletes the
 * dated file, or "a `--restate` flag that records the restatement". This is that flag's contract.
 *
 *   <date>.json      the ORIGINAL publication — written once, never rewritten (opened with `wx`)
 *   <date>.r2.json   the first restatement of that day — a full projection plus a `restatement` block
 *   <date>.r3.json   restates r2 … and so on, append-only
 *
 * THE EFFECTIVE PROJECTION for a date is the last link of an unbroken chain: base → r2 → r3 …, where
 * every rN names `restates` = the previous link and carries `revision: N`. A broken chain (a gap, a link
 * that names the wrong predecessor, an unreadable file) has NO effective projection — it is refused,
 * never guessed around. `latest.json` is a pointer and always equals the effective projection of the
 * day it was written for.
 *
 * WHAT COUNTS AS A RESTATEMENT is a HISTORY difference (historyOf): counts, windows, n, owner states,
 * semantics, the headline. Owner stamps are provenance, not history, so a re-run whose owners only
 * restamped is a no-op and writes no revision — nor does a re-run identical to the effective state.
 *
 * WHAT IS NEVER PUBLISHABLE, even with --restate (the run stays red; an operator decides):
 *   · a cell that DISAPPEARS — an absent owner is not a restated zero;
 *   · a CLOSED-HISTORY cell whose RECORD moves (counts, n, decisive, hit rate, window, cycles) — a legacy
 *     era (LEGACY_ERAS: protected base, ledger-only ladders, legacy ledgers, historical-only, policy v1)
 *     or a SUPERSEDED snapshot. Keyed on the ERA, not the `FROZEN` status: the lab's policy-v2 streams
 *     are "FROZEN" only in the sense "not live today" (s.live === false) — their counts still advance on
 *     settlement and their words move with the day ("no price capture yet" → "only 2 priced games");
 *   · a different schema or artifact.
 */
import fs from "node:fs";
import path from "node:path";
import { LEGACY_ERAS } from "./projection-core.mjs";

/** Cell owner stamps are provenance. Every other field of a cell is history. */
const unstamped = (cell) =>
  cell && typeof cell.owner === "object" && cell.owner !== null ? { ...cell, owner: { ...cell.owner, generatedAt: null } } : cell;

/**
 * The history a dated file pins: cells + headline, owner stamps excluded (V18 §5), cells in cellId order.
 * ⚠ ORDER IS NOT HISTORY. The builder emits cells in owner-iteration order (the graded-picks cells follow
 * the key order of `sources.gradedPicks`), so the same facts read in a different order produced a different
 * string and would have been a "restatement" of nothing. Test 8 of projection-restatement caught it.
 */
const byCellId = (a, b) => String(a?.cellId).localeCompare(String(b?.cellId));
export const historyOf = (p) => JSON.stringify({ cells: Array.isArray(p?.cells) ? [...p.cells].sort(byCellId).map(unstamped) : p?.cells, headline: p?.headline });

export const baseName = (date) => `${date}.json`;
export const revisionName = (date, n) => `${date}.r${n}.json`;
const REVISION_RE = (date) => new RegExp(`^${date.replace(/[-]/g, "\\-")}\\.r(\\d+)\\.json$`);

/** Fields of a cell that are its RECORD — the part a frozen cell may never move. */
export const RECORD_FIELDS = Object.freeze(["counts", "n", "decisive", "hitRate", "window", "cycles"]);
const CLOSED_ERAS = new Set(LEGACY_ERAS);
const isClosedHistory = (cell) => CLOSED_ERAS.has(cell?.era) || cell?.status === "SUPERSEDED";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return undefined; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * THE ONE EFFECTIVE-PROJECTION RESOLVER for a date. Every reader of a dated projection goes through here.
 * @returns {{ base: object|null, links: Array<{name: string, doc: object}>, effective: object|null,
 *             effectiveName: string|null, nextRevision: number, error: string|null }}
 */
export function readEffective(dir, date) {
  const out = { base: null, links: [], effective: null, effectiveName: null, nextRevision: 2, error: null };
  const basePath = path.join(dir, baseName(date));
  if (!fs.existsSync(basePath)) {
    let stray = [];
    try { stray = fs.readdirSync(dir).filter((f) => REVISION_RE(date).test(f)); } catch { stray = []; }
    if (stray.length) out.error = `${stray[0]} exists with no original ${baseName(date)} — a restatement of nothing`;
    return out;
  }
  const base = readJson(basePath);
  if (!base || typeof base !== "object") { out.error = `${baseName(date)} is unreadable`; return out; }
  out.base = base;
  out.links.push({ name: baseName(date), doc: base });

  let revs = [];
  try {
    revs = fs.readdirSync(dir).map((f) => f.match(REVISION_RE(date))).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
  } catch { revs = []; }
  for (let i = 0; i < revs.length; i++) {
    const n = revs[i];
    const expected = i + 2;
    const name = revisionName(date, n);
    if (n !== expected) { out.error = `restatement chain for ${date} has a gap: found ${name}, expected ${revisionName(date, expected)}`; return out; }
    const doc = readJson(path.join(dir, name));
    const r = doc?.restatement;
    const prev = out.links[out.links.length - 1].name;
    if (!doc || !r) { out.error = `${name} is unreadable or carries no restatement block`; return out; }
    if (r.revision !== n || r.date !== date || r.restates !== prev) {
      out.error = `${name} does not continue the chain (revision ${r.revision}, restates ${r.restates}; expected revision ${n}, restates ${prev})`;
      return out;
    }
    out.links.push({ name, doc });
  }
  const last = out.links[out.links.length - 1];
  out.effective = last.doc;
  out.effectiveName = last.name;
  out.nextRevision = out.links.length + 1;
  return out;
}

/**
 * The semantic difference between two projections: cells changed, added and removed (by cellId), and
 * whether the headline moved. Owner stamps never count. Deterministic: sorted by cellId, and each
 * changed cell lists only the top-level fields that differ, before and after.
 */
export function diffProjections(prev, next) {
  const P = new Map((prev?.cells ?? []).map((c) => [c.cellId, c]));
  const N = new Map((next?.cells ?? []).map((c) => [c.cellId, c]));
  const changed = [];
  for (const id of [...N.keys()].sort()) {
    if (!P.has(id)) continue;
    const a = unstamped(P.get(id)), b = unstamped(N.get(id));
    if (same(a, b)) continue;
    const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !same(a[k], b[k])).sort();
    changed.push({
      cellId: id,
      owner: N.get(id).owner?.path ?? null,
      status: P.get(id).status ?? null,
      era: P.get(id).era ?? null,
      closedHistory: isClosedHistory(P.get(id)),
      fields,
      before: Object.fromEntries(fields.map((k) => [k, a[k] ?? null])),
      after: Object.fromEntries(fields.map((k) => [k, b[k] ?? null])),
      ownerStamp: { before: P.get(id).owner?.generatedAt ?? null, after: N.get(id).owner?.generatedAt ?? null },
    });
  }
  const added = [...N.keys()].filter((id) => !P.has(id)).sort();
  const removed = [...P.keys()].filter((id) => !N.has(id)).sort();
  return { changed, added, removed, headlineChanged: !same(prev?.headline, next?.headline) };
}

/** Is this difference publishable as an append-only restatement? Returns the reasons it is not. */
export function unsafeRestatementReasons(prev, next, diff = diffProjections(prev, next)) {
  const reasons = [];
  if (prev?.schema !== next?.schema) reasons.push(`schema changed (${prev?.schema} → ${next?.schema})`);
  if (prev?.artifact !== next?.artifact) reasons.push(`artifact changed (${prev?.artifact} → ${next?.artifact})`);
  for (const id of diff.removed) reasons.push(`cell ${id} disappeared — an absent owner is not a restatement`);
  for (const c of diff.changed) {
    if (!c.closedHistory) continue;
    const moved = c.fields.filter((f) => RECORD_FIELDS.includes(f));
    if (moved.length) reasons.push(`closed-history cell ${c.cellId} (${c.era}, ${c.status}) moved its record (${moved.join(", ")}) — closed history does not advance`);
  }
  return reasons;
}

/** The restatement block a revision file carries. */
export function restatementBlock({ date, revision, restates, restatedAt, diff, next }) {
  const ownerOf = new Map((next?.cells ?? []).map((c) => [c.cellId, c.owner?.path ?? null]));
  return {
    date,
    revision,
    restates,
    previousEffective: restates,
    restatedAt,
    reason: "OWNER_ADVANCED",
    changedOwners: [...new Set([...diff.changed.map((c) => c.owner), ...diff.added.map((id) => ownerOf.get(id))].filter(Boolean))].sort(),
    changedCells: diff.changed,
    addedCells: diff.added,
    headlineChanged: diff.headlineChanged,
    note: "Append-only restatement: the original publication and every earlier revision are unchanged. Owner stamps are provenance, not history, and never cause a revision.",
  };
}
