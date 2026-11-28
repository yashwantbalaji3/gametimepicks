/**
 * FORECAST VERSIONING (P0D, docs/FORECAST_VERSIONING_DESIGN.md) · the append-only version chain, shared NBA / NFL. PURE:
 * no fs, no clock — every instant comes from the inputs, so the same inputs give byte-identical output.
 *
 * A published forecast is NEVER edited. A changed forecast is a new version appended to its game's chain
 * (`app/public/data/<sport>/forecast-versions/<date>/<eventId>.json`, schema gtp.forecast-versions@1). "Current" and
 * "version of record" are DERIVED from the chain by one rule each — never a pointer anyone can set.
 *
 * NOT WIRED: no scheduled job writes chains, no page or social builder reads them, and the grading rule is unchanged
 * (the frozen forecast stays the version of record). Switching grading to `versionOfRecord` is a separate release-gated
 * founder decision (§7).
 */
export const FORECAST_VERSIONS_SCHEMA = "gtp.forecast-versions@1";
export const FORECAST_VERSIONS_REL = (sport, date, eventId) => `app/public/data/${sport}/forecast-versions/${date}/${eventId}.json`;
/** §5: no version at or after start − 15 min (one 5-min poll tick + a ~1-min re-run + page/console pickup, with margin). */
export const VERSION_CUTOFF_MIN = 15;
/** §6: 15-min coalescing window — 8 of 11 same-game follow-on material events in the committed NBA history fell within it. */
export const COALESCE_WINDOW_MIN = 15;
export const TRIGGERS = Object.freeze(["INITIAL", "MATERIAL_STALE_EVENT"]);

const t = (iso) => (typeof iso === "string" ? Date.parse(iso) : NaN);
const cutoffMs = (chain) => t(chain.startUtc) - VERSION_CUTOFF_MIN * 60000;

/**
 * v1 by BACK-REFERENCE: today's frozen lane game / NFL board is version 1, its versionId the sha the stale flags already
 * record as `forecastSha256`, so nothing frozen moves.
 * @param a { sport, date, eventId, startUtc, forecastSha256, frozenAt, method, inputHashes?, payloadRef }
 */
export function initialChain({ sport, date, eventId, startUtc, forecastSha256, frozenAt, method, inputHashes = {}, payloadRef }) {
  if (!/^[0-9a-f]{64}$/.test(forecastSha256 ?? "")) throw new Error("initialChain: forecastSha256 must be a sha256 hex");
  return {
    schema: FORECAST_VERSIONS_SCHEMA, sport, date, eventId: String(eventId), startUtc,
    versions: [{ version: 1, versionId: forecastSha256, supersedes: null, createdAt: frozenAt, approvedAt: frozenAt, method, inputHashes, trigger: { type: "INITIAL", answers: [] }, payloadRef, state: "PUBLISHED" }],
  };
}

/**
 * The CURRENT version at instant `atIso`: the highest version approved at or before it. When that is WITHHELD there is
 * NO current published forecast ({ version: null, withheld }) — never an older number shown as current.
 */
export function currentVersion(chain, atIso) {
  const at = t(atIso);
  const live = (chain?.versions ?? []).filter((v) => t(v.approvedAt) <= at);
  const top = live.at(-1);
  if (!top) return { version: null, withheld: null };
  if (top.state === "WITHHELD") return { version: null, withheld: { version: top.version, reason: top.reason, answers: top.trigger.answers } };
  return { version: top, withheld: null };
}

/** §7: the version of record — the current version at the cutoff (start − 15 min). Null ⇒ excluded from the grade, with the reason. */
export function versionOfRecord(chain) {
  return currentVersion(chain, new Date(cutoffMs(chain)).toISOString());
}

/** The stale-flags recovery input (detectClearEvents' `currentVersions`): { [eventId]: { forecastSha256, approvedAt } } at `atIso`. */
export function currentVersionsMap(chains, atIso) {
  const out = {};
  for (const c of chains) { const { version } = currentVersion(c, atIso); if (version) out[c.eventId] = { forecastSha256: version.versionId, approvedAt: version.approvedAt }; }
  return out;
}

/**
 * §6 coalescing: may a candidate be built now for the game's unanswered material events? Ready when the window has
 * passed since the LAST such event, or a later capture has arrived with no further material event (the caller computes
 * `pending` through `latestCaptureAt`). The candidate then answers every pending event at once.
 * @param a { pending: stale-flag events (game flags, unanswered), latestCaptureAt, nowIso }
 */
