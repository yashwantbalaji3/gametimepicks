/**
 * THE BOUT PAGE'S FIGHTER COMPARISON (UFC-001 UX Phase B, 2026-10-10). Pure: card artifact + tale-of-the-tape index in,
 * rows out.
 *
 * Only fields with a verified source appear, and every row names its source and its "as of" date:
 *  - age at the event, height, reach, stance — ESPN tale of the tape (self-reported, static; `tale-of-tape.mjs`);
 *  - pro record — ESPN's record on the card artifact, as of the card build;
 *  - UFC tracked record and last 5 — the fight corpus the model is fitted on, as of its last event.
 * A missing value is `display: null` with the reason. The page prints "—" and the reason; it never fills a gap.
 *
 * Deliberately absent: strikes per minute, striking accuracy or defence, takedown and submission averages. There is no
 * reliable point-in-time source for them yet (docs/ufc/UFC-001-UX-PLAN.md, data table). A guard pins their absence.
 */
import { easternDate, tapeFor, TOTT_SOURCE_LABEL } from "./tale-of-tape.mjs";

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (iso) => (typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : null);

function trackedRecord(f) {
  const p = f?.profile;
  if (p && typeof p.bouts === "number") {
    if (p.bouts === 0) return { display: "No tracked bouts", reason: null };
    const w = p.record?.wins, l = p.record?.losses;
    if (typeof w === "number" && typeof l === "number") return { display: `${w}-${l} (${plural(p.bouts, "bout")})`, reason: null };
  }
  const n = f?.priorBoutsInCorpus;
  return {
    display: null,
    reason: typeof n === "number"
      ? `This card carries no win-loss breakdown for this fighter (${plural(n, "tracked bout")})`
      : "This card carries no tracked record for this fighter",
  };
}

function lastFive(f) {
  const p = f?.profile;
  if (p && p.bouts === 0) return { display: null, reason: "No tracked UFC bouts" };
  const xs = Array.isArray(p?.last5) ? p.last5 : null;
  if (!xs || !xs.length) return { display: null, reason: "This card carries no recent tracked bouts for this fighter" };
  return { display: xs.map((b) => (b.result === "W" ? "W" : "L")).join(" "), reason: null };
}

/**
 * @param {{ bout: any, card: any, tott: ReturnType<import("./tale-of-tape.mjs").indexTaleOfTheTape> }} args
 * @returns {Array<{ key: string, label: string, source: string, asOf: string | null, red: { display: string | null, reason: string | null }, blue: { display: string | null, reason: string | null } }>}
 */
export function comparisonRows({ bout, card, tott }) {
  const eventDate = easternDate(bout?.startUtc);
  const tr = tapeFor(tott, bout?.red?.athleteId, eventDate);
  const tb = tapeFor(tott, bout?.blue?.athleteId, eventDate);
  const tottAsOf = tott?.asOf ?? null;
  const cardAsOf = day(card?.generatedAt);
  const corpusAsOf = day(card?.model?.corpus?.to);
  const pick = (m) => ({ display: m.display, reason: m.display == null ? m.reason : null });
  const espnRecord = (f) => (f?.record ? { display: f.record, reason: null } : { display: null, reason: "ESPN lists no record for this fighter on the card" });

  return [
    { key: "age", label: "Age at the event", source: `${TOTT_SOURCE_LABEL}, date of birth`, asOf: tottAsOf, red: pick(tr.age), blue: pick(tb.age) },
    { key: "height", label: "Height", source: TOTT_SOURCE_LABEL, asOf: tottAsOf, red: pick(tr.height), blue: pick(tb.height) },
    { key: "reach", label: "Reach", source: TOTT_SOURCE_LABEL, asOf: tottAsOf, red: pick(tr.reach), blue: pick(tb.reach) },
    { key: "stance", label: "Stance", source: TOTT_SOURCE_LABEL, asOf: tottAsOf, red: pick(tr.stance), blue: pick(tb.stance) },
    { key: "pro-record", label: "Pro record (W-L-D)", source: "ESPN, on the card", asOf: cardAsOf, red: espnRecord(bout?.red), blue: espnRecord(bout?.blue) },
    { key: "ufc-record", label: "UFC tracked record", source: "Our fight corpus (tracked UFC bouts)", asOf: corpusAsOf, red: trackedRecord(bout?.red), blue: trackedRecord(bout?.blue) },
    { key: "last-5", label: "Last 5 tracked, newest first", source: "Our fight corpus (tracked UFC bouts)", asOf: corpusAsOf, red: lastFive(bout?.red), blue: lastFive(bout?.blue) },
  ];
}
