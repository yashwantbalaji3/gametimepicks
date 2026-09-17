"use client";
/**
 * Upcoming games / bouts (v1.3). A static artifact's "upcoming" claim ages (the /build/custom lesson), so the
 * list is decided on the READER's clock after mount: a game whose scheduled start has passed is simply not
 * upcoming any more. No Live request is made; the game link carries current status.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { formatKickoff, isUpcoming } from "@/lib/research-pages/format.mjs";
import { EntityLink, MONO } from "./research-primitives";

export interface UpcomingItem {
  id: string;
  startUtc: string;
  prefix: string;
  opponentLabel: string;
  opponentHref: string | null;
  context: string | null;
  href: string | null;
  linkLabel: string;
}

export default function UpcomingList({ items, max = 5, emptyText }: { items: UpcomingItem[]; max?: number; emptyText: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  if (now === null) return <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)", margin: 0 }}>Checking the committed schedule…</p>;
  const shown = items.filter((i) => isUpcoming(i.startUtc, now)).sort((a, b) => (a.startUtc < b.startUtc ? -1 : a.startUtc > b.startUtc ? 1 : a.id < b.id ? -1 : 1)).slice(0, max);
  if (!shown.length) return <p style={{ fontSize: 12.5, color: "var(--vault-text-mute)", margin: 0 }}>{emptyText}</p>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
      {shown.map((i) => (
        <li key={i.id} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px 12px", borderTop: "1px solid var(--vault-rule)", paddingTop: 8 }}>
          <span style={{ fontSize: 13.5, color: "var(--vault-text)" }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)" }}>{i.prefix}</span>{" "}
            <EntityLink href={i.opponentHref}>{i.opponentLabel}</EntityLink>
            {i.context ? <span style={{ fontSize: 12, color: "var(--vault-text-mute)" }}> · {i.context}</span> : null}
          </span>
          <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--vault-text-mute)" }}>{formatKickoff(i.startUtc)}</span>
            {i.href ? <Link href={i.href} style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-gold-bright)", minHeight: 44, display: "inline-flex", alignItems: "center" }}>{i.linkLabel} →</Link> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