export function coalesceReady({ pending, latestCaptureAt, nowIso }) {
  if (!pending?.length) return false;
  const last = Math.max(...pending.map((e) => t(e.detectedAt)));
  return t(nowIso) - last >= COALESCE_WINDOW_MIN * 60000 || t(latestCaptureAt) > last;
}

/** Keys already answered by some version of the chain (published or withheld). */
export const answeredKeys = (chain) => new Set((chain?.versions ?? []).flatMap((v) => v.trigger?.answers ?? []));

/**
 * APPEND (§4–§6). Returns { chain, appended: boolean, reason }. The chain is never edited; a refusal or no-op returns the
 * SAME object. Refused / skipped, in order:
 *   CUTOFF            approvedAt at or after start − 15 min (the last version before the cutoff is final)
 *   NOT_VALIDATED     a PUBLISHED candidate whose method is not VALIDATED (experimental methods never enter the official
 *                     chain; a method CHANGE is a founder decision and never comes through here)
 *   ALREADY_ANSWERED  every stale-flag key the candidate answers is answered by an existing version
 *   IDENTICAL         a PUBLISHED candidate whose versionId equals the current one
 *   CEILING           more than 1 + (distinct material events answered, this one included) PUBLISHED versions, or more
 *                     WITHHELD records than events — stops a flapping-status loop, not legitimate refreshes
 *   ORDER             approvedAt earlier than the newest version's, or createdAt after approvedAt
 * @param candidate { state: "PUBLISHED"|"WITHHELD", versionId? (PUBLISHED), reason? (WITHHELD), createdAt, approvedAt,
 *                    method?, inputHashes?, answers: stale-flag keys, payloadRef? }
 */
export function appendVersion(chain, candidate) {
  const no = (reason) => ({ chain, appended: false, reason });
  const prev = chain.versions.at(-1);
  if (!(t(candidate.approvedAt) < cutoffMs(chain))) return no("CUTOFF");
  if (!(t(candidate.createdAt) <= t(candidate.approvedAt)) || t(candidate.approvedAt) < t(prev.approvedAt)) return no("ORDER");
  if (candidate.state === "PUBLISHED" && !/\bVALIDATED$/.test(candidate.method?.status ?? "")) return no("NOT_VALIDATED");
  if (candidate.state === "WITHHELD" && !candidate.reason) throw new Error("appendVersion: a WITHHELD version needs a reason");
  if (!["PUBLISHED", "WITHHELD"].includes(candidate.state)) throw new Error(`appendVersion: unknown state ${candidate.state}`);
  const answers = [...new Set(candidate.answers ?? [])].sort();
  const answered = answeredKeys(chain);
  const fresh = answers.filter((k) => !answered.has(k));
  /* a PUBLISHED re-run may answer the keys its own WITHHELD predecessor already named */
  const reAnswer = candidate.state === "PUBLISHED" && prev.state === "WITHHELD" && answers.length > 0 && answers.every((k) => answered.has(k));
  if (!fresh.length && !reAnswer) return no("ALREADY_ANSWERED");
  if (candidate.state === "PUBLISHED") {
    const cur = [...chain.versions].reverse().find((v) => v.state === "PUBLISHED");
    if (cur && cur.versionId === candidate.versionId && prev.state === "PUBLISHED") return no("IDENTICAL");
    if (!/^[0-9a-f]{64}$/.test(candidate.versionId ?? "")) throw new Error("appendVersion: a PUBLISHED version needs a sha256 versionId");
  }
  const materialEvents = new Set([...answered, ...answers]).size;
  const count = (s) => chain.versions.filter((v) => v.state === s).length + (candidate.state === s ? 1 : 0);
  if (count("PUBLISHED") > 1 + materialEvents || count("WITHHELD") > materialEvents) return no("CEILING");
  const record = {
    version: prev.version + 1,
    versionId: candidate.state === "PUBLISHED" ? candidate.versionId : null,
    supersedes: prev.versionId ?? chain.versions.findLast((v) => v.versionId)?.versionId ?? null,
    createdAt: candidate.createdAt, approvedAt: candidate.approvedAt,
    method: candidate.method ?? null, inputHashes: candidate.inputHashes ?? {},
    trigger: { type: "MATERIAL_STALE_EVENT", answers },
    payloadRef: candidate.payloadRef ?? null,
    state: candidate.state,
    ...(candidate.state === "WITHHELD" ? { reason: candidate.reason } : {}),
  };
  return { chain: { ...chain, versions: [...chain.versions, record] }, appended: true, reason: null };
}
