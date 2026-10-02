/**
 * SESSION 5 · FOUNDER DECISION D1 — the public parlay record is the PUBLISHED cards, and only them.
 *
 * Two populations were graded, and both are real:
 *   · the published cards — one card per risk level a day, the ladder /build shows. The lab ledger
 *     (parlays/lab-ledger.json, build-lab-ledger.mjs) settles exactly these, from their own receipts.
 *   · the candidate pool — every slip the optimizer generated and graded (risk-ladder `record`). It is
 *     research / model detail. It is never the track record, and never shown as one.
 *
 * Every public "this risk level so far" figure — the record that travels with a ladder card, the Lab's chance
 * meter, the builder's and the slip reader's band record — is read here, from the ledger's stream for that sport.
 * A band with no settled published card returns no record: "no settled card yet" is the state, never a
 * candidate figure standing in for one.
 */

export const PUBLISHED_CARDS = "PUBLISHED_CARDS";
export const PUBLIC_BANDS = Object.freeze(["low", "medium", "high", "longshot"]);

const isInt = (v) => Number.isInteger(v) && v >= 0;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * The published-card record for one sport's stream of the lab ledger, by band.
 * @param {any} ledger  parsed lab-ledger.json
 * @param {string} [sport]
 * @returns {null | { population: string, sport: string, since: string|null, settledDays: number,
 *   record: {wins:number, losses:number, pushes:number, hitRate:number|null, roi:number|null},
 *   byTier: Record<string, {wins:number, losses:number, pushes:number, hitRate:number|null, roi:number|null, population:string, since:string|null}> }}
 */
export function publishedBandRecord(ledger, sport = "mlb") {
  const stream = (Array.isArray(ledger?.streams) ? ledger.streams : []).find((s) => s?.id === sport);
  if (!stream) return null;
  const since = typeof ledger?.policy?.since === "string" ? ledger.policy.since : null;
  const shape = (r) => (r && isInt(r.wins) && isInt(r.losses)
    ? { wins: r.wins, losses: r.losses, pushes: isInt(r.pushes) ? r.pushes : 0, hitRate: num(r.hitRate), roi: num(r.roi), population: PUBLISHED_CARDS, since }
    : null);
  const byTier = {};
  for (const band of PUBLIC_BANDS) {
    const r = shape(stream.byTier?.[band]);
    if (r && r.wins + r.losses + r.pushes > 0) byTier[band] = r;
  }
  const record = shape(stream.record);
  if (!record || record.wins + record.losses + record.pushes === 0) return null;
  return { population: PUBLISHED_CARDS, sport, since, settledDays: isInt(stream.settledDays) ? stream.settledDays : 0, record, byTier };
}

/** True only for a record that says it counts the published cards. Anything else is not shown as a track record. */
export const isPublishedRecord = (r) => r?.population === PUBLISHED_CARDS;
