/**
 * UfcPredictionPreview — a compact "tonight's UFC fight picks" board for the homepage: one row per fight
 * with Predicted Winner / Method / Confidence, driven by the Prediction Engine V1. Server-renderable, no
 * external images. Honest: experimental V1 / market-implied, paper-only — never framed as a recommended play.
 */
import Link from "next/link";
import type { UfcPredictionRowV1 } from "@/lib/ufc/ufc-prediction-engine";

const gold = "var(--vault-gold-bright)";
const mute = "var(--vault-text-mute)";
const faint = "var(--vault-text-faint)";

export default function UfcPredictionPreview({ eventName, rows, marketWinnerCount, methodReadCount }: {
  eventName: string; rows: UfcPredictionRowV1[]; marketWinnerCount: number; methodReadCount: number;
}) {
  if (!rows || rows.length === 0) return null;
  const prefix = eventName.includes(":") ? eventName.split(":")[0].trim() : eventName;
  return (
    <section className="rounded-[14px] px-4 py-4 sm:px-6 sm:py-5" style={{ border: "1px solid var(--vault-border-strong)", background: "linear-gradient(150deg, rgba(18,12,10,0.96) 0%, rgba(26,16,11,0.98) 100%)" }} aria-label={`${prefix} fight picks`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="font-mono uppercase tracking-[0.16em]" style={{ color: gold, fontSize: 10 }}>Tonight&apos;s UFC picks · {prefix}</span>
          <span className="font-mono" style={{ color: faint, fontSize: 9.5 }}>{rows.length} fights · {marketWinnerCount} market-backed winners · {methodReadCount} method reads</span>
        </div>
        <span className="rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.1em]" style={{ fontSize: 8.5, color: gold, background: "rgba(217,164,65,0.12)", border: "1px solid rgba(217,164,65,0.4)" }}>Experimental V1 · paper-only</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 340 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--vault-rule)" }}>
              {["Fight", "Winner", "Method", "Conf"].map((h) => (
                <th key={h} className="text-left font-mono uppercase tracking-[0.1em] py-1.5 px-1" style={{ color: faint, fontSize: 8.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.fightId} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td className="py-1.5 px-1 truncate" style={{ color: mute, fontSize: 11, maxWidth: 150 }}>{r.fighterA.split(" ").pop()} v {r.fighterB.split(" ").pop()}</td>
                <td className="py-1.5 px-1" style={{ color: "var(--vault-text)", fontSize: 11.5, fontWeight: 600 }}>{r.display.predictedWinnerText}</td>
                <td className="py-1.5 px-1" style={{ color: mute, fontSize: 11 }}>{r.display.methodOfVictoryText}</td>
                <td className="py-1.5 px-1 font-mono" style={{ color: faint, fontSize: 10 }}>{r.display.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span style={{ color: faint, fontSize: 9.5, lineHeight: 1.4 }}>Winner is market-implied when odds exist; method is an experimental V1 read. Validation in progress.</span>
        <Link href="/ufc" className="vault-press inline-flex shrink-0 items-center rounded-full px-3.5 py-1.5 font-mono uppercase tracking-[0.12em]" style={{ border: `1px solid ${gold}`, color: gold, fontSize: 10, textDecoration: "none" }}>View all UFC predictions →</Link>
      </div>
    </section>
  );
}
