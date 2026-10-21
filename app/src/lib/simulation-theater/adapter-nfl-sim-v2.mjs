/**
 * SIMULATION THEATER V2 · ADAPTER — one `nfl-drive-sim-v2` receipt → TheaterManifest + TheaterSample[] (spec §4.2). Pure.
 *
 * Every field maps to a recorded receipt field or a stated derivation; anything the receipt does not carry stays
 * null WITH A REASON (listed in `unavailableFields`, rendered in the Evidence tab). Nothing from any other engine
 * (World Model V2 included) is ever read or spliced in: the identity check refuses it up front.
 *
 * Output is plain JSON (no functions, no Dates) so a server component can pass it to the client island as props.
 */
import {
  KIND_LABEL, KIND_ORDER, KIND_RULE, SCORING_RESULTS, displayPeriodAtStart, outcomeLabel, periodAtEnd, periodClockOf, quarterOf,
} from "./format.mjs";
import { SCENE_VERSION, lanesFor, sceneSeedOf } from "./scene-rng.mjs";
import { checkEngineIdentity, validateRepresentatives, validateRun } from "./validate.mjs";

export const THEATER_SAMPLE_VERSION = "theater-sample@1";

const NOT_RECORDED = "not recorded in nfl-drive-run@1";
const NOT_MODELLED = "not modelled by nfl-drive-sim-v2";
const NOT_STORED = "not stored in simulation-receipt@2";

/** Every null the theater carries, with its reason (spec §4.2 `unavailableFields`). */
export const UNAVAILABLE_FIELDS = Object.freeze([
  { field: "participants (passer, rusher, scorer per drive)", reason: NOT_RECORDED },
  { field: "team stats for this run", reason: NOT_RECORDED },
  { field: "player stats for this run", reason: NOT_RECORDED },
  { field: "interception vs fumble on a turnover or defensive touchdown", reason: NOT_RECORDED },
  { field: "individual plays, down and distance", reason: NOT_MODELLED },
  { field: "penalties and timeouts", reason: NOT_MODELLED },
  { field: "kick and punt landing and return spots", reason: NOT_MODELLED },
  { field: "OT opening coin toss", reason: NOT_RECORDED },
  { field: "selection distance of the representative run", reason: NOT_STORED },
  { field: "forecast receipt hash", reason: NOT_STORED },
  { field: "engine commit", reason: NOT_STORED },
  { field: "input cutoff timestamp (only the availability snapshot id exists)", reason: NOT_STORED },
]);

const side = (o) => (o === 0 ? "home" : "away");

/** One recorded drive → one DRIVE_SUMMARY event with derived fields (spec §4.2 table). */
function adaptDrive(d, i, prevScore, notesByDrive) {
  const inOT = d.q === 5;
  const clockEnd = Math.max(0, d.clockStart - d.seconds);
  const period = inOT ? 5 : displayPeriodAtStart(d.clockStart);
  const periodEnd = inOT ? 5 : periodAtEnd(clockEnd);
  const fieldEnd = d.result === "TD" ? 0 : d.result === "SAFETY" ? 100 : d.startYardsToGoal - d.netYards;
  const scoreBefore = { home: prevScore[0], away: prevScore[1] };
  const scoreAfter = { home: d.score[0], away: d.score[1] };
  const delta = { home: scoreAfter.home - scoreBefore.home, away: scoreAfter.away - scoreBefore.away };
  const scoringSide = delta.home > 0 ? "home" : delta.away > 0 ? "away" : null;
  return {
    index: i,
    kind: "DRIVE_SUMMARY",
    engineQ: d.q, // audit only; never displayed (S1)
    inOT,
    period,
    periodClockStart: periodClockOf(d.clockStart, period),
    periodEnd,
    periodClockEnd: periodClockOf(clockEnd, periodEnd),
    clockStart: d.clockStart,
    clockEnd,
    scorePeriod: inOT ? 5 : quarterOf(clockEnd),
    offense: side(d.offense),
    fieldStart: d.startYardsToGoal,
    fieldEnd,
    plays: d.plays,
    netYards: d.netYards,
    seconds: d.seconds,
    outcome: d.result,
    outcomeLabel: outcomeLabel(d.result, { inOT, clockEnd }),
    scoring: SCORING_RESULTS.includes(d.result) && scoringSide !== null,
    scoringSide,
    delta,
    scoreBefore,
    scoreAfter,
    notes: notesByDrive.get(i) ?? [],
    participants: null,
  };
}

/**
 * The receipt-level identity and provenance block, shared by every sample.
 */
function manifestHead(r, file) {
  return {
    receiptId: r.simulationReceiptId,
    receiptHash: r.artifactHash ?? null,
    file: file ?? null,
    eventId: String(r.eventId),
    eventStart: r.eventStart ?? null,
    generatedAt: r.generatedAt ?? null,
    engine: r.simulationEngine,
    engineVersion: r.simulationEngineVersion ?? null,
    receiptSchema: r.schemaVersion,
    runSchema: r.runSchemaVersion,
    promotionState: r.promotionState ?? null,
    status: r.promotionState === "SHADOW" || r.promotionState === "EXPERIMENTAL" ? "experimental" : String(r.promotionState ?? "unknown").toLowerCase(),
    runCount: r.runCount,
    teams: {
      home: { abbr: r.home?.abbr ?? "HOME", name: r.home?.name ?? null },
      away: { abbr: r.away?.abbr ?? "AWAY", name: r.away?.name ?? null },
    },
    seed: { baseSeed: r.baseSeed ?? null, seedStrategy: r.seedStrategy ?? null },
    paramsSha256: r.params?.sha256 ?? null,
    availabilitySnapshotId: r.availabilitySnapshotId ?? null,
    inputCutoff: r.availabilitySnapshotId ?? null,
    forecastRef: r.inputSnapshotIds?.forecastReceipt ?? null,
    forecastHash: null,
    marketUse: r.marketUse ?? null,
  };
}

