/**
 * OPS COMMIT GATE — should an auto-refresh run push its ops-state files? (writer-batching PROTOTYPE, 2026-10-17)
 *
 * WHY. auto-refresh pushes app/public/data/ops/{publication-slo,daily-owner-slo,heartbeat}.json on its own about
 * 3.7 times a day. None of those paths is a build input (vercel-ignore-build.sh NON_BUILD_INPUTS), so each push is an
 * Ignored-Build-Step skip at best — still billed, ≈16 CPU-min each per COST-001 §2.4 — and a full redundant
 * Production build when it lands while another build is in flight (VERCEL_GIT_PREVIOUS_SHA bound early). Measured
 * 2026-10-09 → 10-17: 30 solo pushes → 27 ignored, 2 completed builds, 1 canceled.
 *
 * WHAT MAY BE SKIPPED. A run whose only changes are clocks (checkedAt, lastRunAt, generatedAt), the tree head it
 * observed, and per-row detail that no public page and no decision reads. A run is PUSHED when anything a reader acts
 * on moved:
 *   - publication-slo.json: the five fields public pages read at build (lib/ops/read-publication-slo.ts: state,
 *     platformState, publishDeadlineUtc, date, reason) and every per-sport verdict (sports.<s>.state);
 *   - daily-owner-slo.json: date, state, and every owner's state;
 *   - heartbeat.json: ok, status, phase, date, message — and lastRunAt once it is FLOOR_HOURS older on main than in
 *     this run (the dead-man's switch: check-heartbeat.mjs alarms at 26 h, build-admin-status.mjs at 36 h; a 6 h floor
 *     keeps main's heartbeat at most ~6 h + one run interval old);
 *   - anything else the run staged (any path outside the three files) — never judged here.
 *
 * FAILS OPEN. A file missing on either side, an unparseable file, or an unexpected shape returns COMMIT. The gate can
 * only ever remove a push whose content is provably limited to the skippable leaves; it never rewrites content.
 */

export const OPS_FILES = Object.freeze({
  publicationSlo: "app/public/data/ops/publication-slo.json",
  dailyOwnerSlo: "app/public/data/ops/daily-owner-slo.json",
  heartbeat: "app/public/data/ops/heartbeat.json",
});

export const FLOOR_HOURS = 6;

const PUBLIC_SLO_FIELDS = ["state", "platformState", "publishDeadlineUtc", "date", "reason"];
const HEARTBEAT_FIELDS = ["ok", "status", "phase", "date", "message"];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function ownerKey(o, i) {
  return String(o?.id ?? o?.owner ?? o?.name ?? o?.workflow ?? i);
}

/**
 * @param {{ head: Record<string, string|null>, next: Record<string, string|null>, otherChangedPaths?: string[], floorHours?: number }} input
 *   head / next: raw file text keyed by OPS_FILES key (null = absent). head is main's version, next is this run's.
 * @returns {{ decision: "COMMIT"|"SKIP", reasons: string[] }}
 */
export function decideOpsCommit({ head, next, otherChangedPaths = [], floorHours = FLOOR_HOURS }) {
  const reasons = [];
  if (otherChangedPaths.length) return { decision: "COMMIT", reasons: [`non-ops path changed: ${otherChangedPaths.slice(0, 3).join(", ")}`] };

  const parsed = {};
  for (const k of Object.keys(OPS_FILES)) {
    const a = head?.[k], b = next?.[k];
    if (a === b) { parsed[k] = null; continue; } // unchanged (including both absent)
    if (a == null || b == null) return { decision: "COMMIT", reasons: [`${OPS_FILES[k]} added or removed`] };
    try { parsed[k] = { a: JSON.parse(a), b: JSON.parse(b) }; }
    catch { return { decision: "COMMIT", reasons: [`${OPS_FILES[k]} unparseable — failing open`] }; }
  }

  const p = parsed.publicationSlo;
  if (p) {
    for (const f of PUBLIC_SLO_FIELDS) if (!same(p.a?.[f], p.b?.[f])) reasons.push(`publication-slo.${f}`);
    const sa = p.a?.sports ?? {}, sb = p.b?.sports ?? {};
    for (const s of new Set([...Object.keys(sa), ...Object.keys(sb)])) if (!same(sa[s]?.state, sb[s]?.state)) reasons.push(`publication-slo.sports.${s}.state`);
  }

  const d = parsed.dailyOwnerSlo;
  if (d) {
    for (const f of ["date", "state"]) if (!same(d.a?.[f], d.b?.[f])) reasons.push(`daily-owner-slo.${f}`);
    const oa = Array.isArray(d.a?.owners) ? d.a.owners : null, ob = Array.isArray(d.b?.owners) ? d.b.owners : null;
    if (!oa || !ob) { if (!same(d.a?.owners, d.b?.owners)) return { decision: "COMMIT", reasons: ["daily-owner-slo.owners has an unexpected shape — failing open"] }; }
    else {
      const ma = new Map(oa.map((o, i) => [ownerKey(o, i), o?.state])), mb = new Map(ob.map((o, i) => [ownerKey(o, i), o?.state]));
      for (const k of new Set([...ma.keys(), ...mb.keys()])) if (!same(ma.get(k), mb.get(k))) reasons.push(`daily-owner-slo.owners[${k}].state`);
    }
  }

  const h = parsed.heartbeat;
  if (h) {
    for (const f of HEARTBEAT_FIELDS) if (!same(h.a?.[f], h.b?.[f])) reasons.push(`heartbeat.${f}`);
    const ta = Date.parse(h.a?.lastRunAt ?? ""), tb = Date.parse(h.b?.lastRunAt ?? "");
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) reasons.push("heartbeat.lastRunAt unparseable — failing open");
    else if ((tb - ta) / 3_600_000 >= floorHours) reasons.push(`heartbeat floor: main's heartbeat would be ${((tb - ta) / 3_600_000).toFixed(1)} h old (≥ ${floorHours} h)`);
  }

  if (!p && !d && !h) return { decision: "SKIP", reasons: ["nothing changed"] };
  return reasons.length ? { decision: "COMMIT", reasons } : { decision: "SKIP", reasons: ["only clocks, tree head and per-row detail changed"] };
}
