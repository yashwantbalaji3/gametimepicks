/**
 * UFC PREDICTION BOARD (UFC-001 · UX Phase A) — the first section on /ufc.
 *
 * Every bout on the card once, main event first, with the experimental model's published winner probability and its
 * experimental method lean, each row opening the existing bout report. Rows come from `buildPredictionBoard`, which reads
 * only the card artifact the bout pages read, so the two cannot disagree.
 *
 * Layout: a comparison table from `xl` up (weight class gets its own column at `2xl`, otherwise it sits under the
 * matchup), and matchup cards below that — two per row on tablets, one on phones. The same facts at every width, never a
 * clipped or page-wide sideways-scrolling table. The pick is marked in words ("Pick"), not by colour alone.
 */
import Link from "next/link";

import PlayerAvatar from "@/components/player-avatar";
import { buildPredictionBoard } from "@/lib/sports/ufc/prediction-board.mjs";
import type { UfcCardArtifact } from "@/components/sports/ufc-card";

type Board = ReturnType<typeof buildPredictionBoard>;
type Row = Board["rows"][number];
type Side = Row["red"];

const ET_TIME = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET"
    : null;

const pct = (p: number) => `${Math.round(p * 100)}%`;

const PANEL: React.CSSProperties = { background: "var(--vault-panel)", border: "1px solid var(--vault-rule)", borderRadius: 12 };
const LABEL: React.CSSProperties = { fontSize: 9.5, color: "var(--vault-text-faint)" };

