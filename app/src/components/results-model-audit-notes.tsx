/**
 * Model audit notes block — public surface for honest findings from
 * already-settled data only. Pure server component; every number was
 * computed in `lib/results-audit-notes.ts` from JSONL files on disk.
 *
 * Two variants:
 *   <ResultsModelAuditNotes mode="combined" /> — cross-sport framing
 *     for the top of /results
 *   <ResultsModelAuditNotes mode="sport" sport="NBA|MLB" /> — sport-
 *     specific findings for /results/{nba,mlb}
 *
 * Hard rules honored:
 *   - Never claims future accuracy or model improvement.
 *   - Sample-size labels visible on every note ("signal" / "lean" /
 *     "small-sample"); the small-sample tier exists specifically so
 *     a note with 60 decisive picks doesn't read like a 1000-pick
 *     conclusion.
 *   - No edits to underlying numbers; this is purely a visual surface.
 */
import Link from "next/link";

import type { AuditNote, BucketRow, SportAuditSummary } from "@/lib/results-audit-notes";
import {
  buildCrossSportFraming,
  buildMlbAudit,
  buildNbaAudit,
} from "@/lib/results-audit-notes";
import { formatPercent } from "@/lib/format";

interface Props {
  mode: "combined" | "sport";
  sport?: "NBA" | "MLB";
}

export default function ResultsModelAuditNotes({ mode, sport }: Props) {
  if (mode === "combined") {
    const framing = buildCrossSportFraming();
    if (framing.totalDecisive === 0) return null;
    return (
      <section className="mt-10 reveal" aria-label="Model audit notes">
        <SectionHeader
          eyebrow="Model audit notes"
          title="Where the model is strong, where it needs review"
          subline={
            framing.newestDate
              ? `Sourced from every settled slate through ${framing.newestDate}. Pushes excluded. Pending games never count.`
              : "Sourced from every settled slate. Pushes excluded. Pending games never count."
          }
        />
        <NotesGrid notes={framing.notes} />
        <DeepDiveLink />
      </section>
    );
  }

  // sport mode
  const summary = sport === "NBA" ? buildNbaAudit() : buildMlbAudit();
  if (summary.totalDecisive === 0) return null;
  return (
    <section className="mt-10 reveal" aria-label={`${sport} model audit notes`}>
      <SectionHeader
        eyebrow={`${sport} model audit notes`}
        title={`What the ${sport} settled data has been saying`}
        subline={
          summary.newestDate
            ? `Through ${summary.newestDate}. ${summary.totalDecisive} decisive picks counted.`
            : `${summary.totalDecisive} decisive picks counted.`
        }
      />
      <NotesGrid notes={summary.notes} />
      <BreakdownTriple summary={summary} />
      <DeepDiveLink />
    </section>
  );
}

