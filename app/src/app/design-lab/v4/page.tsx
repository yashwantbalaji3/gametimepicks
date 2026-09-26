/**
 * Design Lab V4 — Editorial Casino / Premium Picks Magazine. Warm gold/crimson, large editorial
 * hero, scroll-first storytelling: the $100→$10K narrative + UFC recap. Real data via the
 * read-only adapter. Preview-only. Biggest palette departure from the other three versions.
 */
import Link from "next/link";
import { loadDesignLabData, usd } from "@/lib/design-lab/data";

export const metadata = { title: "Design Lab V4 · Editorial Casino" };
const GOLD = "#F0C75E";
const CRIMSON = "#C0392B";
const BG = "#150D06";

export default function V4() {
  const d = loadDesignLabData();
  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#F7EFE0", paddingBottom: 48, fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 18px" }}>
        {/* Masthead */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 0 10px", borderBottom: `1px solid ${GOLD}33` }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.24em", textTransform: "uppercase", color: GOLD }}>The GameTime Post</span>
          <span style={{ fontFamily: "monospace", fontSize: 10.5, color: "#a89878" }}>paper-only edition</span>
        </div>

        {/* Magazine hero — the $100 → $10K story */}
        <div style={{ padding: "26px 0 10px" }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: CRIMSON }}>The cover story · Bank Builder</span>
          <h1 style={{ fontSize: "clamp(30px,8vw,52px)", fontWeight: 800, lineHeight: 1.02, margin: "8px 0 0", color: GOLD }}>
            {usd(d.bankBuilder.start)} to {usd(d.bankBuilder.final)}.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.45, color: "#e6d8bf", marginTop: 12 }}>
            A {d.bankBuilder.record} paper ladder, {d.bankBuilder.growthX}× the start, every rung settled from official results — then the run reached the $10,000 crown. The next ladder is being lined up.
          </p>
          <span style={{ display: "inline-block", marginTop: 14, padding: "9px 16px", borderRadius: 4, background: GOLD, color: "#1a1206", fontFamily: "monospace", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em" }}>NEXT BANK BUILDER — COMING SOON</span>
          {/* rungs */}
          <div style={{ display: "flex", gap: 6, marginTop: 18 }}>
            {d.bankBuilder.steps.map((s) => (
              <div key={s.step} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ height: 5, background: `linear-gradient(90deg,${CRIMSON},${GOLD})`, borderRadius: 3 }} />
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#a89878", marginTop: 5 }}>{usd(s.after)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* UFC recap story */}
        <div style={{ borderTop: `1px solid ${GOLD}22`, marginTop: 26, paddingTop: 22 }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: CRIMSON }}>The learning slate · UFC</span>
          <h2 style={{ fontSize: "clamp(22px,5vw,30px)", fontWeight: 800, margin: "8px 0 0", lineHeight: 1.1 }}>
            {d.ufc.moneylineRecord} on the cards, {d.ufc.cardsRecord} on the slips.
          </h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "#d8cbb2", marginTop: 10 }}>
            {d.ufc.event} settled at <b style={{ color: GOLD }}>{d.ufc.moneylineRecord}</b> straight up ({d.ufc.moneylineAccuracy}%) — including a called underdog. But every suggested card leaned on {d.ufc.upsetWinner ? "the same favorite" : "one fight"}, and one upset ({d.ufc.upsetWinner ?? "the main event"} won) sank all four. The lesson: diversify the slips.
          </p>
          {/* result strip */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
            {d.ufc.fights.map((f, i) => (
              <span key={i} style={{ fontFamily: "monospace", fontSize: 11, padding: "4px 9px", borderRadius: 4, border: `1px solid ${GOLD}33`,
                color: f.mlResult === "win" ? GOLD : "#e08a8a", background: f.mlResult === "win" ? `${GOLD}11` : `${CRIMSON}22` }}>
                {f.winner.split(" ").pop()} {f.mlResult === "win" ? "✓" : "✕"}
              </span>
            ))}
          </div>
        </div>

        {/* Results recap pull-quote */}
        <div style={{ borderTop: `1px solid ${GOLD}22`, marginTop: 26, paddingTop: 22 }}>
          <blockquote style={{ margin: 0, fontSize: 19, lineHeight: 1.4, fontStyle: "italic", color: "#efe2c9", borderLeft: `3px solid ${CRIMSON}`, paddingLeft: 16 }}>
            “Five rungs, settled from official box scores. The model went 6-1 on its first fight night. The slips are the work-in-progress.”
          </blockquote>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#a89878", marginTop: 18 }}>{d.generatedNote}. <Link href="/design-lab" style={{ color: GOLD }}>← all versions</Link></p>
        </div>
      </div>
    </div>
  );
}
