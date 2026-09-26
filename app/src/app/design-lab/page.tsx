/**
 * /design-lab — review hub for the 4 mobile-first design directions. Preview-only: these routes
 * are additive and never change the live product or its data. Each version reads the same real
 * production data (Bank Builder, UFC 250 settlement, MLB slate) through the read-only adapter.
 */
import Link from "next/link";
import { loadDesignLabData } from "@/lib/design-lab/data";

export const metadata = { title: "Design Lab · GameTime Picks", description: "Four mobile-first design directions — preview only." };

const VERSIONS = [
  { slug: "v1", name: "Immersive Fight Card", thesis: "Event-first. Big matchup cards, fighter avatars, sharp stat comparisons.", accent: "#E11D2A" },
  { slug: "v2", name: "Premium Analytics Dashboard", thesis: "Scannable trader screen. Dense metric tiles, edge + confidence meters.", accent: "#22D3EE" },
  { slug: "v3", name: "Mobile Sports App", thesis: "One-thumb feed. Sport chips, compact cards, app-style bottom nav.", accent: "#8B7CF6" },
  { slug: "v4", name: "Editorial Casino", thesis: "Magazine storytelling. Warm gold/crimson hero, the $100→$10K narrative.", accent: "#F0C75E" },
];

export default function DesignLabHub() {
  const d = loadDesignLabData();
  return (
    <div style={{ minHeight: "100vh", background: "#0B0B0E", color: "#F4F4F5", padding: "28px 18px 56px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <span style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8a8a92" }}>GameTime Picks · Design Lab</span>
        <h1 style={{ fontSize: "clamp(26px,6vw,40px)", fontWeight: 800, lineHeight: 1.05, margin: "8px 0 6px" }}>Four design directions</h1>
        <p style={{ color: "#b5b5bd", fontSize: 14, maxWidth: 560 }}>
          Preview-only. Each version is mobile-first and renders the same real data — Bank Builder {d.bankBuilder.record} ({usdShort(d.bankBuilder.final)}), UFC {d.ufc.moneylineRecord} moneyline — in a distinct visual system. Pick the pieces you like from each.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
          {VERSIONS.map((v) => (
            <Link key={v.slug} href={`/design-lab/${v.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", padding: "18px 18px", position: "relative", overflow: "hidden" }}>
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: v.accent }} />
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 800, color: v.accent }}>{v.slug.toUpperCase()}</span>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>{v.name}</span>
                </div>
                <p style={{ color: "#a6a6ae", fontSize: 13, margin: "6px 0 0" }}>{v.thesis}</p>
                <span style={{ display: "inline-block", marginTop: 10, fontFamily: "monospace", fontSize: 11, color: v.accent }}>Open {v.slug} →</span>
              </div>
            </Link>
          ))}
        </div>
        <p style={{ color: "#6a6a72", fontSize: 11.5, marginTop: 24 }}>
          Production unchanged. Bank Builder stays {usdShort(d.bankBuilder.final)} · {d.bankBuilder.record} · {d.bankBuilder.status}. {d.generatedNote}.
        </p>
        <Link href="/" style={{ color: "#8a8a92", fontSize: 12, fontFamily: "monospace" }}>← Back to live site</Link>
      </div>
    </div>
  );
}

function usdShort(n: number): string { return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`; }