function Fighter({ f, picked, align = "left" }: { f: Side; picked: boolean; align?: "left" | "right" }) {
  return (
    <span className={`flex items-center gap-2 min-w-0 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <span
        className="shrink-0 rounded-full"
        style={{ boxShadow: picked ? "0 0 0 2px var(--sport-ufc)" : "none", lineHeight: 0 }}
      >
        <PlayerAvatar photoUrl={f.photoUrl} playerName={f.name} size="sm" flat />
      </span>
      <span className="min-w-0">
        <span className="block" style={{ fontSize: 13, lineHeight: 1.25, overflowWrap: "anywhere", fontWeight: picked ? 800 : 600, color: picked ? "var(--vault-text)" : "var(--vault-text-mute)" }}>
          {f.name}
        </span>
        <span className="block font-mono" style={{ ...LABEL }}>
          {picked ? <span style={{ color: "var(--sport-ufc)", fontWeight: 700 }}>Pick</span> : null}
          {picked && f.record ? " · " : null}
          {f.record ?? (picked ? null : " ")}
        </span>
      </span>
    </span>
  );
}

function ProbabilityCell({ row }: { row: Row }) {
  if (!row.pick) return <span className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>—</span>;
  return (
    <span className="flex items-center gap-2" style={{ minWidth: 120 }}>
      <span className="font-mono tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: "var(--vault-text)" }}>{pct(row.pick.probability)}</span>
      <span aria-hidden style={{ flex: 1, height: 4, borderRadius: 999, background: "var(--vault-rule)", overflow: "hidden" }}>
        <span style={{ display: "block", width: `${Math.round(row.pick.probability * 100)}%`, height: "100%", background: "var(--sport-ufc)" }} />
      </span>
    </span>
  );
}

function MethodCell({ row }: { row: Row }) {
  if (!row.methodLean) return <span className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>—</span>;
  return (
    <span className="flex flex-col">
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vault-text)" }}>{row.methodLean.label}</span>
      <span className="font-mono uppercase tracking-[0.08em]" style={{ ...LABEL }}>experimental lean</span>
    </span>
  );
}

function PositionCell({ row }: { row: Row }) {
  return (
    <span className="flex flex-col">
      <span style={{ fontSize: 12.5, fontWeight: 700, color: row.index < 2 ? "var(--sport-ufc)" : "var(--vault-text)" }}>{row.position}</span>
      <span className="font-mono" style={{ ...LABEL }}>
        {[row.segment, ET_TIME(row.startUtc)].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

const weightLine = (row: Row) => [row.weightClass, row.scheduledRounds ? `${row.scheduledRounds} rds` : null].filter(Boolean).join(" · ");

export default function UfcPredictionBoard({ card }: { card: UfcCardArtifact }) {
  const board = buildPredictionBoard(card);
  if (!board.rows.length) return null;
  return (
    <div className="flex flex-col gap-3" data-ufc-prediction-board>
      {/* ── Desktop and tablet: one comparison table ─────────────────────────────────────────── */}
      <div className="hidden xl:block" style={{ ...PANEL, overflowX: "auto" }}>
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <caption className="sr-only">UFC prediction board: every bout on the card with the model&apos;s pick, win probability and experimental method lean</caption>
          <thead>
            <tr className="font-mono uppercase tracking-[0.1em] text-left" style={{ ...LABEL, borderBottom: "1px solid var(--vault-rule)" }}>
              <th scope="col" className="px-3 py-2 font-normal">Fight</th>
              <th scope="col" className="px-3 py-2 font-normal">Matchup</th>
              <th scope="col" className="px-3 py-2 font-normal hidden 2xl:table-cell">Weight class</th>
              <th scope="col" className="px-3 py-2 font-normal">Model pick · win prob.</th>
              <th scope="col" className="px-3 py-2 font-normal">Method lean</th>
              <th scope="col" className="px-3 py-2 font-normal"><span className="sr-only">Analysis</span></th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <tr key={row.boutId} style={{ borderTop: "1px solid var(--vault-rule)" }}>
                <td className="px-3 py-2.5 align-middle whitespace-nowrap"><PositionCell row={row} /></td>
                <td className="px-3 py-2.5 align-middle" style={{ minWidth: 260 }}>
                  <span className="grid items-center gap-2" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
                    <Fighter f={row.red} picked={row.pick?.side === "red"} />
                    <span className="font-mono uppercase" style={{ ...LABEL }}>vs</span>
                    <Fighter f={row.blue} picked={row.pick?.side === "blue"} />
                  </span>
                  <span className="2xl:hidden block mt-1 font-mono" style={{ ...LABEL }}>{weightLine(row)}</span>
                </td>
                <td className="px-3 py-2.5 align-middle hidden 2xl:table-cell">
                  <span style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>{weightLine(row)}</span>
                </td>
                <td className="px-3 py-2.5 align-middle" style={{ minWidth: 170 }}>
                  {row.pick ? (
                    <span className="flex flex-col gap-1">
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--vault-text)" }}>{row.pick.name}</span>
                      <ProbabilityCell row={row} />
                    </span>
                  ) : (
                    <span className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }} title={row.unmodelledReason ?? undefined}>Not modelled</span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-middle"><MethodCell row={row} /></td>
                <td className="px-3 py-2.5 align-middle text-right">
                  <Link
                    href={row.href}
                    aria-label={`Open the analysis for ${row.red.name} vs ${row.blue.name}`}
                    className="inline-flex items-center rounded-full px-3 font-mono uppercase tracking-[0.1em] whitespace-nowrap"
                    style={{ minHeight: 32, fontSize: 10, border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)", textDecoration: "none" }}
                  >
                    Analysis →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Phones: stacked matchup cards with the same facts ────────────────────────────────── */}
      <ul className="xl:hidden grid gap-2 md:grid-cols-2 list-none p-0 m-0">
        {board.rows.map((row) => (
          <li key={row.boutId}>
            <Link
              href={row.href}
              aria-label={`${row.position}: ${row.red.name} vs ${row.blue.name}. ${row.pick ? `Model pick ${row.pick.name}, ${pct(row.pick.probability)}${row.methodLean ? `, experimental method lean ${row.methodLean.label}` : ""}.` : "Not modelled."} Open the analysis.`}
              className="block h-full px-3 py-2.5"
              style={{ ...PANEL, textDecoration: "none", color: "inherit" }}
            >
              <span className="flex items-baseline justify-between gap-2">
                <PositionCell row={row} />
                <span className="font-mono text-right" style={{ ...LABEL }}>{weightLine(row)}</span>
              </span>
              <span className="grid items-center gap-2 mt-2" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
                <Fighter f={row.red} picked={row.pick?.side === "red"} />
                <span className="font-mono uppercase" style={{ ...LABEL }}>vs</span>
                <Fighter f={row.blue} picked={row.pick?.side === "blue"} align="right" />
              </span>
              <span className="flex items-end justify-between gap-3 mt-2 pt-2" style={{ borderTop: "1px solid var(--vault-rule)" }}>
                {row.pick ? (
                  <>
                    <span className="flex flex-col">
                      <span className="font-mono uppercase tracking-[0.08em]" style={{ ...LABEL }}>Model pick</span>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--vault-text)" }}>{row.pick.name} · {pct(row.pick.probability)}</span>
                    </span>
                    <MethodCell row={row} />
                  </>
                ) : (
                  <span className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>Not modelled — {row.unmodelledReason}</span>
                )}
                <span aria-hidden className="font-mono shrink-0" style={{ fontSize: 11, color: "var(--vault-text-mute)" }}>→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="m-0 font-mono max-w-3xl" style={{ fontSize: 10.5, lineHeight: 1.6, color: "var(--vault-text-faint)" }}>
        Win prob. is the experimental fight model&apos;s published winner probability
        {board.modelId ? ` (${board.modelId})` : ""} — not a sportsbook price. Method lean is the most likely way the fight
        ends, for either fighter, from the experimental method head; it is not the chance that the pick wins that way, and
        method and round are not yet graded. Not modelled means too little tracked history to read. Paper and educational.
      </p>
    </div>
  );
}
