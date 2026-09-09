/**
 * Design Lab V3 — Mobile-First Sports App. Feed-first, app-like: swipeable sport chips, compact
 * feed cards, sticky bottom nav. Real data via the read-only adapter. Preview-only.
 */
import Link from "next/link";
import { loadDesignLabData, initials, usd } from "@/lib/design-lab/data";

export const metadata = { title: "Design Lab V3 · Mobile App" };
const VIOLET = "#8B7CF6";
const BG = "#0E0E16";
const CARD = "#171724";

export default function V3() {
  const d = loadDesignLabData();
  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#F2F2F7", paddingBottom: 82 }}>
      {/* sticky header + sport chips */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "rgba(14,14,22,0.92)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 460, margin: "0 auto", padding: "14px 16px 0" }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Today</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 0 12px", WebkitOverflowScrolling: "touch" }}>
            {["For You", "UFC", "MLB", "NBA", "Soccer", "Bank"].map((s, i) => (
              <span key={s} style={{ flexShrink: 0, padding: "6px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 700,
                background: i === 0 ? VIOLET : "rgba(255,255,255,0.06)", color: i === 0 ? "#fff" : "#9b9bad" }}>{s}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 460, margin: "0 auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Feed card: UFC settled */}
        <div style={{ background: CARD, borderRadius: 18, padding: "15px 16px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: VIOLET }}>UFC · settled</span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "rgba(52,211,153,0.15)", color: "#34d399" }}>FINAL</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 6 }}>{d.ufc.event}</div>
          <div style={{ fontSize: 12.5, color: "#a6a6b6", marginTop: 2 }}>Model {d.ufc.moneylineRecord} moneyline · {d.ufc.moneylineAccuracy}% · cards {d.ufc.cardsRecord}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 12, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {d.ufc.fights.slice(0, 5).map((f, i) => (
              <div key={i} style={{ flexShrink: 0, textAlign: "center", width: 56 }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(139,124,246,0.16)", border: `1px solid ${f.mlResult === "win" ? "#34d399" : "#f87171"}`, fontWeight: 800, fontSize: 13 }}>{initials(f.winner)}</span>
                <div style={{ fontSize: 9.5, color: "#8b8b9b", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.winner.split(" ").pop()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Feed card: Bank Builder */}
        <div style={{ background: "linear-gradient(150deg, rgba(139,124,246,0.16), " + CARD + ")", borderRadius: 18, padding: "15px 16px", border: "1px solid rgba(139,124,246,0.25)" }}>
          <span style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: VIOLET }}>Bank Builder · completed 🏆</span>
          <div style={{ fontWeight: 900, fontSize: 22, marginTop: 6 }}>{usd(d.bankBuilder.start)} → {usd(d.bankBuilder.final)}</div>
          <div style={{ fontSize: 12.5, color: "#a6a6b6", marginTop: 2 }}>{d.bankBuilder.record} · {d.bankBuilder.growthX}× · next ladder coming soon</div>
          <div style={{ display: "flex", gap: 4, marginTop: 12 }}>
            {d.bankBuilder.steps.map((s) => <div key={s.step} style={{ flex: 1, height: 6, borderRadius: 3, background: VIOLET }} />)}
          </div>
        </div>

        {/* Feed card: MLB slate */}
        <div style={{ background: CARD, borderRadius: 18, padding: "15px 16px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#60a5fa" }}>MLB · {d.mlb.date}</span>
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 6 }}>{d.mlb.games} games · {d.mlb.leans} model leans</div>
          <div style={{ fontSize: 12.5, color: "#a6a6b6", marginTop: 2 }}>Tap to open the full board feed.</div>
        </div>

        <p style={{ color: "#5e5e6e", fontSize: 11, marginTop: 6 }}>{d.generatedNote}. <Link href="/design-lab" style={{ color: "#9b9bad" }}>← all versions</Link></p>
      </div>

      {/* sticky bottom nav */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "rgba(14,14,22,0.95)", borderTop: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(10px)", display: "flex", justifyContent: "space-around", padding: "9px 0 16px" }}>
        {[["⌂", "Today", true], ["◎", "Picks", false], ["✦", "UFC", false], ["≡", "Results", false], ["♛", "Bank", false]].map(([icon, label, on]) => (
          <span key={label as string} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: on ? VIOLET : "#6e6e7e" }}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span style={{ fontSize: 10, fontWeight: 700 }}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
