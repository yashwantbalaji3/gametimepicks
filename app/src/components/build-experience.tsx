"use client";
/**
 * BuildExperience — the custom paper-card builder. Shows only parlay-eligible legs across sports,
 * filter by sport/market/risk + search, add/remove into a betslip, compute combined American odds,
 * input any stake (StakePayoutInput), and see live correlation / pre-lineup / regulation-only
 * warnings + Bank Builder eligibility. Paper-only, educational.
 */
import { useEffect, useMemo, useState } from "react";
import type { BuildLeg } from "@/lib/build-legs";
import { americanToDecimal, decimalToAmerican, formatAmerican } from "@/lib/odds-math";
import StakePayoutInput from "@/components/ui/stake-payout-input";
import StatusChip from "@/components/ui/status-chip";
import { getSportIdentity } from "@/lib/sport-identity";

const SPORTS = ["All", "world_cup", "mlb", "nba", "ufc"] as const;
const SPORT_LABEL: Record<string, string> = { All: "All", world_cup: "World Cup", mlb: "MLB", nba: "NBA", ufc: "UFC" };
const SPORT_ICON: Record<string, string> = {
  All: "",
  world_cup: getSportIdentity("world_cup").icon,
  mlb: getSportIdentity("mlb").icon,
  nba: getSportIdentity("nba").icon,
  ufc: getSportIdentity("ufc").icon,
};
const RISKS = ["All", "Low", "Medium", "High", "Longshot"] as const;

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full px-3 py-1 transition-colors shrink-0"
      style={{ background: on ? "var(--vault-gold-dim)" : "transparent", border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`, color: on ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

export default function BuildExperience({ pool }: { pool: BuildLeg[] }) {
  const [sport, setSport] = useState<string>("All");
  const [risk, setRisk] = useState<string>("All");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<BuildLeg[]>([]);
  const [slipOpen, setSlipOpen] = useState(false);
  const [gameFilter, setGameFilter] = useState<string | null>(null);

  const selectedIds = new Set(selected.map((l) => l.id));
  const markets = useMemo(() => Array.from(new Set(pool.map((l) => l.marketLabel))).sort(), [pool]);
  const [market, setMarket] = useState<string>("All");

  // Deep-link prefilter: /build?sport=mlb&q=Seager preselects the sport filter + search
  // (read client-side so it works under static export). "Build from this game" links here.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const sp = p.get("sport");
    if (sp && ["world_cup", "mlb", "nba", "ufc"].includes(sp)) setSport(sp);
    const query = p.get("q");
    if (query) setQ(query);
    const game = p.get("game");
    if (game) setGameFilter(game);
  }, []);

  const filtered = useMemo(
    () =>
      pool.filter((l) => {
        if (gameFilter && String(l.gameId) !== gameFilter) return false;
        if (sport !== "All" && l.sport !== sport) return false;
        if (risk !== "All" && l.riskTier !== risk) return false;
        if (market !== "All" && l.marketLabel !== market) return false;
        if (q && !l.searchKey.includes(q.toLowerCase())) return false;
        return true;
      }),
    [pool, sport, risk, market, q, gameFilter],
  );

  const add = (l: BuildLeg) => setSelected((s) => (s.some((x) => x.id === l.id) ? s : [...s, l]));
  const remove = (id: string) => setSelected((s) => s.filter((x) => x.id !== id));

  const combinedDecimal = selected.reduce((acc, l) => acc * americanToDecimal(l.americanOdds), 1);
  const combinedAmerican = selected.length ? decimalToAmerican(combinedDecimal) : 0;

  // Warnings.
  const gameIds = selected.map((l) => l.gameId).filter((g) => g != null);
  const correlated = new Set(gameIds).size < gameIds.length;
  const hasPrelineup = selected.some((l) => l.prelineup);
  const hasSoccer = selected.some((l) => l.regulationOnly);
  const bankEligible = selected.length >= 2 && selected.every((l) => l.bankBuilderEligible);

  const betslipCard = (
    <div className="rounded-[10px] px-4 py-4 flex flex-col gap-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>3 · Your card &amp; paper stake</span>
        <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{selected.length} leg{selected.length === 1 ? "" : "s"}</span>
      </div>
      {selected.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>Build a paper card in three steps:</p>
          <ol className="flex flex-col gap-1">
            {["Pick a sport above", "Tap + on any eligible leg", "Set a stake to see the payout"].map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="font-mono rounded-full flex items-center justify-center shrink-0" style={{ width: 18, height: 18, background: "var(--vault-gold-dim)", color: "var(--vault-gold-bright)", fontSize: 10, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {selected.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 min-w-0">
                <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{l.label}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{formatAmerican(l.americanOdds)}</span>
                  <button type="button" onClick={() => remove(l.id)} aria-label="Remove" style={{ color: "var(--vault-text-faint)", fontSize: 14 }}>×</button>
                </div>
              </div>
            ))}
          </div>
          <StakePayoutInput combinedAmerican={combinedAmerican} defaultStake={25} />
          {(correlated || hasPrelineup || hasSoccer || selected.length < 2 || bankEligible) ? (
            <div className="flex flex-col gap-1 pt-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
              {selected.length < 2 ? <StatusChip label="Single leg — add another for a parlay" /> : null}
              {correlated ? <StatusChip label="Correlated — legs share a game" /> : null}
              {hasPrelineup ? <StatusChip label="Lineup pending — confirm starter" /> : null}
              {hasSoccer ? <StatusChip label="Soccer legs are 90-min regulation only" /> : null}
              <StatusChip label={bankEligible ? "Bank Builder eligible" : "Not Bank Builder eligible"} />
            </div>
          ) : null}
        </>
      )}
      <span style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Paper only — not betting advice.</span>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Leg pool */}
      <div className="lg:col-span-2 flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {/* Progress rail: Sport → Game → Legs → Stake (casino rebuild). */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" aria-label="Build steps">
            {[
              { label: "1 Sport", done: sport !== "All" },
              { label: "2 Game", done: !!gameFilter },
              { label: "3 Legs", done: selected.length > 0 },
              { label: "4 Stake", done: false },
            ].map((st, i, arr) => (
              <span key={st.label} className="flex items-center gap-1.5 shrink-0">
                <span className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]"
                  style={{
                    color: st.done ? "var(--vault-success)" : "var(--vault-text-mute)",
                    border: `1px solid ${st.done ? "rgba(110,231,168,0.45)" : "var(--vault-rule)"}`,
                    background: st.done ? "rgba(110,231,168,0.08)" : "transparent",
                  }}>
                  {st.done ? "✓ " : ""}{st.label}
                </span>
                {i < arr.length - 1 ? <span aria-hidden style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>→</span> : null}
              </span>
            ))}
          </div>
          {gameFilter ? (
            <button type="button" onClick={() => setGameFilter(null)}
              className="self-start inline-flex items-center gap-2 rounded-full px-3 py-1"
              style={{ background: "var(--vault-gold-dim)", border: "1px solid var(--vault-gold-bright)", color: "var(--vault-gold-bright)", fontSize: 11.5, fontWeight: 600 }}>
              Building from {pool.find((l) => String(l.gameId) === gameFilter)?.gameLabel ?? "this game"} <span style={{ opacity: 0.85 }}>· clear ✕</span>
            </button>
          ) : null}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {SPORTS.map((s) => <Pill key={s} on={sport === s} onClick={() => setSport(s)}>{SPORT_ICON[s] ? <span aria-hidden style={{ marginRight: 5, fontSize: 11 }}>{SPORT_ICON[s]}</span> : null}{SPORT_LABEL[s]}</Pill>)}
          </div>
          {/* Game selector — appears when a single sport is chosen (step 1 of the flow). */}
          {sport !== "All" ? (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <Pill on={!gameFilter} onClick={() => setGameFilter(null)}>All games</Pill>
              {[...new Map(pool.filter((l) => l.sport === sport && l.gameId != null && l.gameLabel).map((l) => [String(l.gameId), l.gameLabel as string])).entries()].map(([gid, glabel]) => (
                <Pill key={gid} on={gameFilter === gid} onClick={() => setGameFilter(gid)}>{glabel}</Pill>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {RISKS.map((r) => <Pill key={r} on={risk === r} onClick={() => setRisk(r)}>{r}</Pill>)}
            <span className="mx-1" style={{ color: "var(--vault-rule)" }}>|</span>
            <Pill on={market === "All"} onClick={() => setMarket("All")}>All markets</Pill>
            {markets.slice(0, 8).map((m) => <Pill key={m} on={market === m} onClick={() => setMarket(m)}>{m}</Pill>)}
          </div>
          {/* Search is secondary (v4): pills are the primary control. */}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team or player…"
            className="rounded-[8px] px-3 py-2"
            style={{ background: "rgba(26, 16, 11,0.7)", border: "1px solid var(--vault-rule)", color: "var(--vault-text)", fontSize: 14 }} />

        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            {filtered.length} eligible leg{filtered.length === 1 ? "" : "s"}
          </span>
          {(sport !== "All" || risk !== "All" || market !== "All" || q || gameFilter || selected.length > 0) ? (
            <button type="button" onClick={() => { setSport("All"); setRisk("All"); setMarket("All"); setQ(""); setGameFilter(null); setSelected([]); }}
              className="vault-press font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>
              Start over ✕
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto pr-1">
          {filtered.map((l) => {
            const on = selectedIds.has(l.id);
            return (
              <div key={l.id} className="flex items-center gap-2.5 rounded-[7px] px-3 py-2 min-w-0"
                style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}>
                {!l.photo ? (
                  <span className="gtp-sport-orb shrink-0" style={{ width: 22, height: 22, fontSize: 12, ["--orb-grad" as string]: getSportIdentity(l.sport).gradient }} role="img" aria-label={getSportIdentity(l.sport).label}>
                    {getSportIdentity(l.sport).icon}
                  </span>
                ) : null}
                {l.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.photo} alt="" width={28} height={28} className="rounded-full shrink-0" style={{ objectFit: "cover" }} />
                ) : null}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{l.label}</span>
                  <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                    {l.sportLabel} · {l.sublabel}{l.prelineup ? " · lineup pending" : ""}
                  </span>
                </div>
                <span className="font-mono shrink-0" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{formatAmerican(l.americanOdds)}</span>
                <button type="button" onClick={() => (on ? remove(l.id) : add(l))}
                  className="rounded-full shrink-0 flex items-center justify-center"
                  style={{ width: 24, height: 24, background: on ? "var(--vault-gold-bright)" : "transparent", border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`, color: on ? "#170f0a" : "var(--vault-text-mute)", fontSize: 15, fontWeight: 700, lineHeight: 1 }}
                  aria-label={on ? "Remove leg" : "Add leg"}>
                  {on ? "−" : "+"}
                </button>
              </div>
            );
          })}
          {filtered.length === 0 ? (
            <p className="text-center py-6" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>No eligible legs match this filter.</p>
          ) : null}
        </div>
      </div>

      {/* Betslip — desktop sticky column */}
      <div className="hidden lg:flex flex-col gap-3 lg:sticky lg:top-4 self-start">
        {betslipCard}
      </div>

      {/* Betslip — mobile sticky bottom bar + slide-up drawer */}
      <div className="lg:hidden">
        {!slipOpen && (
          <button type="button" onClick={() => setSlipOpen(true)}
            className="vault-press fixed left-3 right-3 z-40 flex items-center justify-between gap-2 rounded-full px-5 py-3 shadow-lg"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)", background: "var(--vault-gold-bright)", color: "#170f0a", fontWeight: 700, border: "none" }}>
            <span style={{ fontSize: 14 }}>View card · {selected.length} leg{selected.length === 1 ? "" : "s"}</span>
            <span className="font-mono tabular" style={{ fontSize: 14 }}>{selected.length >= 1 ? formatAmerican(combinedAmerican) : "—"}</span>
          </button>
        )}
        {slipOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setSlipOpen(false)}>
            <div className="rounded-t-[16px] max-h-[82vh] overflow-y-auto px-3 pb-6 pt-3" onClick={(e) => e.stopPropagation()} style={{ background: "var(--vault-bg, #170f0a)", borderTop: "1px solid var(--vault-border-strong)" }}>
              <div className="flex items-center justify-between gap-2 mb-2 px-1">
                <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>3 · Your card &amp; paper stake</span>
                <button type="button" onClick={() => setSlipOpen(false)} className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>Close ✕</button>
              </div>
              {betslipCard}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
