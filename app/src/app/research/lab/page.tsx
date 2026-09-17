/**
 * /research/lab — RESEARCH LAB (v1.5). PUBLIC.
 *
 * ONE static shell. The search — its mode, sport, season, entity, stat, filters, sort and page — lives in the URL
 * query and runs in the browser against static assets emitted from the committed Lab projection. There is no page
 * per query, per season or per filter combination: canonical is the shell path, so every query state shares one
 * canonical URL and no filter combination creates an indexable page.
 *
 * The Lab describes recorded facts. It has no forecast, no model output, no Live state and no settlement grade,
 * and it stores nothing on the reader's device.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import ResearchLabApp from "@/components/lab/research-lab-app";
import { Eyebrow, ResearchShell } from "@/components/research-pages/research-primitives";
import { LAB_ROUTE } from "@/lib/lab/contract.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata: Metadata = withRouteMetadata(LAB_ROUTE, {
  title: "Research Lab: game finder, player stats and season results | GameTimePicks",
  description:
    "Search GameTimePicks' recorded sports data: find MLB and NFL games by team, opponent, result, score or date; filter NFL, Premier League and MLB player games on one recorded stat; and read recorded season results team by team.",
  openGraph: { title: "GameTimePicks Research Lab", description: "Find recorded games, player game lines and season results in GameTimePicks data.", type: "website" },
});

export default function ResearchLabPage() {
  return (
    <ResearchShell back={{ href: "/research/", label: "Research" }}>
      <Eyebrow>Research · Lab</Eyebrow>
      <h1 style={{ fontSize: "clamp(22px, 4vw, 32px)", fontWeight: 800, margin: "6px 0 0" }}>Research Lab</h1>
      <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--vault-text-mute)", maxWidth: 720, lineHeight: 1.6 }}>
        Ask GameTimePicks&apos; recorded data a question. Choose what you are looking for, add filters, and the answer is the
        rows that match — recorded finals, recorded player game lines and recorded season results, with the period they cover
        stated. There is no prediction, no rating and no pick here; every search has its own link you can share.
      </p>
      <Suspense fallback={null}>
        <ResearchLabApp />
      </Suspense>
      <p style={{ margin: "24px 0 0", fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.6 }}>
        Looking for something else? <Link href="/compare/" style={{ color: "var(--vault-gold-bright)", textDecoration: "underline", textUnderlineOffset: 3 }}>Compare</Link> puts two teams or two players side by side,
        and a team or player research page shows one entity&apos;s full recorded history.
      </p>
    </ResearchShell>
  );
}