/** Batch context for the Distribution tab: counts over all runs of THIS receipt, never a forecast. */
function batchSummary(r) {
  const a = r.aggregate ?? {};
  const slim = (h) => (Array.isArray(h) ? h.map((x) => ({ value: x.value, probability: x.probability })) : []);
  return {
    runCount: r.runCount,
    winProbability: a.winProbability ?? null,
    overtimeProbability: a.overtimeProbability ?? null,
    total: a.total ?? null,
    margin: a.margin ?? null,
    totalHistogram: slim(a.totalHistogram),
    marginHistogram: slim(a.marginHistogram),
  };
}

/**
 * Adapt one representative run. Validation runs here; a failing sample keeps its identity and its reasons but no
 * events, so the UI can only render an "unavailable" state for it.
 */
export function adaptSample(r, rep, { sharedKinds = [] } = {}) {
  const v = validateRun(rep);
  const notesByDrive = new Map();
  for (const n of v.notes) if (n.drive != null) notesByDrive.set(n.drive, [...(notesByDrive.get(n.drive) ?? []), { code: n.code, detail: n.detail }]);
  const kinds = [rep.kind, ...sharedKinds.filter((k) => k !== rep.kind)];
  const seed = sceneSeedOf(r.simulationReceiptId, rep.runIndex);
  const base = {
    version: THEATER_SAMPLE_VERSION,
    receiptId: r.simulationReceiptId,
    runIndex: rep.runIndex,
    kind: rep.kind,
    kinds,
    sharedKinds: kinds.slice(1),
    label: rep.label,
    kindLabel: KIND_LABEL[rep.kind] ?? rep.kind,
    selectionRules: kinds.map((k) => ({ kind: k, text: KIND_RULE[k] ?? "Selection rule not recognised." })),
    selectionDistance: null,
    finalScore: rep.final ? { home: rep.final.home, away: rep.final.away, overtime: Boolean(rep.final.overtime) } : null,
    periodScores: rep.quarters ? { home: [...rep.quarters.home], away: [...rep.quarters.away] } : null,
    validation: { ok: v.ok, errors: v.errors, notes: v.notes },
    scene: { geometryClass: "illustrative", sceneVersion: SCENE_VERSION, sceneSeed: seed },
  };
  if (!v.ok) return { ...base, events: [], lanes: [] };
  let prev = [0, 0];
  const events = rep.drives.map((d, i) => {
    const ev = adaptDrive(d, i, prev, notesByDrive);
    prev = d.score;
    return ev;
  });
  return { ...base, events, lanes: lanesFor(seed, events.length) };
}

/**
 * Adapt a whole receipt.
 * @returns {{ ok: true, manifest: object } | { ok: false, error: { code: string, reason: string }, manifest: object | null }}
 */
export function adaptReceipt(r, { file = null } = {}) {
  const identity = checkEngineIdentity(r, { file });
  if (identity) return { ok: false, error: identity, manifest: null };
  const head = manifestHead(r, file);
  const reps = Array.isArray(r.representativeRuns) ? r.representativeRuns : [];
  const repCheck = validateRepresentatives(reps);
  if (!repCheck.ok) {
    return { ok: false, error: { code: repCheck.errors[0].code, reason: repCheck.errors.map((e) => e.detail).join("; ") }, manifest: { ...head, samples: [], chips: [], sharedRuns: [] } };
  }
  const sharedByRun = new Map(repCheck.notes.map((n) => [n.runIndex, n.kinds]));
  const ordered = [...reps].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const samples = ordered.map((rep) => adaptSample(r, rep, { sharedKinds: sharedByRun.get(rep.runIndex) ?? [] }));
  // One chip per distinct run (S5): the first kind in display order owns the chip, the others ride along.
  const chips = [];
  const seenRun = new Set();
  samples.forEach((s, sampleIndex) => {
    if (seenRun.has(s.runIndex)) return;
    seenRun.add(s.runIndex);
    const kinds = samples.filter((x) => x.runIndex === s.runIndex).map((x) => x.kind);
    chips.push({ runIndex: s.runIndex, sampleIndex, kinds, available: s.validation.ok });
  });
  const absentKinds = KIND_ORDER.filter((k) => !reps.some((x) => x.kind === k));
  return {
    ok: true,
    manifest: {
      ...head,
      samples,
      chips,
      sharedRuns: repCheck.notes.map((n) => ({ runIndex: n.runIndex, kinds: n.kinds })),
      absentKinds,
      batch: batchSummary(r),
      unavailableFields: UNAVAILABLE_FIELDS,
    },
  };
}