function DeepDiveLink() {
  return (
    <div className="mt-5 flex justify-end">
      <Link
        href="/results/model-audit"
        className="inline-flex items-center gap-1 font-mono uppercase tracking-[0.16em] hover:underline"
        style={{
          color: "var(--vault-gold)",
          fontSize: 11,
        }}
      >
        Open the audit deep-dive
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header — neon eyebrow + display headline, matches the rest of
// the Results hub.
// ---------------------------------------------------------------------------
function SectionHeader({
  eyebrow,
  title,
  subline,
}: {
  eyebrow: string;
  title: string;
  subline: string;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
          style={{
            background: "var(--vault-gold-bright)",
            boxShadow: "0 0 8px rgba(52, 211, 153, 0.6)",
          }}
        />
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          {eyebrow}
        </span>
      </div>
      <h2
        className="font-display font-semibold tracking-tight"
        style={{
          color: "var(--vault-text)",
          fontSize: "clamp(20px, 3vw, 26px)",
          lineHeight: 1.2,
          maxWidth: 720,
        }}
      >
        {title}
      </h2>
      <p
        className="mt-2 text-[12px] leading-relaxed max-w-2xl"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {subline}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes grid — one card per audit note. Weight chip is the sample-size
// honesty marker.
// ---------------------------------------------------------------------------
function NotesGrid({ notes }: { notes: AuditNote[] }) {
  if (notes.length === 0) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {notes.map((n, i) => (
        <NoteCard key={`${i}-${n.headline}`} note={n} />
      ))}
    </div>
  );
}

function NoteCard({ note }: { note: AuditNote }) {
  const weightStyle = WEIGHT_STYLES[note.weight];
  return (
    <article
      className="rounded-[6px] px-4 py-4 sm:px-5 sm:py-5 flex flex-col gap-2"
      style={{
        background: "rgba(11, 18, 14, 0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="font-mono uppercase tracking-[0.14em] px-2 py-0.5 rounded-[3px]"
          style={{
            color: weightStyle.fg,
            background: weightStyle.bg,
            border: `1px solid ${weightStyle.border}`,
            fontSize: 10,
            letterSpacing: "0.14em",
          }}
        >
          {WEIGHT_LABEL[note.weight]}
        </span>
      </div>
      <h3
        className="font-display font-semibold tracking-tight"
        style={{
          color: "var(--vault-text)",
          fontSize: 15,
          lineHeight: 1.3,
        }}
      >
        {note.headline}
      </h3>
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {note.body}
      </p>
    </article>
  );
}

const WEIGHT_LABEL: Record<AuditNote["weight"], string> = {
  signal: "Signal",
  lean: "Lean",
  "small-sample": "Small sample",
};

const WEIGHT_STYLES: Record<
  AuditNote["weight"],
  { fg: string; bg: string; border: string }
> = {
  signal: {
    fg: "var(--vault-success)",
    bg: "rgba(74, 222, 128, 0.10)",
    border: "rgba(74, 222, 128, 0.30)",
  },
  lean: {
    fg: "var(--vault-gold-bright)",
    bg: "rgba(52, 211, 153, 0.10)",
    border: "rgba(52, 211, 153, 0.30)",
  },
  "small-sample": {
    fg: "var(--vault-text-faint)",
    bg: "rgba(255, 255, 255, 0.02)",
    border: "rgba(255, 255, 255, 0.06)",
  },
};

// ---------------------------------------------------------------------------
// Breakdown triple — side / market / edge band. One compact card row.
// Only renders on /results/{nba,mlb}; the combined page leaves these
// off so the cross-sport surface stays high-signal.
// ---------------------------------------------------------------------------
function BreakdownTriple({ summary }: { summary: SportAuditSummary }) {
  if (
    summary.bySide.length === 0 &&
    summary.byMarket.length === 0 &&
    summary.byEdgeBand.length === 0
  ) {
    return null;
  }
  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
      <BucketTable eyebrow="Over / Under split" rows={summary.bySide} />
      <BucketTable eyebrow="Market split" rows={summary.byMarket} />
      <BucketTable eyebrow="Edge band" rows={summary.byEdgeBand} />
    </div>
  );
}

function BucketTable({
  eyebrow,
  rows,
}: {
  eyebrow: string;
  rows: BucketRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <div
      className="rounded-[6px] px-4 py-4"
      style={{
        background: "rgba(11, 18, 14, 0.55)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <div
        className="font-mono uppercase tracking-[0.14em] mb-3"
        style={{ color: "var(--vault-gold)", fontSize: 10 }}
      >
        {eyebrow}
      </div>
      <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-baseline justify-between gap-3 text-[12px]"
            style={{ color: "var(--vault-text-mute)" }}
          >
            <span
              className="font-mono uppercase tracking-[0.12em] shrink-0"
              style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
            >
              {r.label}
            </span>
            <span
              className="font-mono tabular"
              style={{ color: "var(--vault-text)" }}
            >
              {r.wins}–{r.losses}
              {" · "}
              <span style={{ color: "var(--vault-text-mute)" }}>
                {formatPercent(r.hitRate)}
              </span>
              <span
                className="ml-1.5"
                style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
              >
                on {r.decisive}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
