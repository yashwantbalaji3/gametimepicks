/**
 * THE RECORD, LABELLED (Bank Builder V2 · G-2). The composite record's own rule is that it is "shown only with its
 * era composition beside it" — this is that composition, read verbatim from the results projection's COMPOSITE cell,
 * plus the fold's own backlog (lib/mr-dub/protected-fold.mjs foldBacklog): decided results after the fold stopped,
 * and the pending leg that stopped it. Nothing is credited or recomputed here.
 */
import { etDayLabel } from "@/lib/et-stamp.mjs";

type Counts = { won: number | null; lost: number | null };
type Win = { from: string | null; to: string | null };
type Era = { era: string; counts: Counts; window: Win | null };
export interface FoldBacklogView {
  after: string; haltedAt: string | null;
  blocking: Array<{ product: string | null; lane: string | null; legs: Array<{ matchup: string | null; selection: string | null }> }>;
  decided: Record<string, { won: number; lost: number }>;
}

const ERA_LABEL: Record<string, string> = { PROTECTED_BASE: "July protected base", RECEIPT_ERA: "settled receipts" };
const rec = (c: Counts) => (c.won != null && c.lost != null ? `${c.won}–${c.lost}` : "—");
const day = (d: string | null) => (d ? etDayLabel(d) ?? d : "—");

export default function RecordComposition({ recordLabel, window, composition, backlog }: {
  recordLabel: string; window: Win | null; composition: Era[] | null; backlog: FoldBacklogView | null;
}) {
  const bb = backlog?.decided?.["bank-builder"];
  const waiting = bb ? bb.won + bb.lost : 0;
  return (
    <section aria-label="How this record is built" className="mt-4 rounded-xl px-4 py-3 text-[12.5px] leading-relaxed" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)" }}>
      <p className="m-0">
        <strong style={{ color: "var(--vault-text)" }}>Record {recordLabel}</strong>
        {window ? <> · {day(window.from)} to {day(window.to)}</> : null}
        {composition?.length ? <> · {composition.map((e) => `${ERA_LABEL[e.era] ?? e.era} ${rec(e.counts)}${e.window ? ` (${day(e.window.from)}–${day(e.window.to)})` : ""}`).join(" + ")}</> : null}
      </p>
      {backlog?.haltedAt && waiting > 0 ? (
        <p className="m-0 mt-1">
          Not yet in this record: {waiting} decided Bank Builder result{waiting === 1 ? "" : "s"} after {day(backlog.after)} ({bb!.won}–{bb!.lost}).
          The record folds day by day and waits while any placed leg is unsettled — held since {day(backlog.haltedAt)} by{" "}
          {backlog.blocking.flatMap((b) => b.legs.map((l) => `${l.matchup ?? "a game"} · ${l.selection ?? "a leg"}${b.product ? ` (${b.product === "moonshot" ? "Moonshot" : "Bank Builder"} lane ${b.lane ?? "?"})` : ""}`)).join("; ") || "an unsettled leg"}.
        </p>
      ) : null}
    </section>
  );
}
