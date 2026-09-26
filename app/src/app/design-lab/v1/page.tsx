/**
 * Design Lab V1 — Immersive Fight Card. Event-first, dark, big matchup cards with fighter
 * avatars + sharp stat comparisons. Real data via the read-only adapter. Preview-only.
 */
import Link from "next/link";
import { loadDesignLabData, initials, usd } from "@/lib/design-lab/data";

export const metadata = { title: "Design Lab V1 · Immersive Fight Card" };
const RED = "#E11D2A";
const BG = "#09090B";

function Avatar({ name, win }: { name: string; win?: boolean }) {
  return (
    <span style={{ width: 52, height: 52, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: win ? "rgba(225,29,42,0.16)" : "rgba(255,255,255,0.06)", border: `1.5px solid ${win ? RED : "rgba(255,255,255,0.12)"}`,
      color: win ? "#fff" : "#cfcfd4", fontWeight: 800, fontSize: 17 }}>{initials(name)}</span>
  );
}

export default function V1() {
  const d = loadDesignLabData();
  const main = d.ufc.fights[d.ufc.fights.length - 1]; // main event (Topuria/Gaethje)
  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#fff", paddingBottom: 78 }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 14px" }}>
        {/* sport switcher */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "16px 0 6px", WebkitOverflowScrolling: "touch" }}>
          {["UFC", "MLB", "NBA", "Soccer", "Bank"].map((s, i) => (
            <span key={s} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700,
              background: i === 0 ? RED : "rgba(255,255,255,0.06)", color: i === 0 ? "#fff" : "#9a9aa2" }}>{s}</span>
          ))}
        </div>

        {/* Featured main-event matchup hero */}
        <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "radial-gradient(120% 120% at 50% 0%, rgba(225,29,42,0.18), transparent 60%), #101013", marginTop: 8 }}>
          <div style={{ padding: "12px 16px 0", fontFamily: "monospace", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: RED }}>Main event · settled</div>
          {main ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 18px" }}>
              <div style={{ textAlign: "center", width: 96 }}>
                <Avatar name={main.a} win={main.winner === main.a} />
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>{main.a}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#7a7a82", fontFamily: "monospace" }}>FINAL</div>
                <div style={{ fontWeight: 900, fontSize: 22, color: RED }}>VS</div>
                <div style={{ fontSize: 10.5, color: "#9a9aa2" }}>{main.winner.split(" ").pop()} · R{main.endRound}</div>
              </div>
              <div style={{ textAlign: "center", width: 96 }}>
                <Avatar name={main.b} win={main.winner === main.b} />
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>{main.b}</div>
              </div>
            </div>
          ) : null}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "10px 16px", fontSize: 12, color: "#a6a6ae" }}>
            {d.ufc.event} · model went <b style={{ color: "#fff" }}>{d.ufc.moneylineRecord}</b> moneyline
          </div>
        </div>

        {/* Fight card list */}
        <h2 style={{ fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8a8a92", margin: "22px 0 10px" }}>Full card · {d.ufc.fightCount} fights</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {d.ufc.fights.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, background: "#101013", border: "1px solid rgba(255,255,255,0.07)" }}>
              <Avatar name={f.winner === f.a ? f.a : f.b} win />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.a} <span style={{ color: "#6a6a72" }}>vs</span> {f.b}</div>
                <div style={{ fontSize: 11, color: "#8a8a92", fontFamily: "monospace" }}>{f.winner.split(" ").pop()} · {f.result === "decision" ? "decision" : `R${f.endRound} ${f.time}`}</div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: f.mlResult === "win" ? "#34d399" : "#f87171" }}>{f.mlResult === "win" ? "MODEL ✓" : "MISS"}</span>
            </div>
          ))}
        </div>

        {/* Bank Builder cinematic ladder */}
        <h2 style={{ fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8a8a92", margin: "22px 0 10px" }}>Bank Builder · completed</h2>
        <div style={{ borderRadius: 16, padding: "16px 16px", background: "linear-gradient(160deg, rgba(225,29,42,0.12), #101013)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontWeight: 900, fontSize: 24 }}>{usd(d.bankBuilder.start)} → {usd(d.bankBuilder.final)}</div>
          <div style={{ fontSize: 12, color: "#a6a6ae", marginTop: 2 }}>{d.bankBuilder.record} · {d.bankBuilder.growthX}× · Road to $10K completed</div>
          <div style={{ display: "flex", gap: 5, marginTop: 12 }}>
            {d.bankBuilder.steps.map((s) => (
              <div key={s.step} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ height: 4, borderRadius: 2, background: RED }} />
                <div style={{ fontSize: 9, color: "#7a7a82", marginTop: 4, fontFamily: "monospace" }}>S{s.step}</div>
              </div>
            ))}
          </div>
        </div>
        <FootNote note={d.generatedNote} />
      </div>
      <BottomNav active="UFC" />
    </div>
  );
}

function FootNote({ note }: { note: string }) {
  return <p style={{ color: "#5a5a62", fontSize: 11, marginTop: 18 }}>{note}. <Link href="/design-lab" style={{ color: "#8a8a92" }}>← all versions</Link></p>;
}
function BottomNav({ active }: { active: string }) {
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "rgba(9,9,11,0.92)", borderTop: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "space-around", padding: "10px 0 14px" }}>
      {["Today", "UFC", "Picks", "Results", "Bank"].map((t) => (
        <span key={t} style={{ fontSize: 11, fontWeight: 700, color: t === active ? RED : "#7a7a82" }}>{t}</span>
      ))}
    </div>
  );
}
