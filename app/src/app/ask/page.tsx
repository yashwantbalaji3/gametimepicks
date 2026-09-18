/**
 * /ask — ASK GAMETIME (v1.6). PUBLIC.
 *
 * ONE static shell. The conversation lives in the browser tab and is answered by a serverless function
 * at /api/ask/; nothing about the static export changes to add it, and if that function is down this
 * page still renders and every link on it still works.
 *
 * The page itself holds no key, no data and no conversation. A reload starts a fresh chat.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import AskApp from "@/components/ask/ask-app";
import { Eyebrow, ResearchShell } from "@/components/research-pages/research-primitives";
import { ASK_ROUTE } from "@/lib/ask/contract.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata: Metadata = withRouteMetadata(ASK_ROUTE, {
  title: "Ask GameTime: questions about games, players, forecasts and the site | GameTimePicks",
  description:
    "Ask GameTimePicks about recorded games and player stats, team and player comparisons, matchup context, published model forecasts, live MLB games, parlay candidates and how the site works. Every answer comes from GameTime's own tools.",
  openGraph: {
    title: "Ask GameTime",
    description: "Ask about games, players, matchups, forecasts, research and GameTimePicks.",
    type: "website",
  },
});

export default function AskPage() {
  return (
    <ResearchShell back={{ href: "/research/", label: "Research" }}>
      <Eyebrow>Ask</Eyebrow>
      <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0" }}>Ask GameTime</h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--vault-text-mute)", maxWidth: 720, lineHeight: 1.6 }}>
        Ask about games, players, matchups, forecasts, research and GameTimePicks. Every answer is built from
        GameTime&apos;s own tools — recorded research, published model forecasts, live MLB state and the site guide — and
        each one says what it used.
      </p>

      <Suspense fallback={null}>
        <AskApp />
      </Suspense>

      <section style={{ margin: "28px 0 0" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>What Ask GameTime can access</h2>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--vault-text-mute)", lineHeight: 1.7 }}>
          <li>Recorded games, player game lines and season results, through <Link href="/research/lab/" style={{ color: "var(--vault-gold-bright)", textDecoration: "underline", textUnderlineOffset: 3 }}>Research Lab</Link>.</li>
          <li>Team and player comparisons and matchup context, through <Link href="/compare/" style={{ color: "var(--vault-gold-bright)", textDecoration: "underline", textUnderlineOffset: 3 }}>Compare</Link>.</li>
          <li>Currently published model forecasts, with each one&apos;s status and confidence.</li>
          <li>Live MLB game state. NFL live state is not available in GameTimePicks.</li>
          <li>Published parlay candidates and how the site works.</li>
        </ul>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--vault-text-mute)", lineHeight: 1.7 }}>
          It does not search the web, read news, or answer sports questions from memory. Where GameTime does not hold the
          data — EPL club results, UFC numeric stats, NFL 2026 player logs — it says so rather than guessing.
        </p>
      </section>
    </ResearchShell>
  );
}
