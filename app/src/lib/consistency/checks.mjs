/**
 * CROSS-PRODUCT PREDICTION CONSISTENCY · GATE CHECKS.
 *
 * Each check compares a product surface with the OFFICIAL snapshot by snapshot + market identity, on the exact
 * internal numbers (never rounded strings), and returns discrepancy records:
 *
 *   { code, severity ERROR|WARN, sport, eventId, snapshotId, surface, identity, sources[], expected, actual,
 *     count, examples[], correction, owner, detail, fingerprint }
 *
 * `fingerprint` is the stable identity of a discrepancy (no numbers, no line numbers, no timestamps) so a baseline can
 * pin today's set and any NEW one fails. Item-level mismatches of one kind on one surface/family are aggregated into
 * one record with a `count` and the largest `examples` — the count is part of the baseline, so growth also fails.
 *
 * TOLERANCE. Equality is exact up to the surface's own stored precision: a surface that stores 4 decimals is compared
 * at ±0.5e-4, one that stores whole numbers at ±0.5, an unrounded copy at ±1e-9. Anything beyond is a mismatch.
 *
 * Pure. No fs, no clock.
 */
import { checkDraw } from "../sports/nba/game-sim-v1.mjs";

export const CODES = Object.freeze({
  PROJECTION_MISMATCH: "PROJECTION_MISMATCH",
  LEAN_CONTRADICTION: "LEAN_CONTRADICTION",
  SCENARIO_LEAK: "SCENARIO_LEAK",
  BOX_SCORE_INCONSISTENT: "BOX_SCORE_INCONSISTENT",
  MODEL_VERSION_MIX: "MODEL_VERSION_MIX",
  POST_LOCK_REWRITE: "POST_LOCK_REWRITE",
  UNQUALIFIED_AS_QUALIFIED: "UNQUALIFIED_AS_QUALIFIED",
  NAME_JOIN: "NAME_JOIN",
});
export const SEVERITY = Object.freeze({ ERROR: "ERROR", WARN: "WARN" });

export const TOLERANCE = Object.freeze({ exact: 1e-9, fourDp: 0.5e-4, twoDp: 0.5e-2, wholeNumber: 0.5 });

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Stable fingerprint: code | sport | eventId | surface | subject | family | field — never numbers. */
export function fingerprintOf(d) {
  const id = d.identity ?? {};
  return [d.code, d.sport ?? "-", d.eventId ?? "-", d.surface ?? "-", id.subjectId ?? id.subject ?? "-", id.family ?? "-", id.field ?? "-"].join("|");
}

export function discrepancy({ code, severity = SEVERITY.ERROR, snapshot = null, sport = null, eventId = null, surface, identity = {}, sources = [], expected = null, actual = null, count = 1, examples = [], correction, owner = null, detail = null }) {
  if (!CODES[code]) throw new TypeError(`unknown discrepancy code ${code}`);
  const d = {
    code, severity,
    sport: snapshot?.sport ?? sport, eventId: snapshot?.eventId ?? eventId, snapshotId: snapshot?.snapshotId ?? null,
    surface, identity, sources, expected, actual, count, examples, correction, owner, detail,
  };
  d.fingerprint = fingerprintOf(d);
  return d;
}

/**
 * PROJECTION_MISMATCH over many (subject, family, field) pairs, aggregated per (family, field).
 * @param {{ snapshot, surface, sources, pairs: Array<{subjectId, family, field, expected, actual, tolerance?}>,
 *           severity?, correction, owner, tolerance? }} o
 */
