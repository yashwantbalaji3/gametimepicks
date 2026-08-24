"use client";
/**
 * Top-reads filter chips (Program 202 · Release C).
 *
 * Filters SELECT from the ranked owner's rows — they never re-rank (the rows arrive in the owner's
 * order and `filter()` preserves it; a guard pins that). Filter state lives in the URL query
 * (?sport=&market=), so opening a pick and coming back — or refreshing — restores the chips with
 * ordinary browser history, no hidden global state.
 *
 * Zero-results honesty: "0 reads match this filter" is a statement about the FILTER, never about
 * the sport's product day — product state lives with the product-day owner above, and the empty
 * state says so in words.
 */
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import TopReadsPanel from "@/components/top-reads-panel";
import type { TopRead, TopReadsSet } from "@/lib/top-reads";

const CHIP: React.CSSProperties = {
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontFamily: "var(--font-mono, ui-monospace)",
  cursor: "pointer",
  background: "transparent",
};

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="vault-press inline-flex items-center"
      style={{
        ...CHIP,
        color: active ? "var(--vault-success)" : "var(--vault-text-mute)",
        border: active ? "1px solid color-mix(in srgb, var(--vault-success) 45%, transparent)" : "1px solid var(--vault-border-strong)",
        backgroundColor: active ? "var(--vault-success-dim)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

export default function TopReadsFilter({ set, reads }: { set: TopReadsSet; reads: TopRead[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sport = params.get("sport");
  const market = params.get("market");

  const sports = useMemo(() => [...new Set(reads.map((r) => r.sport))], [reads]);
  const markets = useMemo(() => [...new Set(reads.map((r) => r.market))], [reads]);

  const setParam = useCallback((key: "sport" | "market", value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value == null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}#top-reads` : `${pathname}#top-reads`, { scroll: false });
  }, [params, pathname, router]);

  // SELECTION over the owner's order — filter() preserves relative order by construction.
  const filtered = useMemo(
    () => reads.filter((r) => (!sport || r.sport === sport) && (!market || r.market === market)),
    [reads, sport, market],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter the ranked reads">
        <Chip active={!sport} onClick={() => setParam("sport", null)}>All sports</Chip>
        {sports.map((s) => (
          <Chip key={s} active={sport === s} onClick={() => setParam("sport", sport === s ? null : s)}>
            {reads.find((r) => r.sport === s)?.sportLabel ?? s}
          </Chip>
        ))}
        <span aria-hidden style={{ color: "var(--vault-text-faint)" }}>·</span>
        <Chip active={!market} onClick={() => setParam("market", null)}>All markets</Chip>
        {markets.map((m) => (
          <Chip key={m} active={market === m} onClick={() => setParam("market", market === m ? null : m)}>
            {m}
          </Chip>
        ))}
      </div>

      {filtered.length > 0 ? (
        <TopReadsPanel
          set={set}
          reads={filtered}
          groupBySport
          eyebrow="Ranked by the model's own probability"
          title="Top 10 by sport"
        />
      ) : (
        <p className="rounded-[10px] px-4 py-3" style={{ border: "1px dashed var(--vault-border-strong)", fontSize: 12.5, lineHeight: 1.6, color: "var(--vault-text-mute)" }}>
          0 reads match this filter. That is a statement about the filter, not about any sport&rsquo;s
          product day — what each sport has today is stated above, by the product-day owner.
        </p>
      )}
    </div>
  );
}
