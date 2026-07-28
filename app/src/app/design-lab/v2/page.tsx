/**
 * Design Lab V2 — Premium Analytics Dashboard. Graphite/navy trader screen: dense metric tiles,
 * edge + confidence meters, scannable rows. Real data via the read-only adapter. Preview-only.
 */
import Link from "next/link";
import { loadDesignLabData, usd } from "@/lib/design-lab/data";

export const metadata = { title: "Design Lab V2 · Premium Dashboard" };
const CYAN = "#22D3EE";
const BG = "#0B0F14";
const PANEL = "#121821";

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: PANEL, border: "1px solid #1d2733", borderRadius: 12, padding: "12px 13px" }}>
      <div style={{ fontFamily: "monospace", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7787" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent ?? "#eef3f8", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: "#7e8a99", marginTop: 1 }}>{sub}</div> : null}
    </div>
  );
}
function Meter({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: "#1d2733", overflow: "hidden" }}>
      <div style={{ width: `${Math.round(pct * 100)}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );
}

export default function V2() {
  const d = loadDesignLabData();
  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#eef3f8", padding: "0 0 40px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "18px 14px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: CYAN }}>Dashboard · {d.mlb.date || "today"}</span>
          <span style={{ fontFamily: "monospace", fontSize: 10.5, color: "#6b7787" }}>paper-only</span>
        </div>
        <h1 style={{ fontSize: "clamp(22px,5vw,30px)", fontWeight: 800, margin: "6px 0 14px" }}>Model & slate overview</h1>

        {/* Top metric grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          <Tile label="Bank Builder" value={usd(d.bankBuilder.final)} sub={`${d.bankBuilder.record} · ${d.bankBuilder.growthX}× · ${d.bankBuilder.status}`} accent={CYAN} />
          <Tile label="UFC moneyline" value={d.ufc.moneylineRecord} sub={`${d.ufc.moneylineAccuracy}% accuracy · settled`} accent="#34d399" />
          <Tile label="UFC suggested cards" value={d.ufc.cardsRecord} sub="all busted by 1 upset" accent="#f87171" />
          <Tile label="MLB slate" value={`${d.mlb.games} games`} sub={`${d.mlb.leans} model leans`} />
        </div>

        {/* Fight grades with confidence meters */}
        <h2 style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7787", margin: "22px 0 10px" }}>UFC moneyline grades · model confidence vs result</h2>
        <div style={{ background: PANEL, border: "1px solid #1d2733", borderRadius: 12, overflow: "hidden" }}>
          {d.ufc.fights.map((f, i) => (
            <div key={i} style={{ padding: "11px 13px", borderTop: i ? "1px solid #1a232e" : "none", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.mlPick}</div>
                <div style={{ marginTop: 5, width: 130, maxWidth: "40vw" }}><Meter pct={f.mlProb ?? 0.5} color={f.mlResult === "win" ? CYAN : "#f87171"} /></div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 700 }}>{Math.round((f.mlProb ?? 0) * 100)}%</div>
                <div style={{ fontSize: 10, fontWeight: 800, color: f.mlResult === "win" ? "#34d399" : "#f87171" }}>{f.mlResult === "win" ? "HIT" : "MISS"}</div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: "#7e8a99", marginTop: 8 }}>Calibration: high-confidence chalk (80%+) went 1/2 — the lone miss (the −520 favorite) also busted all four suggested cards.</p>

        {/* Bank Builder metric ladder */}
        <h2 style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6b7787", margin: "22px 0 10px" }}>Bank Builder ladder · {d.bankBuilder.record}</h2>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${d.bankBuilder.steps.length}, 1fr)`, gap: 6 }}>
          {d.bankBuilder.steps.map((s) => (
            <div key={s.step} style={{ background: PANEL, border: "1px solid #1d2733", borderRadius: 9, padding: "9px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 9.5, color: "#6b7787", fontFamily: "monospace" }}>STEP {s.step}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: CYAN, marginTop: 2 }}>{usd(s.after)}</div>
              <div style={{ fontSize: 8.5, color: "#7e8a99", marginTop: 2 }}>{s.sport.split(" ")[0]}</div>
            </div>
          ))}
        </div>

        <p style={{ color: "#5a6473", fontSize: 11, marginTop: 22 }}>{d.generatedNote}. <Link href="/design-lab" style={{ color: "#7e8a99" }}>← all versions</Link></p>
      </div>
    </div>
  );
}
