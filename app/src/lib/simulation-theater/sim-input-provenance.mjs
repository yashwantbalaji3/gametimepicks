/**
 * SIMULATION INPUT PROVENANCE AND FRESHNESS (founder rule, 2026-11-02). Pure: parsed documents in, plain JSON out.
 *
 * "Stale simulations are never represented as current. Record simulation input versions, assumptions and timestamps."
 *
 * A sim-v2 receipt names the forecast revision it was built on (`inputSnapshotIds.forecastReceipt`). The current official
 * revision is the forecast of record (`forecastOfRecord`, latest receipt strictly before kickoff), the same owner rule the
 * official snapshot uses. They are compared BY REVISION FILE, not by inputHash or by the numbers: two revisions can share an
 * inputHash and print different totals (401873036: 2026-11-01 total 45, 2026-11-02 total 46, both inputHash 319a691b…).
 *
 *   CURRENT            the sim was built on the current official revision
 *   EARLIER_FORECAST   it was built on another revision: labelled, with its input version and timestamp
 *   UNVERIFIED         the comparison cannot be made (no record, no named input, or the page's official accessor and the
 *                      receipts name different revisions). Treated exactly like EARLIER_FORECAST: never shown as current.
 *
 * Only CURRENT may be the Theater's central run (official-representative.mjs). Nothing here deletes, rewrites or re-selects
 * a run, and nothing here changes which forecast is official.
 */
import { forecastOfRecord } from "../forecast-ledger/adapters/nfl.mjs";

export const SIM_PROVENANCE_SCHEMA = "gtp.simulation-input-provenance@1";
export const SIM_FRESHNESS = Object.freeze({ CURRENT: "CURRENT", EARLIER_FORECAST: "EARLIER_FORECAST", UNVERIFIED: "UNVERIFIED" });
export const SIM_FRESHNESS_LABEL = Object.freeze({
  CURRENT: "Built on the current Official Forecast",
  EARLIER_FORECAST: "Built on an earlier forecast",
  UNVERIFIED: "Not verified against the current Official Forecast",
});
export const SIM_INPUT_REFUSAL = "SIM_INPUT_NOT_CURRENT";
export const HYPOTHETICAL_LABEL = "Hypothetical simulation · not the Official Forecast";

const RECEIPTS_PREFIX = "data/internal/nfl/forecast-receipts/";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** "data/internal/nfl/forecast-receipts/2026-11-01/401873036.json" → "2026-11-01/401873036". */
export const revisionId = (file) => (file ? String(file).replace(RECEIPTS_PREFIX, "").replace(/\.json$/, "") : null);

const revisionOf = (file, receipt) => ({
  file,
  revision: revisionId(file),
  generatedAt: receipt?.generatedAt ?? null,
  inputHash: receipt?.model?.inputHash ?? null,
  modelVersion: receipt?.model?.id ? `${receipt.model.id}@v${receipt.model.version ?? "?"}` : null,
});

/** Every committed revision of the event, by file. @param {Array<{file:string, receipt:object}>} receipts */
export function forecastRevisions(receipts) {
  return Object.fromEntries((receipts ?? []).map((r) => [r.file, revisionOf(r.file, r.receipt)]));
}

/**
 * The current official revision, or null. `snapshot` is what the page actually prints: if it was not built from this
 * revision the two sources disagree, and nothing can be called current.
 */
export function nflOfficialRevision(receipts, eventId, snapshot = null) {
  const id = String(eventId);
  const rec = forecastOfRecord((receipts ?? []).filter((r) => String(r?.receipt?.providerEventId) === id)).get(id);
  if (!rec) return null;
  if (snapshot && Date.parse(snapshot.generatedAt) !== Date.parse(rec.receipt.generatedAt)) return null;
  return revisionOf(rec.file, rec.receipt);
}

