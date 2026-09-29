"use client";
/**
 * StatusPill whose tense follows the READER'S day (#761 PR 2): the build's ET date seeds the server render
 * and the first client render (hydration-safe); after mount the reader's day decides live / upcoming /
 * settled (lib/slate-tense.mjs). Pages pass the kind they would show if the slate were today.
 */
import StatusPill, { type StatusPillKind } from "@/components/status-pill";
import { slateTenseKind, isReaderToday } from "@/lib/slate-tense.mjs";
import { useReaderEtDate } from "@/lib/use-reader-et-date";

export default function DayAwareStatusPill({ slateDate, seedToday, readyKind, label, caption }: {
  slateDate: string | null; seedToday: string; readyKind: StatusPillKind; label?: string; caption?: string;
}) {
  const today = useReaderEtDate(seedToday);
  return <StatusPill kind={slateTenseKind({ slateDate, today, readyKind }) as StatusPillKind} label={label} caption={caption} />;
}

/** Text that reads `todayText` only while the slate is the reader's today, else `otherText`. */
export function DayAwareText({ slateDate, seedToday, todayText, otherText }: { slateDate: string | null; seedToday: string; todayText: string; otherText: string }) {
  const today = useReaderEtDate(seedToday);
  return <>{isReaderToday(slateDate, today) ? todayText : otherText}</>;
}

/** Home's MLB chip: "Live today" only while the slate is the reader's today and has games (#761 PR 2). */
export function DayAwareSlateChip({ slateDate, seedToday, hasGames }: { slateDate: string | null; seedToday: string; hasGames: boolean }) {
  const today = useReaderEtDate(seedToday);
  const live = hasGames && isReaderToday(slateDate, today);
  return (
    <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.06em] whitespace-nowrap" style={{ fontSize: 8, color: live ? "var(--vault-success)" : "var(--vault-text-mute)", background: live ? "var(--vault-success-dim)" : "var(--vault-wash)" }}>
      {live ? "Live today" : "Latest slate"}
    </span>
  );
}