export function projectionMismatches({ snapshot, surface, sources = [], pairs, severity = SEVERITY.ERROR, correction, owner, tolerance = TOLERANCE.exact, detail = null }) {
  const groups = new Map();
  for (const p of pairs) {
    if (!isNum(p.expected) || !isNum(p.actual)) continue;
    const tol = p.tolerance ?? tolerance;
    const diff = p.actual - p.expected;
    if (Math.abs(diff) <= tol) continue;
    const key = `${p.family ?? "-"}|${p.field ?? "-"}|${p.groupSubject ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...p, diff });
  }
  const out = [];
  for (const items of groups.values()) {
    items.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || String(a.subjectId).localeCompare(String(b.subjectId)));
    const top = items[0];
    out.push(discrepancy({
      code: CODES.PROJECTION_MISMATCH, severity, snapshot, surface, sources,
      identity: { subjectId: top.groupSubject ?? (items.length === 1 ? top.subjectId : "*"), family: top.family ?? null, field: top.field ?? null },
      expected: top.expected, actual: top.actual, count: items.length,
      examples: items.slice(0, 3).map((i) => ({ subjectId: i.subjectId, label: i.label ?? null, expected: i.expected, actual: i.actual, diff: i.diff })),
      correction, owner, detail,
    }));
  }
  return out;
}

/**
 * LEAN_CONTRADICTION: a product side for an identity the shared evaluator scores differently.
 *   opposite side (OVER vs UNDER)      → ERROR (a reversed lean for identical inputs)
 *   product side vs evaluator NONE     → WARN  (a side the price-aware rule does not support — e.g. projection vs line)
 * Aggregated per family.
 * @param {{ snapshot, surface, sources, pairs: Array<{subjectId, family, line, book, productLean, evaluation}>, correction, owner }} o
 */
export function leanContradictions({ snapshot, surface, sources = [], pairs, correction, owner, detail = null }) {
  const groups = new Map();
  for (const p of pairs) {
    const pl = p.productLean; const el = p.evaluation?.lean ?? "NONE";
    if (pl !== "OVER" && pl !== "UNDER") continue;
    if (pl === el) continue;
    const kind = el === "NONE" ? "SIDE_WITHOUT_PRICE_SUPPORT" : "REVERSED";
    const key = `${p.family}|${kind}`;
    if (!groups.has(key)) groups.set(key, { kind, items: [] });
    groups.get(key).items.push(p);
  }
  const out = [];
  for (const { kind, items } of groups.values()) {
    const ex = items.slice(0, 3).map((i) => ({
      subjectId: i.subjectId, label: i.label ?? null, line: i.line, book: i.book ?? null, productLean: i.productLean, evaluatorLean: i.evaluation?.lean ?? "NONE",
      projection: i.evaluation?.projection ?? null, pOver: i.evaluation?.pOver ?? null, pUnder: i.evaluation?.pUnder ?? null,
      ev: i.evaluation?.ev ?? null, withheldReasons: i.evaluation?.withheldReasons ?? [],
    }));
    out.push(discrepancy({
      code: CODES.LEAN_CONTRADICTION, severity: kind === "REVERSED" ? SEVERITY.ERROR : SEVERITY.WARN, snapshot, surface, sources,
      identity: { subjectId: "*", family: items[0].family, field: kind },
      expected: ex[0].evaluatorLean, actual: ex[0].productLean, count: items.length, examples: ex, correction, owner, detail,
    }));
  }
  return out;
}

/** Two products disagreeing on the side for the same evaluation identity key. */
export function crossProductLeans({ snapshot, entries, correction, owner }) {
  const byKey = new Map();
  for (const e of entries) {
    if (e.lean !== "OVER" && e.lean !== "UNDER") continue;
    if (!byKey.has(e.key)) byKey.set(e.key, []);
    byKey.get(e.key).push(e);
  }
  const out = [];
  for (const [key, list] of byKey) {
    const sides = new Set(list.map((e) => e.lean));
    if (sides.size < 2) continue;
    out.push(discrepancy({
      code: CODES.LEAN_CONTRADICTION, severity: SEVERITY.ERROR, snapshot, surface: list.map((e) => e.surface).sort().join("+"),
      identity: { subjectId: list[0].subjectId, family: list[0].family, field: "CROSS_PRODUCT" },
      expected: null, actual: list.map((e) => `${e.surface}:${e.lean}`), examples: [{ key }], correction, owner,
    }));
  }
  return out;
}

/** SCENARIO_LEAK: a betting / ranked product leg whose numbers come from anything but the OFFICIAL source. */
export function scenarioLeaks({ snapshot, surface, legs, correction, owner, sources = [] }) {
  const bad = legs.filter((l) => l.hypothetical === true || (l.sourceRole && l.sourceRole !== "OFFICIAL"));
  if (!bad.length) return [];
  const byFam = new Map();
  for (const l of bad) { if (!byFam.has(l.family)) byFam.set(l.family, []); byFam.get(l.family).push(l); }
  return [...byFam.entries()].map(([family, list]) => discrepancy({
    code: CODES.SCENARIO_LEAK, severity: SEVERITY.ERROR, snapshot, surface, sources,
    identity: { subjectId: "*", family, field: list[0].hypothetical ? "HYPOTHETICAL" : list[0].sourceRole },
    expected: "OFFICIAL", actual: list[0].hypothetical ? "HYPOTHETICAL" : list[0].sourceRole, count: list.length,
    examples: list.slice(0, 3).map((l) => ({ subjectId: l.subjectId, label: l.label ?? null, source: l.source ?? null })), correction, owner,
  }));
}

/* ─────────────────────────────── box scores ─────────────────────────────── */

/** NFL sim-v2 stored run: Σ quarters = final per side; last drive score = final; integers, non-negative. */
export function nflRunInvariants(run) {
  const v = [];
  for (const side of ["home", "away"]) {
    const f = run[side];
    if (!Number.isInteger(f) || f < 0) v.push(`${side} final not a non-negative integer`);
    const q = run.periods?.[side];
    if (Array.isArray(q) && q.reduce((s, x) => s + x, 0) !== f) v.push(`${side} Σ quarters ${q.reduce((s, x) => s + x, 0)} ≠ final ${f}`);
  }
  const last = Array.isArray(run.drives) && run.drives.length ? run.drives[run.drives.length - 1].score : null;
  if (Array.isArray(last) && (last[0] !== run.home || last[1] !== run.away)) v.push(`last drive score ${last.join("-")} ≠ final ${run.home}-${run.away}`);
  if (run.overtime === false && Array.isArray(run.periods?.home) && run.periods.home.length > 4 && (run.periods.home[4] || run.periods.away[4])) v.push("overtime points without overtime");
  return v;
}

/** NBA v1 stored sample → the engine's own seven invariants (game-sim-v1 checkDraw), periods reshaped. */
export function nbaRunInvariants(run) {
  const s = run.raw ?? {};
  const draw = {
    final: s.final, overtimePeriods: s.overtimePeriods ?? 0, team: s.team, players: s.players,
    periods: { home: (s.periods ?? []).map((p) => p.home), away: (s.periods ?? []).map((p) => p.away) },
  };
  return checkDraw(draw);
}

/** WMv2 sampled world: points = 6·TD + XP + 2·2PT + 3·FG + 2·safety per side. */
export function worldModelWorldInvariants(world) {
  const v = [];
  for (const side of ["home", "away"]) {
    const t = world[side];
    const s = t?.scoring;
    if (!s) continue;
    const pts = 6 * ((s.offensiveTd ?? 0) + (s.nonOffensiveTd ?? 0)) + (s.extraPoints ?? 0) + 2 * (s.twoPointConversions ?? 0) + 3 * (s.fieldGoals ?? 0) + 2 * (s.safeties ?? 0);
    if (pts !== t.points) v.push(`${side} points ${t.points} ≠ scoring composition ${pts}`);
  }
  return v;
}

/**
 * BOX_SCORE_INCONSISTENT for each run whose validator returns violations.
 * @param {{ snapshot, surface, runs, validator: (run) => string[], correction, owner }} o
 */
export function boxScoreChecks({ snapshot, surface, runs, validator, correction, owner, sources = [] }) {
  if (typeof validator !== "function") throw new TypeError("boxScoreChecks needs a validator");
  const bad = [];
  for (const r of runs) {
    const v = validator(r);
    if (v.length) bad.push({ runIndex: r.runIndex ?? r.worldIndex ?? null, violations: v.slice(0, 5) });
  }
  if (!bad.length) return [];
  return [discrepancy({
    code: CODES.BOX_SCORE_INCONSISTENT, severity: SEVERITY.ERROR, snapshot, surface, sources,
    identity: { subjectId: "*", family: null, field: "invariants" }, expected: "0 violations", actual: `${bad.length} run(s)`,
    count: bad.length, examples: bad.slice(0, 3), correction, owner,
  })];
}

/* ─────────────────────────────── versions, lock, qualification, identity ─────────────────────────────── */

/**
 * MODEL_VERSION_MIX.
 *   · a supporting / shadow source built from inputs other than the official record's (`alignedWithOfficial` false)
 *     that a displayed surface reads;
 *   · a surface whose families come from more than one model without being the official set.
 */
export function versionMixFromSources({ snapshot, displayed = {}, owner }) {
  const out = [];
  for (const s of snapshot.sources ?? []) {
    if (s.alignedWithOfficial !== false) continue;
    const surfaces = displayed[s.role] ?? [];
    out.push(discrepancy({
      code: CODES.MODEL_VERSION_MIX, severity: surfaces.length ? SEVERITY.ERROR : SEVERITY.WARN, snapshot,
      surface: surfaces.length ? surfaces.join("+") : `${s.role.toLowerCase()}-source`,
      identity: { subjectId: snapshot.eventId, family: null, field: `${s.role}:inputRef` },
      sources: [s.path], expected: s.expectedInputRef ?? null, actual: s.inputRef,
      detail: `${s.modelVersion} built from ${s.inputRef ?? "unknown input"}; the official record is ${snapshot.sources[0]?.path} (${snapshot.sources[0]?.inputRef})`,
      correction: "Re-run the supporting model from the official snapshot's inputs before it is shown, or hide it until it is aligned (never show numbers from a superseded input).",
      owner: owner && typeof owner === "object" ? owner[s.role] ?? null : owner,
    }));
  }
  return out;
}

export function surfaceVersionMix({ snapshot, surface, families, officialVersions, correction, owner, sources = [] }) {
  const off = Object.entries(families).filter(([fam, v]) => officialVersions[fam] != null && v !== officialVersions[fam]);
  if (!off.length) return [];
  return [discrepancy({
    code: CODES.MODEL_VERSION_MIX, severity: SEVERITY.ERROR, snapshot, surface, sources,
    identity: { subjectId: "*", family: off.map(([f]) => f).sort().join(","), field: "modelVersion" },
    expected: Object.fromEntries(off.map(([f]) => [f, officialVersions[f]])), actual: Object.fromEntries(off), count: off.length,
    correction, owner,
  })];
}

/** POST_LOCK_REWRITE: an artifact presented as pregame that was written at/after lock, or whose freeze hash moved. */
export function postLockRewrites({ snapshot, artifacts, owner }) {
  const lock = Date.parse(snapshot.lockAt);
  const out = [];
  for (const a of artifacts) {
    const t = Date.parse(a.generatedAt ?? "");
    const late = Number.isFinite(t) && Number.isFinite(lock) && t >= lock;
    const moved = a.frozenHash != null && a.currentHash != null && a.frozenHash !== a.currentHash;
    if (!late && !moved) continue;
    out.push(discrepancy({
      code: CODES.POST_LOCK_REWRITE, severity: a.severity ?? SEVERITY.ERROR, snapshot, surface: a.surface,
      identity: { subjectId: a.subjectId ?? snapshot.eventId, family: a.family ?? null, field: moved ? "frozenHash" : "generatedAt" },
      sources: [a.path].filter(Boolean), expected: moved ? a.frozenHash : `< ${snapshot.lockAt}`, actual: moved ? a.currentHash : a.generatedAt,
      detail: a.detail ?? null,
      correction: a.correction ?? "A pregame record is write-once at lock: restore the frozen copy and append any later version as a new, post-lock-labelled record.",
      owner,
    }));
  }
  return out;
}

/** UNQUALIFIED_AS_QUALIFIED: a row presented as a qualified pick / ranked projection while its evaluation is not qualified. */
export function unqualifiedAsQualified({ snapshot, surface, rows, correction, owner, sources = [], severity = SEVERITY.ERROR }) {
  const bad = rows.filter((r) => r.presentedAs === "QUALIFIED" && r.qualified === false);
  if (!bad.length) return [];
  const byFam = new Map();
  for (const r of bad) { if (!byFam.has(r.family)) byFam.set(r.family, []); byFam.get(r.family).push(r); }
  return [...byFam.entries()].map(([family, list]) => discrepancy({
    code: CODES.UNQUALIFIED_AS_QUALIFIED, severity, snapshot, surface, sources,
    identity: { subjectId: "*", family, field: [...new Set(list.flatMap((r) => r.reasons ?? []))].sort().join(",") || "unqualified" },
    expected: "qualified", actual: "unqualified", count: list.length,
    examples: list.slice(0, 3).map((r) => ({ subjectId: r.subjectId, label: r.label ?? null, reasons: r.reasons ?? [] })), correction, owner,
  }));
}

/** NAME_JOIN at runtime: rows carrying a display name but no owner id (they could only be joined by name). */
export function nameKeyedRows({ snapshot, surface, rows, idField = "playerId", nameField = "name", correction, owner }) {
  const bad = rows.filter((r) => (r[idField] == null || r[idField] === "") && r[nameField]);
  if (!bad.length) return [];
  return [discrepancy({
    code: CODES.NAME_JOIN, severity: SEVERITY.ERROR, snapshot, surface,
    identity: { subjectId: "*", family: null, field: idField }, expected: "owner id", actual: "name only", count: bad.length,
    examples: bad.slice(0, 3).map((r) => ({ label: r[nameField] })), correction, owner,
  })];
}