/** "injuries@A+rosters@B" → { injuries: A, rosters: B }. */
function availabilityAsOf(id) {
  const out = { injuries: null, rosters: null };
  for (const part of String(id ?? "").split("+")) {
    const at = part.indexOf("@");
    if (at > 0 && part.slice(0, at) in out) out[part.slice(0, at)] = part.slice(at + 1);
  }
  return out;
}

const atSuffix = (ref) => { const s = String(ref ?? ""); const at = s.lastIndexOf("@"); return at >= 0 ? s.slice(at + 1) : null; };

/** What this run of the engine assumed, in words. Every number comes from the receipt. */
function assumptionsOf(r) {
  const c = r.calibration?.anchors ?? {};
  const w = r.params?.trainingWindow ?? {};
  const out = [];
  if (isNum(c.home) && isNum(c.away)) {
    out.push(`Team scoring levels come from the input forecast: ${r.away?.abbr} ${c.away} and ${r.home?.abbr} ${c.home} points (total ${c.home + c.away}, margin ${c.home - c.away}).`);
  }
  out.push("Player roles come from a role-share table and availability from the injury and roster captures timed here; the official player projections come from the player board, a different model.");
  if (isNum(w.first) && isNum(w.last)) out.push(`Drive and play rates were fit to the ${w.first}–${w.last} seasons.`);
  if (String(r.marketUse ?? "").startsWith("NOT_AN_INPUT")) out.push("Betting markets are not an input.");
  return out;
}

/**
 * @param {{ receipt: object, official: object|null, revisions?: Record<string, object> }} o
 *   official   nflOfficialRevision output (null = cannot be established)
 *   revisions  forecastRevisions output (gives the input revision its timestamp and hash)
 */
export function simInputProvenance({ receipt: r, official = null, revisions = {} }) {
  const inputFile = r?.inputSnapshotIds?.forecastReceipt ?? null;
  const input = inputFile ? revisions[inputFile] ?? null : null;
  const state = !official || !inputFile ? SIM_FRESHNESS.UNVERIFIED : inputFile === official.file ? SIM_FRESHNESS.CURRENT : SIM_FRESHNESS.EARLIER_FORECAST;
  const avail = availabilityAsOf(r?.inputSnapshotIds?.availability ?? r?.availabilitySnapshotId);
  return {
    schema: SIM_PROVENANCE_SCHEMA,
    eventId: String(r?.eventId ?? ""),
    state,
    current: state === SIM_FRESHNESS.CURRENT,
    label: SIM_FRESHNESS_LABEL[state],
    role: "HYPOTHETICAL",
    simulation: {
      receiptId: r?.simulationReceiptId ?? null,
      engine: r?.simulationEngine ?? null,
      engineVersion: r?.simulationEngineVersion ?? null,
      promotionState: r?.promotionState ?? null,
      runCount: r?.runCount ?? null,
      baseSeed: r?.baseSeed ?? null,
      generatedAt: r?.generatedAt ?? null,
      eventStart: r?.eventStart ?? null,
    },
    input: {
      forecastRevision: revisionId(inputFile),
      forecastGeneratedAt: input?.generatedAt ?? null,
      forecastInputHash: input?.inputHash ?? null,
      forecastModel: r?.modelVersion?.forecastModel ?? input?.modelVersion ?? null,
      anchors: { home: r?.calibration?.anchors?.home ?? null, away: r?.calibration?.anchors?.away ?? null },
      roleSharesAsOf: atSuffix(r?.inputSnapshotIds?.roleShares),
      injuriesAsOf: avail.injuries,
      rostersAsOf: avail.rosters,
      paramsSha256: r?.params?.sha256 ?? r?.inputSnapshotIds?.params ?? null,
    },
    official: official ? { forecastRevision: official.revision, generatedAt: official.generatedAt, inputHash: official.inputHash, modelVersion: official.modelVersion } : null,
    assumptions: assumptionsOf(r ?? {}),
  };
}
