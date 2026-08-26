"use client";
/**
 * BuildExperience — the Parlay Center's Build Your Own mode (P208 · Release A).
 *
 * THE DRAFT IS THE SLIP. Selection state lives in the shared slip store (browser-local,
 * localStorage) rather than in this component's memory, so:
 *   · a card started from a suggested ladder card ("Customize this card") and a card built leg by
 *     leg are the SAME draft in the SAME store under the SAME identity rule (lib/slip/leg-identity);
 *   · navigating to a game report or the glossary and coming back does not erase the draft;
 *   · a leg added from the MLB props board or the risk ladder is already on the card here.
 *
 * The engine stays singular: combined odds from odds-math, conflicts from build/compatibility
 * (provable-only), grades from build/grade. Legs on the draft that are NOT in today's eligible pool
 * render with an explicit "not in today's pool" state — disclosed, removable, never silently
 * dropped, and excluded from conflict proofs it cannot make.
 *
 * Paper-only, educational; nothing here is placed or recorded.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { BuildLeg } from "@/lib/build-legs";
import { tierFromOdds } from "@/lib/build/risk-tier.mjs";
import { americanToDecimal, decimalToAmerican, formatAmerican } from "@/lib/odds-math";
import StakePayoutInput from "@/components/ui/stake-payout-input";
import StatusChip from "@/components/ui/status-chip";
import PlayerAvatar from "@/components/player-avatar";
import { classifyAgainstSelection, cardHealth } from "@/lib/build/compatibility.mjs";
import { gradeLeg } from "@/lib/build/grade.mjs";
import { getSportIdentity } from "@/lib/sport-identity";
import { useSlip, type SlipLeg } from "@/lib/slip/slip-store";
import { legKey, type SlipLegInput } from "@/lib/slip/leg-identity";

// The 2026 World Cup is complete — not a selectable build sport (archive only). The SPORT_LABEL map below
// keeps the "World Cup" label so any historical WC row still renders its badge.
const SPORTS = ["All", "mlb", "nba", "ufc"] as const;
const SPORT_LABEL: Record<string, string> = { All: "All", world_cup: "World Cup", mlb: "MLB", nba: "NBA", ufc: "UFC" };
const SPORT_ICON: Record<string, string> = {
  All: "",
  world_cup: getSportIdentity("world_cup").icon,
  mlb: getSportIdentity("mlb").icon,
  nba: getSportIdentity("nba").icon,
  ufc: getSportIdentity("ufc").icon,
};
const RISKS = ["All", "Low", "Medium", "High", "Longshot"] as const;

/** A suggested card the custom mode can seed the draft from (server-resolved, slip-shaped legs). */
export interface SeedableCard {
  readonly label: string;
  readonly legs: readonly SlipLegInput[];
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full px-3 py-1 transition-colors shrink-0"
      style={{ background: on ? "var(--vault-gold-dim)" : "transparent", border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`, color: on ? "var(--vault-gold-bright)" : "var(--vault-text-mute)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", minHeight: 28 }}>
      {children}
    </button>
  );
}

/** A draft leg joined against today's pool: the full BuildLeg when the pool still carries it,
 *  otherwise a provable-only stub that discloses its own staleness. */
interface DraftLeg {
  readonly key: string;
  readonly slip: SlipLeg;
  readonly pool: BuildLeg | null;
  /** BuildLeg-shaped view for the shared conflict/health engine. */
  readonly engineLeg: BuildLeg;
}

export default function BuildExperience({
  pool, productDate = null, cards = {},
}: {
  pool: BuildLeg[];
  productDate?: string | null;
  /** slipId → seedable card, for /build/custom?card=<slipId> ("Customize this card"). */
  cards?: Record<string, SeedableCard>;
}) {
  const [sport, setSport] = useState<string>("All");
  const [risk, setRisk] = useState<string>("All");
  const [q, setQ] = useState("");
  const [slipOpen, setSlipOpen] = useState(false);
  const [gameFilter, setGameFilter] = useState<string | null>(null);
  const [seedNote, setSeedNote] = useState<string | null>(null);

  const { legs: slipLegs, ready, add, remove, clear } = useSlip();

  const markets = useMemo(() => Array.from(new Set(pool.map((l) => l.marketLabel))).sort(), [pool]);
  const [market, setMarket] = useState<string>("All");

  /** Canonical key → pool leg, for resolving the draft against today's eligibility. */
  const poolByKey = useMemo(() => {
    const m = new Map<string, BuildLeg>();
    for (const l of pool) if (l.slipLeg) m.set(legKey(l.slipLeg), l);
    return m;
  }, [pool]);

  // Deep-link prefilter: /build/custom?sport=mlb&q=Seager preselects the sport filter + search
  // (read client-side so it works under static export). "Build from this game" links here.
  const seededRef = useRef(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const sp = p.get("sport");
    if (sp && ["mlb", "nba", "ufc"].includes(sp)) setSport(sp);
    const query = p.get("q");
    if (query) setQ(query);
    const game = p.get("game");
    if (game) setGameFilter(game);
  }, []);

  // ?card=<slipId>: seed the draft from a suggested card — once per mount, only after the store has
  // loaded, adding only legs not already on the card. Removals afterwards are the reader's edits and
  // are never re-seeded. The note reports exactly what happened, including the legs it could not add.
  useEffect(() => {
    if (!ready || seededRef.current) return;
    const id = new URLSearchParams(window.location.search).get("card");
    if (!id) return;
    seededRef.current = true;
    const card = cards[id];
    if (!card) { setSeedNote("That suggested card is not on today's slate — nothing was added."); return; }
    const have = new Set(slipLegs.map((l) => l.key));
    let added = 0, present = 0, unpriced = 0, overCap = 0;
    let room = 12 - have.size;
    for (const leg of card.legs) {
      const k = legKey(leg);
      if (have.has(k)) { present += 1; continue; }
      if (!Number.isFinite(leg.americanOdds) || leg.americanOdds === 0) { unpriced += 1; continue; }
      if (room <= 0) { overCap += 1; continue; }
      add({ ...leg, key: k });
      have.add(k); added += 1; room -= 1;
    }
    const parts = [`Loaded ${added} leg${added === 1 ? "" : "s"} from ${card.label}`];
    if (present) parts.push(`${present} already on your card`);
    if (unpriced) parts.push(`${unpriced} without a current price`);
    if (overCap) parts.push(`${overCap} over the 12-leg cap`);
    setSeedNote(parts.join(" · ") + ". Edit it like any draft — remove or add legs below.");
  }, [ready, cards, slipLegs, add]);

  /** The draft, resolved against today's pool. Stub legs stay conflict-neutral (nothing provable). */
  const draft: DraftLeg[] = useMemo(() =>
    slipLegs.map((s) => {
      const poolLeg = poolByKey.get(s.key) ?? null;
      const engineLeg: BuildLeg = poolLeg ?? {
        id: `slip:${s.key}`, sport: (s.sport as BuildLeg["sport"]), sportLabel: SPORT_LABEL[s.sport] ?? s.sport.toUpperCase(),
        gameId: null, label: `${s.player} · ${s.marketLabel}${s.side ? ` ${s.side}` : ""}${s.line != null ? ` ${s.line}` : ""}`,
        sublabel: s.matchup ?? "", market: s.marketLabel, marketLabel: s.marketLabel,
        riskTier: tierFromOdds(s.americanOdds), americanOdds: s.americanOdds,
        modelProbability: null, sourceDate: null, photo: s.photoUrl ?? null,
        prelineup: false, regulationOnly: false, bankBuilderEligible: false,
        searchKey: "", slipLeg: s,
      };
      return { key: s.key, slip: s, pool: poolLeg, engineLeg };
    }), [slipLegs, poolByKey]);

  const selectedEngine = useMemo(() => draft.map((d) => d.engineLeg), [draft]);
  const selectedKeys = useMemo(() => new Set(draft.map((d) => d.key)), [draft]);
  const staleCount = draft.filter((d) => !d.pool).length;

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

  const addLeg = (l: BuildLeg) => { if (l.slipLeg) add({ ...l.slipLeg, key: legKey(l.slipLeg) }); };

  const combinedDecimal = draft.reduce((acc, d) => acc * americanToDecimal(d.slip.americanOdds), 1);
  const combinedAmerican = draft.length ? decimalToAmerican(combinedDecimal) : 0;

  // Warnings — computed over the RESOLVED legs (provable facts only; stubs prove nothing).
  const gameIds = selectedEngine.map((l) => l.gameId).filter((g) => g != null);
  const correlated = new Set(gameIds).size < gameIds.length;
  const hasPrelineup = selectedEngine.some((l) => l.prelineup);
  const hasSoccer = selectedEngine.some((l) => l.regulationOnly);
  // Bank-Builder eligibility requires every leg resolved AND eligible — a stale leg is never assumed in.
  const bankEligible = draft.length >= 2 && staleCount === 0 && selectedEngine.every((l) => l.bankBuilderEligible);

  const betslipCard = (
    <div className="rounded-[10px] px-4 py-4 flex flex-col gap-3" style={{ background: "rgba(11, 18, 14,0.55)", border: "1px solid var(--vault-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>Your card &amp; paper stake</span>
        <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{draft.length} leg{draft.length === 1 ? "" : "s"}</span>
      </div>
      {/* Card health (Release F): structural facts only — games, concentration, unvalidated
          same-game pairs. Never a quality score; the engine has no model inputs to score with. */}
      {draft.length >= 2 ? (() => {
        const h = cardHealth(selectedEngine);
        return (
          <p aria-live="polite" style={{ color: h.concentrated ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)", fontSize: 11, lineHeight: 1.5 }}>
            {h.legs} legs across {h.games} game{h.games === 1 ? "" : "s"}
            {h.concentrated ? ` · ${h.maxLegsInOneGame} in one game — outcomes there can move together (correlation not validated)` : " · all different games"}
          </p>
        );
      })() : null}
      {draft.length === 0 ? (
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
          <p style={{ color: "var(--vault-text-faint)", fontSize: 11, lineHeight: 1.5 }}>
            Or start from a suggested card — every card there has a Customize action that loads its legs here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {draft.map((d) => (
              <div key={d.key} className="flex items-center justify-between gap-2 min-w-0">
                <span className="min-w-0 flex flex-col">
                  <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{d.engineLeg.label}</span>
                  {!d.pool ? (
                    <span style={{ color: "var(--vault-warn)", fontSize: 10, lineHeight: 1.4 }}>
                      Outside the builder&rsquo;s pool right now — price as added; conflicts can&rsquo;t be checked here
                    </span>
                  ) : null}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{formatAmerican(d.slip.americanOdds)}</span>
                  <button type="button" onClick={() => remove(d.key)} aria-label={`Remove ${d.slip.player}`} className="flex items-center justify-center" style={{ color: "var(--vault-text-faint)", fontSize: 14, minWidth: 28, minHeight: 28 }}>×</button>
                </div>
              </div>
            ))}
          </div>
          <StakePayoutInput combinedAmerican={combinedAmerican} defaultStake={25} />
          {(correlated || hasPrelineup || hasSoccer || draft.length < 2 || bankEligible || staleCount > 0) ? (
            <div className="flex flex-col gap-1 pt-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
              {draft.length < 2 ? <StatusChip label="Single leg — add another for a parlay" /> : null}
              {correlated ? <StatusChip label="Correlated — legs share a game" /> : null}
              {hasPrelineup ? <StatusChip label="Lineup pending — confirm starter" /> : null}
              {hasSoccer ? <StatusChip label="Soccer legs are 90-min regulation only" /> : null}
              {staleCount > 0 ? <StatusChip label={`${staleCount} leg${staleCount === 1 ? "" : "s"} not in today's pool`} /> : null}
              <StatusChip label={bankEligible ? "Bank Builder eligible" : "Not Bank Builder eligible"} />
            </div>
          ) : null}
          <button type="button" onClick={clear} className="self-start font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10, minHeight: 28 }}>
            Clear card ✕
          </button>
        </>
      )}
      <span style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Paper only — not betting advice. Your card stays in this browser and is never recorded.</span>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Leg pool */}
      <div className="lg:col-span-2 flex flex-col gap-3">
        {seedNote ? (
          <p role="status" className="rounded-[8px] px-3 py-2 m-0" style={{ background: "var(--vault-gold-dim)", border: "1px solid var(--vault-gold-bright)", color: "var(--vault-text)", fontSize: 12.5, lineHeight: 1.5 }}>
            {seedNote}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          {/* Progress rail: Sport → Game → Legs → Stake (casino rebuild). */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" aria-label="Build steps">
            {[
              { label: "1 Sport", done: sport !== "All" },
              { label: "2 Game", done: !!gameFilter },
              { label: "3 Legs", done: draft.length > 0 },
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
              style={{ background: "var(--vault-gold-dim)", border: "1px solid var(--vault-gold-bright)", color: "var(--vault-gold-bright)", fontSize: 11.5, fontWeight: 600, minHeight: 28 }}>
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
            style={{ background: "rgba(11, 18, 14,0.7)", border: "1px solid var(--vault-rule)", color: "var(--vault-text)", fontSize: 14 }} />

        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
            {filtered.length} eligible leg{filtered.length === 1 ? "" : "s"}
          </span>
          {(sport !== "All" || risk !== "All" || market !== "All" || q || gameFilter) ? (
            <button type="button" onClick={() => { setSport("All"); setRisk("All"); setMarket("All"); setQ(""); setGameFilter(null); }}
              className="vault-press font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10, minHeight: 28 }}>
              Reset filters ✕
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto pr-1">
          {filtered.map((l) => {
            const key = l.slipLeg ? legKey(l.slipLeg) : null;
            const on = key != null && selectedKeys.has(key);
            // Provable-only compatibility (Program 144 Release F): a hard conflict disables the
            // add control WITH its reason beside it; an unvalidated same-game overlap is disclosed
            // but never blocked. classifyAgainstSelection never runs for legs already on the card.
            const compat = on ? null : classifyAgainstSelection(l, selectedEngine);
            const blocked = compat?.hardDisable === true || key == null;
            return (
              <div key={l.id} className="flex items-center gap-2.5 rounded-[7px] px-3 py-2 min-w-0"
                style={{ background: "rgba(0,0,0,0.30)", border: "1px solid var(--vault-rule)" }}>
                {!l.photo ? (
                  <span className="gtp-sport-orb shrink-0" style={{ width: 22, height: 22, fontSize: 12, ["--orb-grad" as string]: getSportIdentity(l.sport).gradient }} role="img" aria-label={getSportIdentity(l.sport).label}>
                    {getSportIdentity(l.sport).icon}
                  </span>
                ) : null}
                {l.photo ? (
                  <PlayerAvatar photoUrl={l.photo} playerName={l.label} size="xs" flat />
                ) : null}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{l.label}</span>
                  <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
                    {l.sportLabel} · {l.sublabel}{l.prelineup ? " · lineup pending" : ""}
                  </span>
                  {compat?.reason ? (
                    <span style={{ color: blocked ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)", fontSize: 10, lineHeight: 1.4 }}>
                      {compat.reason}
                    </span>
                  ) : null}
                </div>
                <span className="font-mono shrink-0 text-right" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
                  {formatAmerican(l.americanOdds)}
                  {/* The model's own estimate, shown ONLY where the source provides one — absence
                      renders nothing rather than an odds-derived stand-in (the grade rule). */}
                  {typeof l.modelProbability === "number" ? (() => {
                    // Confidence grade (Program 146): eligible only on fresh, complete, genuinely
                    // modelled legs; the title carries the full explanation with its caveat.
                    const g = productDate ? gradeLeg(l, { productDate }) : null;
                    return (
                      <span className="block" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }} title={g?.explanation ?? "The model's probability for this leg — an estimate, not a prediction of profit"}>
                        model {(l.modelProbability * 100).toFixed(1)}%
                        {g?.eligible ? ` · conf ${g.grade}` : ""}
                      </span>
                    );
                  })() : null}
                </span>
                <button type="button" onClick={() => (on && key ? remove(key) : addLeg(l))}
                  disabled={blocked}
                  className="rounded-full shrink-0 flex items-center justify-center"
                  style={{ width: 28, height: 28, background: on ? "var(--vault-gold-bright)" : "transparent", border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`, color: on ? "#170f0a" : blocked ? "var(--vault-text-faint)" : "var(--vault-text-mute)", fontSize: 15, fontWeight: 700, lineHeight: 1, opacity: blocked ? 0.55 : 1, cursor: blocked ? "not-allowed" : undefined }}
                  aria-label={on ? "Remove leg" : blocked ? `Cannot add: ${compat?.reason ?? "conflicts with the card"}` : "Add leg"}
                  aria-disabled={blocked || undefined}
                  title={blocked ? compat?.reason ?? undefined : undefined}>
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

      {/* Betslip — mobile sticky bottom bar + slide-up drawer. The bar exists ONLY once the card
          has a leg: a "View card · 0 legs" pill floating over the page was an affordance with
          nothing behind it, covering content (P208 finding F4). */}
      <div className="lg:hidden">
        {!slipOpen && draft.length > 0 && (
          <button type="button" onClick={() => setSlipOpen(true)}
            className="vault-press fixed left-3 right-3 z-40 flex items-center justify-between gap-2 rounded-full px-5 py-3 shadow-lg"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)", background: "var(--vault-gold-bright)", color: "#170f0a", fontWeight: 700, border: "none", minHeight: 44 }}>
            <span style={{ fontSize: 14 }}>View card · {draft.length} leg{draft.length === 1 ? "" : "s"}</span>
            <span className="font-mono tabular" style={{ fontSize: 14 }}>{formatAmerican(combinedAmerican)}</span>
          </button>
        )}
        {slipOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setSlipOpen(false)}>
            <div className="rounded-t-[16px] max-h-[82vh] overflow-y-auto px-3 pb-6 pt-3" onClick={(e) => e.stopPropagation()} style={{ background: "var(--vault-bg, #170f0a)", borderTop: "1px solid var(--vault-border-strong)" }}>
              <div className="flex items-center justify-between gap-2 mb-2 px-1">
                <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 700 }}>Your card &amp; paper stake</span>
                <button type="button" onClick={() => setSlipOpen(false)} className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-mute)", fontSize: 11, minHeight: 44, minWidth: 44 }}>Close ✕</button>
              </div>
              {betslipCard}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
