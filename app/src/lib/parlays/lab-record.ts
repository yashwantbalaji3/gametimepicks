/**
 * THE PARLAY LAB'S OWN RECORD — every suggested card, every sport, in one place.
 *
 * The Lab publishes a card per price band per sport, every day, and until now nothing told a reader
 * how those cards had actually done. /results/parlays tracks SAVED SLIPS — cards a reader built and
 * kept — which is a different population entirely and answers a different question. The Lab's own
 * suggestions were published, settled into dated receipts, and never summarised anywhere.
 *
 * Two artifacts already carry it. lab-ledger.json holds a per-stream record, and lab-settled/<date>
 * holds each card that was graded that day with its result. This reads both and refuses to invent
 * the difference between them.
 *
 * WHAT IT WILL NOT DO:
 *   - report 0-0 as a record. An empty record and a record of no wins look identical in a table and
 *     mean opposite things, so a stream (or a tier) with nothing settled returns null/unsettled and
 *     the page says so in words.
 *   - average across sports that have not settled. A "cross-sport hit rate" computed mostly from one
 *     sport's cards is that sport's hit rate wearing a wider label.
 *   - hide the result. Whatever the record is, that is the number the page shows.
 */
import fs from "node:fs";
import path from "node:path";

export interface LabTierRecord {
  tier: string;
  wins: number;
  losses: number;
  pushes: number;
  /** Null when this tier has settled nothing — never a zeroed rate. */
  hitRate: number | null;
  roi: number | null;
  /** False when the tier has never graded a card; the cell renders "nothing settled". */
  settled: boolean;
}

export interface LabStream {
  id: string;
  label: string;
  live: boolean;
  blocked: string | null;
  settledDays: number;
  /** Null when the stream has settled nothing — never a zeroed record. */
  record: { wins: number; losses: number; pushes: number; staked: number; returned: number; roi: number | null } | null;
  byTier: LabTierRecord[];
}

export interface LabSettledCard {
  date: string;
  sport: string;
  tier: string;
  slipId: string;
  result: string;
  combinedDecimal: number | null;
  legs: string[];
}

export interface LabRecord {
  generatedAt: string;
  streams: LabStream[];
  /** Every graded card, newest day first. The raw record behind the summaries above. */
  cards: LabSettledCard[];
  /** Days on which anything at all was settled. */
  settledDays: string[];
  /** Sports that have settled at least one card — the only ones whose numbers mean anything. */
  sportsWithRecord: string[];
}

const read = (p: string) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

export function loadLabRecord(): LabRecord | null {
  const ledger = read(path.join(process.cwd(), "public/data/parlays/lab-ledger.json"));
  if (!ledger || !Array.isArray(ledger.streams)) return null;

  const dir = path.join(process.cwd(), "public/data/parlays/lab-settled");
  const cards: LabSettledCard[] = [];
  const days: string[] = [];
  try {
    for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().reverse()) {
      const doc = read(path.join(dir, f));
      if (!doc?.cards?.length) continue;
      days.push(doc.date ?? f.replace(".json", ""));
      for (const c of doc.cards) {
        cards.push({
          date: doc.date ?? f.replace(".json", ""),
          sport: c.sport ?? "?",
          tier: c.tier ?? "?",
          slipId: c.slipId ?? "",
          result: c.result ?? "pending",
          combinedDecimal: typeof c.combinedDecimal === "number" ? c.combinedDecimal : null,
          legs: Array.isArray(c.legs) ? c.legs : [],
        });
      }
    }
  } catch { /* no receipts yet — the streams below still describe themselves */ }

  const streams: LabStream[] = ledger.streams.map((s: Record<string, unknown>) => {
    const r = s.record as LabStream["record"];
    const settled = Number(s.settledDays ?? 0);
    /*
     * The ledger writes byTier as an OBJECT keyed by tier (P194's builder), and this reader
     * originally expected an array — so every stream's tier record silently came out empty
     * (P200 found the page had no per-tier table to notice). Parse the real shape, in the
     * canonical tier order, preserving the null-record semantics: a tier that has graded
     * nothing is `settled: false`, never a measured 0-0.
     */
    const rawTiers = (s.byTier ?? {}) as Record<string, { wins?: number; losses?: number; pushes?: number; hitRate?: number | null; roi?: number | null }>;
    const byTier: LabTierRecord[] = ["low", "medium", "high", "longshot"]
      .filter((t) => rawTiers[t])
      .map((t) => {
        const b = rawTiers[t];
        const graded = (b.wins ?? 0) + (b.losses ?? 0) + (b.pushes ?? 0);
        return {
          tier: t,
          wins: b.wins ?? 0,
          losses: b.losses ?? 0,
          pushes: b.pushes ?? 0,
          hitRate: graded > 0 ? (b.hitRate ?? null) : null,
          roi: graded > 0 ? (b.roi ?? null) : null,
          settled: graded > 0,
        };
      });
    return {
      id: String(s.id),
      label: String(s.label ?? s.id),
      live: Boolean(s.live),
      blocked: (s.blocked as string) ?? null,
      settledDays: settled,
      // A stream that has settled nothing has no record. Zeroes would read as a measured result.
      record: settled > 0 && r ? r : null,
      byTier,
    };
  });

  return {
    generatedAt: ledger.generatedAt,
    streams,
    cards,
    settledDays: days,
    sportsWithRecord: [...new Set(cards.map((c) => c.sport))].sort(),
  };
}

/** How much any of this is worth saying. Deliberately blunt at these sample sizes. */
export function labSampleCaption(rec: LabRecord | null): string {
  if (!rec) return "The Lab record could not be read.";
  const graded = rec.cards.length;
  if (graded === 0) return "No suggested card has been settled yet, so there is no record to show.";
  if (rec.sportsWithRecord.length === 1) {
    return `${graded} suggested cards have been settled, all of them ${rec.sportsWithRecord[0].toUpperCase()}. ` +
      "Far too few, and from one sport, to say anything about how the Lab performs.";
  }
  return `${graded} suggested cards settled across ${rec.sportsWithRecord.length} sports — still a small sample.`;
}
