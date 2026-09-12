"use client";
import { readingToEngineLegs } from "@/lib/accounts/slip-insight-adapter.mjs";
import { cardChance, bandRecord, linkedPairs } from "@/lib/parlays/lab/slip-insight.mjs";
import ChanceMeter from "@/components/parlays/lab/chance-meter";

/**
 * WHAT THIS SLIP IS (P266) — your own ticket, read by the same engine that reads ours.
 *
 * The chance its price implies, the lab's settled record at that same price, and which of your legs
 * are linked. It is NOT a prediction about your bet: nothing here knows how it will go, and the band
 * record belongs to our published cards, not to your slip. Shown before you save so the read is
 * information rather than a verdict delivered afterwards.
 */
export default function SlipReadPanel({
  legs, byTier,
}: {
  legs: Array<{ player?: string | null; market?: string | null; side?: string | null; line?: number | null; odds?: number | null; event?: string | null }>;
  byTier: Readonly<Record<string, { wins: number; losses: number; roi?: number | null }>> | null;
}) {
  const { legs: engine, droppedUnpriced } = readingToEngineLegs(legs) as { legs: Array<Record<string, unknown>>; droppedUnpriced: number };
  if (engine.length === 0) return null;
  const chance = cardChance(engine) as { decimal: number; american: number } | null;
  if (!chance) return null;
  const record = bandRecord(chance.american, byTier) as { band: string; wins: number; losses: number; decided: number } | null;
  const links = linkedPairs(engine) as Array<{ a: Record<string, string>; b: Record<string, string>; hardDisable: boolean; reason: string }>;

  return (
    <section aria-label="What this slip is" className="flex flex-col gap-3 rounded-[12px] p-3.5"
      style={{ background: "var(--vault-wash-faint)", border: "1px solid var(--vault-rule)" }}>
      <ChanceMeter decimal={chance.decimal} record={record ? { wins: record.wins, losses: record.losses } : null} since={null} />
      {record ? (
        <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 10.5, lineHeight: 1.5 }}>
          That record is the lab&rsquo;s own published cards in the {record.band} price band — not this slip, which has
          not settled and which nothing here can predict.
        </p>
      ) : null}

      {links.length > 0 ? (
        <ul className="flex flex-col gap-1.5 list-none m-0 p-0">
          {links.slice(0, 3).map((p, i) => (
            <li key={i} className="rounded-[8px] px-2.5 py-1.5" style={{ background: p.hardDisable ? "var(--vault-danger-dim)" : "var(--vault-warn-dim)", border: `1px solid ${p.hardDisable ? "var(--vault-danger)" : "var(--vault-warn)"}` }}>
              <span className="block font-semibold" style={{ color: "var(--vault-text)", fontSize: 11.5 }}>
                {String(p.a.label ?? p.a.player ?? "leg")} + {String(p.b.label ?? p.b.player ?? "leg")}
              </span>
              <span className="block" style={{ color: "var(--vault-text-mute)", fontSize: 11, lineHeight: 1.45 }}>{p.reason}</span>
            </li>
          ))}
        </ul>
      ) : engine.length > 1 ? (
        <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>No two legs on this slip share an event.</p>
      ) : null}

      {droppedUnpriced > 0 ? (
        <p className="m-0" style={{ color: "var(--vault-warn)", fontSize: 11 }}>
          {droppedUnpriced} leg{droppedUnpriced === 1 ? "" : "s"} had no price read, so {droppedUnpriced === 1 ? "it is" : "they are"} not in this read.
        </p>
      ) : null}
    </section>
  );
}
