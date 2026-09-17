"use client";
/**
 * Matchup game status (v1.4 · §40 §103). The page is static and outlives its game, so "scheduled" versus "started"
 * is decided on the READER's clock after mount — never baked in at build time. A recorded final is a fact from the
 * compare projection and is rendered by the server; this component only handles games without one. No Live request:
 * the reader is pointed to the page that owns live state.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { formatKickoff, isUpcoming } from "@/lib/research-pages/format.mjs";

export default function MatchupStatus({ startUtc, liveHref, liveLabel }: { startUtc: string; liveHref: string | null; liveLabel: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  const kickoff = formatKickoff(startUtc);
  if (now === null) return <p data-matchup-status="pending" style={{ margin: 0, fontSize: 13.5 }}>Scheduled start: {kickoff}</p>;
  if (isUpcoming(startUtc, now)) return <p data-matchup-status="scheduled" style={{ margin: 0, fontSize: 13.5 }}>Scheduled to start {kickoff}</p>;
  return (
    <p data-matchup-status="started" style={{ margin: 0, fontSize: 13.5 }}>
      The scheduled start ({kickoff}) has passed. No final is recorded in GameTimePicks research data yet.
      {liveHref ? <> <Link href={liveHref} style={{ color: "var(--vault-gold-bright)", textDecoration: "underline", minHeight: 44, display: "inline-flex", alignItems: "center" }}>{liveLabel} →</Link></> : null}
    </p>
  );
}
