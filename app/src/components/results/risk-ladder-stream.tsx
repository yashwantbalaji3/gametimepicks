import type { RiskLadder, PublishedBandRecord } from "@/lib/parlays/risk-ladder";
import { PUBLIC_RISK_LABELS, PUBLIC_RISK_BAND_TEXT } from "@/lib/parlays/risk-odds-bands.mjs";

/**
 * THE RISK-LADDER STREAM on /results — this product's record, kept in its own lane.
 *
 * Separate from the settled product record on purpose, and the separation runs both ways:
 *   · these cards never move the Bank Builder / Moonshot bankroll or the 19-14 settled record, and
 *   · that record never lends this stream its credibility.
 *
 * FOUNDER DECISION D1 (Session 5): the public record is the PUBLISHED cards only — one card per risk level a day,
 * settled by the lab ledger (published-band-record.mjs). The candidate pool — every slip generated and graded — is
 * research. It stays on the page, inside a closed "Model detail" disclosure that says what it is, and is never the
 * table a reader meets first or a number presented as our track record.
 *
 * The tables lead with ROI rather than hit rate because hit rate alone is unreadable across price bands — 5.9% is
 * catastrophic at even money and would be excellent at +2000.
 */

/* D2: labels and bands come from the one public taxonomy — never a local table. */
const TIER_LABEL: Readonly<Record<string, string>> = PUBLIC_RISK_LABELS;
const TIER_BAND: Readonly<Record<string, string>> = PUBLIC_RISK_BAND_TEXT;
const ORDER = ["low", "medium", "high", "longshot"];

const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const signed = (v: number | null | undefined) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

type Row = { readonly wins: number; readonly losses: number; readonly hitRate?: number | null; readonly roi: number | null };

function BandTable({ rows, overall, caption }: { rows: { tier: string; r: Row }[]; overall: Row; caption: string }) {
  const cell = { borderBottom: "1px solid var(--vault-rule)" } as const;
  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 560 }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {["Tier", "Price band", "W–L", "Hit rate", "Paper ROI"].map((h, i) => (
              <th key={h} className="font-mono uppercase tracking-[0.12em] py-2"
                style={{ color: "var(--vault-text-faint)", fontSize: 9, textAlign: i < 2 ? "left" : "right", ...cell }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ tier, r }) => (
            <tr key={tier}>
              <td className="py-2" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600, ...cell }}>{TIER_LABEL[tier] ?? tier}</td>
              <td className="py-2 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11, ...cell }}>{TIER_BAND[tier] ?? "—"}</td>
              <td className="py-2 font-mono tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, textAlign: "right", ...cell }}>{r.wins}–{r.losses}</td>
              <td className="py-2 font-mono tabular-nums" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, textAlign: "right", ...cell }}>{pct(r.hitRate)}</td>
              <td className="py-2 font-mono tabular-nums" style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", ...cell,
                color: (r.roi ?? 0) < 0 ? "var(--vault-danger)" : "var(--vault-success)" }}>
                {signed(r.roi)}
              </td>
            </tr>
          ))}
          <tr>
            <td className="py-2 font-semibold" style={{ color: "var(--vault-text)", fontSize: 13 }}>All tiers</td>
            <td />
            <td className="py-2 font-mono tabular-nums" style={{ color: "var(--vault-text)", fontSize: 12.5, textAlign: "right" }}>{overall.wins}–{overall.losses}</td>
            <td />
            <td className="py-2 font-mono tabular-nums" style={{ fontSize: 12.5, fontWeight: 800, textAlign: "right",
              color: (overall.roi ?? 0) < 0 ? "var(--vault-danger)" : "var(--vault-success)" }}>
              {signed(overall.roi)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* DERIVED, BECAUSE IT IS A CLAIM ABOUT THE ROWS ABOVE IT. "Every tier is negative." was once a hardcoded sentence
   beside a table showing a positive tier. What is said is what the rows say, and a positive tier is stated WITH its
   hit rate, so a low strike rate with a positive return reads as the small-sample swing it is. */
function rowsSentence(rows: { tier: string; r: Row }[], overall: Row, noun: string): string {
  const positive = rows.filter(({ r }) => (r.roi ?? 0) > 0);
  if (positive.length === 0) return `Every ${noun} tier is negative.`;
  const names = positive.map(({ tier, r }) => `${TIER_LABEL[tier] ?? tier} at ${signed(r.roi)} on a ${pct(r.hitRate)} hit rate`);
  return `${rows.length - positive.length} of the ${rows.length} tiers are negative; ${names.join(" and ")}. A positive return on a sample this size is a handful of cards landing, not an edge — the overall stream is ${signed(overall.roi)}.`;
}

export default function RiskLadderStream({ published, candidates }: {
  published: PublishedBandRecord | null;
  candidates: RiskLadder["record"] | null;
}) {
  const pubRows = published ? ORDER.map((t) => ({ tier: t, r: published.byTier[t] as Row | undefined })).filter((x): x is { tier: string; r: Row } => !!x.r) : [];
  const candRows = candidates ? ORDER.map((t) => ({ tier: t, r: candidates.byTier[t] as Row | undefined })).filter((x): x is { tier: string; r: Row } => !!x.r) : [];
  if (!published && candRows.length === 0) return null;

  return (
    <section aria-labelledby="risk-ladder-record" className="mt-10 flex flex-col gap-3" data-record-population="published-cards">
      <div className="flex flex-col gap-1">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          Risk ladder · paper stream
        </span>
        <h2 id="risk-ladder-record" className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 800 }}>
          Our published cards by risk level
        </h2>
        {published ? (
          <p className="m-0 max-w-[72ch]" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.65 }}>
            One flat unit per published card — {(published.record.wins + published.record.losses).toLocaleString("en-US")} decided
            over {published.settledDays} settled day{published.settledDays === 1 ? "" : "s"}
            {published.since ? ` since ${published.since}, when the selection rules changed` : ""}. Only the cards we published,
            one per risk level a day. Return on investment is the column that matters: a hit rate
            cannot be read without the price it was paid at.
          </p>
        ) : (
          <p className="m-0 max-w-[72ch]" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.65 }}>
            No published card has settled yet, so there is no record to show.
          </p>
        )}
      </div>

      {published && pubRows.length ? (
        <>
          <BandTable rows={pubRows} overall={published.record} caption="Published cards by risk level" />
          <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.6 }}>
            {rowsSentence(pubRows, published.record, "published")}{" "}Published because the record is the point — a card
            shown without it is a claim, and this stream has not earned one.
          </p>
        </>
      ) : null}

      {candidates && candRows.length ? (
        <details className="gtp-disclose" data-model-detail="candidate-pool">
          <summary className="cursor-pointer font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10, minHeight: 44, display: "flex", alignItems: "center" }}>
            Model detail · every candidate slip graded (research, not our record)
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="m-0 max-w-[72ch]" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.65 }}>
              Every candidate slip the model generated and graded — {(candidates.overall.wins + candidates.overall.losses).toLocaleString("en-US")} decided
              over {candidates.gradedDays} graded days{candidates.firstDay ? ` (${candidates.firstDay} → ${candidates.lastDay})` : ""}. Most of
              these were never published. It is research into how the selection behaves, not the record of the cards above.
            </p>
            <BandTable rows={candRows} overall={candidates.overall} caption="Candidate slips by risk level (model detail)" />
          </div>
        </details>
      ) : null}

      <p className="m-0 font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9, lineHeight: 1.6 }}>
        Paper only · separate ledger · never part of the settled product record or the bankroll
      </p>
    </section>
  );
}
