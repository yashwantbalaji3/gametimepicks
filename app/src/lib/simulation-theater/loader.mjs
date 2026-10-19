/**
 * SIMULATION THEATER V2 · LOADER — the only I/O in the theater library. Server side, build time only.
 *
 * Reads the committed shadow receipts under data/internal/research/nfl/sim-v2/shadow/ (READ ONLY — receipts are
 * write-once and never modified here), resolves the receipt of record per event with the SAME rule the public
 * simulation page uses (latest generated before kickoff, fail closed: public-receipt.mjs), and adapts it.
 */
import { readShadowReceipts, simulationOfRecord } from "../sports/nfl/sim-v2/public-receipt.mjs";
import { adaptReceipt } from "./adapter-nfl-sim-v2.mjs";

/**
 * Development fixtures (spec S12: a FIXED list of ≤3 event ids, so a dev build adds at most three pages).
 *   401873008  WSH @ SF — the spec's reference receipt: run #428 hits both quarter-boundary cases (drives 10 and 15)
 *              and its drive 19 is "end of regulation".
 *   401873005  BUF @ LV — a LOW_SCORING run with an ENGINE_CLOCK_RUNOFF drive (1,602 s on 3 plays) and an overtime
 *              MEDIAN_LIKE run alongside the OVERTIME pick.
 *   401873006  LAC @ KC — two kinds share one run (UPSET = OVERTIME), so the selector shows a merged chip (S5).
 * Every fixture carries an OVERTIME representative. A fixture whose receipt of record fails to load or validate is
 * dropped (never substituted).
 *
 * RE-PINNED 2026-10-19 (integration onto main 9b6e923c1a). The notes above describe the receipts the prototype was built
 * on (2026-10-17). The receipt of RECORD moves whenever the shadow job writes a newer pre-kickoff receipt; on main it is
 * now 401873008 → 2026-10-19/…93e33ba709b93f85 (default run #48, no run #428), 401873005 → 2026-10-18/…3951d5992642d372
 * (UPSET = OVERTIME share run #16, a merged chip) and 401873006 → 2026-10-18/…886fa90906706f3b (five distinct runs).
 * Tests that assert on specific runs pin the write-once 2026-10-17 files by path; the e2e spec derives its expectations
 * from whatever record this loader resolves.
 */
export const FIXTURE_EVENT_IDS = Object.freeze(["401873008", "401873005", "401873006"]);
export const MAX_FIXTURES = 3;

/** All receipts on disk, adapted. For tests and reports. */
export function adaptAllReceipts(repoRoot) {
  return readShadowReceipts(repoRoot).map(({ file, receipt }) => ({ file, ...adaptReceipt(receipt, { file }) }));
}

/**
 * The theater for one event's receipt of record.
 * @returns {{ eventId: string, file: string|null, ok: boolean, error: {code:string, reason:string}|null, manifest: object|null, showable: boolean }}
 */
export function loadTheater(repoRoot, eventId, entries = null) {
  const all = entries ?? readShadowReceipts(repoRoot);
  const rec = simulationOfRecord(all, eventId);
  if (!rec) return { eventId: String(eventId), file: null, ok: false, error: { code: "NO_RECEIPT", reason: "no receipt generated before kickoff" }, manifest: null, showable: false };
  const a = adaptReceipt(rec.receipt, { file: rec.file });
  return { eventId: String(eventId), file: rec.file, ok: a.ok, error: a.ok ? null : a.error, manifest: a.manifest, showable: rec.showable };
}

/** True when the fixture's receipt of record adapts and every one of its samples validates. */
export function fixtureUsable(t) {
  return Boolean(t?.ok && t.showable && t.manifest?.samples?.length && t.manifest.samples.every((s) => s.validation.ok));
}

/** The fixture ids that are usable right now, in FIXTURE_EVENT_IDS order, capped at MAX_FIXTURES. */
export function usableFixtures(repoRoot) {
  const entries = readShadowReceipts(repoRoot);
  return FIXTURE_EVENT_IDS.filter((id) => fixtureUsable(loadTheater(repoRoot, id, entries))).slice(0, MAX_FIXTURES);
}
