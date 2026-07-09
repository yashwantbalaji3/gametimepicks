/**
 * WcGameLabReport — the World Cup "Game Lab" for one fixture, presented like a
 * premium betting-analytics card (paper-only, educational). It renders the PURE
 * view built by `buildWcGameLabReport` (@/lib/game-lab/wc-report) and invents
 * nothing: every number traces to a real odds-implied projection row.
 *
 * Honesty, in the UI itself:
 *   • A prominent "Odds-only model — market-implied, not an independent stat
 *     model" note. WC has no lineup / form / xG layer, so most edges sit near
 *     zero and honestly bucket neutral/opposed — the UI never dresses that up.
 *   • A "90-minute regulation only — ET / penalties don't count" caveat.
 *   • A "Model report · built from available odds & projections" line — NOT a
 *     fake loading sim. We never claim simulations, runs, or a per-game
 *     distribution.
 *   • The `unavailable[]` items are shown as an intentional, premium "Not yet
 *     simulated" panel — the honest edge of what we have.
 *   • The product strip is clearly EXPLORE links, not placed cards.
 *
 * Visual idiom mirrors mlb-game-lab-report.tsx: inline styles on CSS vars
 * (--vault-text / --vault-gold-bright / --vault-success / --gtp-bank-heat /
 * --vault-border / --vault-rule), mono/display font classes, rounded panels,
 * mobile-first stacks. FlagBadge (monogram fallback) — never a broken img.
 */
import Link from "next/link";
import FlagBadge from "@/components/flag-badge";
import type {
  WcGameLabView,
  WcLeanRow,
  WcLeanSignal,
} from "@/lib/game-lab/wc-report";
import {
  SUPPORTED_EDGE_MIN,
  OPPOSED_EDGE_MAX,
} from "@/lib/game-lab/mlb-report";

// ── tiny formatters (every one dash-safe; never renders undefined/NaN) ──
const dash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v))
    ? "—"
    : String(v);
const american = (o?: number | null) =>
  o == null || !Number.isFinite(o) ? "—" : o > 0 ? `+${o}` : `${o}`;
const pct = (n?: number | null) =>
  n == null || !Number.isFinite(n) ? "—" : `${Math.round(n * 100)}%`;
const edgeTxt = (n?: number | null) =>
  n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const SIGNAL_TONE: Record<WcLeanSignal, string> = {
  supported: "var(--vault-success)",
  neutral: "var(--vault-text-faint)",
  opposed: "var(--gtp-bank-heat)",
};
const SIGNAL_LABEL: Record<WcLeanSignal, string> = {
  supported: "Supported",
  neutral: "Neutral",
  opposed: "Opposed",
};
/** WC confidence labels are Lean / Watchlist / High — both Lean & Watchlist are
 *  low-conviction (never "supported"), so they read muted. */
const CONF_TONE: Record<string, string> = {
  High: "var(--vault-success)",
  Watchlist: "var(--vault-gold-bright)",
  Lean: "var(--vault-text-mute)",
};

function edgeColor(e?: number | null): string {
  if (e == null || !Number.isFinite(e)) return "var(--vault-text-faint)";
  if (e >= SUPPORTED_EDGE_MIN) return "var(--vault-success)";
  if (e <= OPPOSED_EDGE_MAX) return "var(--gtp-bank-heat)";
  return "var(--vault-gold-bright)";
}

/** Section shell — eyebrow + title + optional sub, then children. */
function Module({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <span
          className="font-mono uppercase tracking-[0.13em]"
          style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}
        >
          {eyebrow}
        </span>
        <h2
          className="font-display tracking-tight"
          style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}
        >
          {title}
        </h2>
        {sub ? (
          <span style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{sub}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SignalPill({ signal }: { signal: WcLeanSignal }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.1em]"
      style={{
        color: SIGNAL_TONE[signal],
        border: `1px solid ${SIGNAL_TONE[signal]}`,
        fontSize: 8.5,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      {SIGNAL_LABEL[signal]}
    </span>
  );
}

/** One compact stat, label over value. */
function Stat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span
        className="font-mono uppercase tracking-[0.1em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}
      >
        {label}
      </span>
      <span
        className="font-mono"
        style={{ color: color ?? "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}
      >
        {value}
      </span>
    </div>
  );
}

/** The row's headline line: pick label · market · odds. */
function LeanHeadline({ r }: { r: WcLeanRow }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
      <span
        className="font-display tracking-tight break-words"
        style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}
      >
        {dash(r.pickLabel ?? r.marketLabel)}
      </span>
      <span className="font-mono" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
        {dash(r.marketLabel)}
      </span>
      {r.line != null ? (
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          line {dash(r.line)}
        </span>
      ) : null}
      <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>
        {american(r.americanOdds)}
      </span>
    </div>
  );
}

/** Model-vs-market row card. */
function ModelMarketCard({ r }: { r: WcLeanRow }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3"
      style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <LeanHeadline r={r} />
        <SignalPill signal={r.signal} />
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-2">
        <Stat label="Odds" value={american(r.americanOdds)} color="var(--vault-gold-bright)" />
        <Stat label="Model" value={pct(r.modelProbability)} />
        <Stat label="Market" value={pct(r.marketProbability)} />
        <Stat label="Edge" value={edgeTxt(r.edgePct)} color={edgeColor(r.edgePct)} />
        <Stat
          label="Conf"
          value={dash(r.confidence)}
          color={CONF_TONE[r.confidence ?? ""] ?? "var(--vault-text-mute)"}
        />
      </div>
    </div>
  );
}

/** A single market-snapshot block — odds + market prob + model prob, and each
 *  outcome (3-way moneyline / double chance) when present. */
function SnapshotRow({ r }: { r: WcLeanRow }) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[8px] px-3 py-2"
      style={{ background: "rgba(0,0,0,0.28)", border: "1px solid var(--vault-rule)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-col">
          <span
            className="font-display break-words leading-tight"
            style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}
          >
            {dash(r.pickLabel ?? r.marketLabel)}
          </span>
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            {dash(r.marketLabel)}
            {r.line != null ? ` · line ${dash(r.line)}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono" style={{ fontSize: 10.5 }}>
          <span style={{ color: "var(--vault-text-mute)" }}>
            {american(r.americanOdds)}{" "}
            <span style={{ color: "var(--vault-text-faint)" }}>({pct(r.marketProbability)})</span>
          </span>
          <span style={{ color: "var(--vault-gold-bright)" }}>model {pct(r.modelProbability)}</span>
        </div>
      </div>
      {r.outcomes.length > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono" style={{ fontSize: 9.5 }}>
          {r.outcomes.map((o, i) => (
            <span key={i} style={{ color: "var(--vault-text-faint)" }}>
              {dash(o.label)} {american(o.americanOdds)}{" "}
              <span style={{ color: "var(--vault-text-mute)" }}>({pct(o.marketProb)})</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Biggest-leans ladder entry — headline + edge + model/market. */
function BiggestLeanCard({ r, rank }: { r: WcLeanRow; rank: number }) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[12px] px-3.5 py-3"
      style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="font-mono"
            style={{ color: "var(--vault-text-faint)", fontSize: 11, fontWeight: 700 }}
          >
            #{rank}
          </span>
          <LeanHeadline r={r} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono" style={{ color: edgeColor(r.edgePct), fontSize: 13, fontWeight: 700 }}>
            {edgeTxt(r.edgePct)}
          </span>
          <SignalPill signal={r.signal} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono" style={{ fontSize: 10 }}>
        <span style={{ color: "var(--vault-text-mute)" }}>model {pct(r.modelProbability)}</span>
        <span style={{ color: "var(--vault-text-mute)" }}>market {pct(r.marketProbability)}</span>
        <span style={{ color: "var(--vault-text-faint)" }}>
          conf {dash(r.confidence)} · {dash(r.riskTier)} risk
        </span>
      </div>
    </div>
  );
}

/** A labelled signal bucket. */
function SignalBucket({ label, tone, rows }: { label: string; tone: string; rows: WcLeanRow[] }) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[12px] px-3.5 py-3"
      style={{ background: "rgba(255,255,255,0.015)", border: `1px solid ${tone}` }}
    >
      <div className="flex items-baseline justify-between">
        <span
          className="font-mono uppercase tracking-[0.12em]"
          style={{ color: tone, fontSize: 10, fontWeight: 700 }}
        >
          {label}
        </span>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
          {rows.length}
        </span>
      </div>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {rows.slice(0, 6).map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-2">
              <span className="text-[11.5px] break-words leading-tight" style={{ color: "var(--vault-text)" }}>
                {dash(r.pickLabel ?? r.marketLabel)}{" "}
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                  {dash(r.marketLabel)}
                </span>
              </span>
              <span className="font-mono shrink-0" style={{ color: edgeColor(r.edgePct), fontSize: 11 }}>
                {edgeTxt(r.edgePct)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span
          className="font-mono uppercase tracking-[0.08em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
        >
          None
        </span>
      )}
    </div>
  );
}

function BulletList({ items, warn }: { items: string[]; warn?: boolean }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((t, i) => (
        <li
          key={i}
          className="text-[12px] leading-snug"
          style={{ color: warn ? "var(--gtp-bank-heat)" : "var(--vault-text-mute)" }}
        >
          · {dash(t)}
        </li>
      ))}
    </ul>
  );
}

export default function WcGameLabReport({ view }: { view: WcGameLabView }) {
  return (
    <div className="flex flex-col gap-6">
      {/* 1 · Header */}
      <section
        className="relative overflow-hidden rounded-[14px] px-5 py-5"
        style={{
          border: "1px solid var(--vault-border-strong)",
          background:
            "radial-gradient(120% 150% at 0% 0%, rgba(242, 54, 69,0.10) 0%, transparent 55%), linear-gradient(135deg, rgba(22,30,62,0.94) 0%, rgba(26, 16, 11,0.97) 100%)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.12em]"
            style={{ color: "var(--vault-gold-bright)", border: "1px solid var(--vault-rule)", fontSize: 9, background: "rgba(217,164,65,0.10)" }}
          >
            Paper-only · educational
          </span>
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.12em]"
            style={{ color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", fontSize: 9, background: "rgba(255,255,255,0.02)" }}
          >
            Odds-only · market read
          </span>
          {view.stage ? (
            <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
              {dash(view.stage)}
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center gap-1.5 shrink-0">
            <FlagBadge code={view.homeCode ?? ""} fallback={view.homeTeam ?? undefined} size="lg" ariaLabel={view.homeTeam ?? undefined} />
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>v</span>
            <FlagBadge code={view.awayCode ?? ""} fallback={view.awayTeam ?? undefined} size="lg" ariaLabel={view.awayTeam ?? undefined} />
          </span>
          <div className="flex min-w-0 flex-col">
            <h1
              className="font-display tracking-tight truncate"
              style={{ color: "var(--vault-text)", fontSize: "clamp(20px,4vw,28px)", fontWeight: 700, lineHeight: 1.05 }}
            >
              {dash(view.homeTeam)} v {dash(view.awayTeam)}
            </h1>
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
              {dash(view.venue)}
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {view.group ? (
            <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
              <span style={{ color: "var(--vault-text-faint)" }}>Group</span> {dash(view.group)}
            </span>
          ) : null}
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
            <span style={{ color: "var(--vault-text-faint)" }}>Kickoff</span> {dash(view.kickoffUtc)}
          </span>
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
            <span style={{ color: "var(--vault-text-faint)" }}>Markets</span> {dash(view.marketCount)}
          </span>
        </div>

        <p className="mt-3 font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          Market read · de-vigged sportsbook prices · not an independent stat model
        </p>
      </section>

      {view.marketCount === 0 ? (
        <div
          className="rounded-[12px] px-4 py-4"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}
        >
          <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
            No priced markets are posted for this game yet — treated as a no-play here, never padded to look active. Markets post as the books price this slate.
          </p>
        </div>
      ) : (
        <>
          {/* 2 · Market snapshot */}
          <Module
            eyebrow="Market snapshot"
            title="Posted prices, at a glance"
            sub="Each market: the posted odds, the book's raw implied probability, the de-vigged (no-vig) read, and every 3-way outcome when present."
          >
            <div className="flex flex-col gap-1.5">
              {view.rows.map((r) => (
                <SnapshotRow key={r.id} r={r} />
              ))}
            </div>
          </Module>

          {/* 3 · De-vig vs raw price */}
          <Module
            eyebrow="No-vig vs raw price"
            title="The de-vigged read vs the posted price"
            sub="The no-vig probability vs the book's raw implied probability, and the resulting gap. This is odds-only — edges sit near zero because the read IS the de-vigged price, not an independent model."
          >
            <div className="grid grid-cols-1 gap-2">
              {view.rows.map((r) => (
                <ModelMarketCard key={r.id} r={r} />
              ))}
            </div>
          </Module>

          {/* 4 · Biggest leans */}
          <Module
            eyebrow={`Biggest leans · top ${view.biggestLeans.length}`}
            title="Ranked by market read"
            sub="Sorted by how far the de-vigged read sits from the raw price. On an odds-only slate most of these are hairline gaps, not conviction plays."
          >
            <div className="grid grid-cols-1 gap-2">
              {view.biggestLeans.map((r, i) => (
                <BiggestLeanCard key={r.id} r={r} rank={i + 1} />
              ))}
            </div>
          </Module>

          {/* 5 · Supported / Neutral / Opposed */}
          <Module
            eyebrow="Signal buckets"
            title="Supported · Neutral · Opposed"
            sub={`Legend: supported = edge ≥ ${SUPPORTED_EDGE_MIN}% at above-Watchlist confidence · opposed = edge ≤ ${OPPOSED_EDGE_MAX}% (the read sits at/against the price) · neutral = everything between. Lean & Watchlist are low-conviction and never "supported".`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <SignalBucket label="Supported" tone="var(--vault-success)" rows={view.supported} />
              <SignalBucket label="Neutral" tone="var(--vault-text-faint)" rows={view.neutral} />
              <SignalBucket label="Opposed" tone="var(--gtp-bank-heat)" rows={view.opposed} />
            </div>
          </Module>

          {/* 6 · Strongest market reads */}
          <Module eyebrow="Strongest market reads" title="The strongest supported reads" sub="Plain-language, from the top supported rows. No hype — and on an odds-only slate this is often just 'the read sits on the price'.">
            <BulletList items={view.whatModelLikes} />
          </Module>

          {/* 7 · What breaks it */}
          <Module eyebrow="What breaks it" title="The honest downside" sub="The odds-only limits, 90-minute settlement, and any market reading against the price.">
            {/* Prominent odds-only + regulation callout, above the bullets */}
            <div
              className="flex flex-col gap-1.5 rounded-[12px] px-3.5 py-3"
              style={{ background: "rgba(242, 54, 69,0.06)", border: "1px solid var(--gtp-bank-heat)" }}
            >
              <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 9.5, fontWeight: 700 }}>
                Odds-only model — market-implied, not an independent stat model
              </span>
              <span style={{ color: "var(--vault-text-mute)", fontSize: 11.5, lineHeight: 1.45 }}>
                There is no lineup, recent-form, or xG layer — the model is a de-vigged read of the sportsbook price, so most edges sit near zero by construction.{" "}
                <span style={{ color: "var(--vault-text)" }}>
                  Settlement is 90-minute regulation only — extra time and penalties do not count.
                </span>
              </span>
            </div>
            <div className="mt-2">
              <BulletList items={view.whatBreaksIt} warn />
            </div>
          </Module>
        </>
      )}

      {/* 8 · Product mapping strip (explore links, not placed cards) */}
      <Module
        eyebrow="Where this fits"
        title="Explore, don't place"
        sub="Descriptive links only — none of these is a placed card, and eligibility is never approval."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {view.productMapping.map((p) => (
            <Link
              key={`${p.label}-${p.href}`}
              href={p.href}
              className="flex flex-col gap-1 rounded-[12px] px-3.5 py-3"
              style={{
                background: "rgba(26, 16, 11,0.6)",
                border: "1px solid var(--vault-border)",
                textDecoration: "none",
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="font-mono uppercase tracking-[0.12em]"
                  style={{ color: "var(--vault-gold-bright)", fontSize: 10, fontWeight: 700 }}
                >
                  {dash(p.label)}
                </span>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
                  explore →
                </span>
              </span>
              <span style={{ color: "var(--vault-text-mute)", fontSize: 11, lineHeight: 1.4 }}>
                {dash(p.note)}
              </span>
            </Link>
          ))}
        </div>
      </Module>

      {/* 9 · Unavailable placeholders (intentional, premium — not broken) */}
      <section
        className="flex flex-col gap-2.5 rounded-[14px] px-4 py-4"
        style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-border)" }}
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-mono uppercase tracking-[0.13em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
            Not yet simulated
          </span>
          <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text-mute)", fontSize: 15, fontWeight: 700 }}>
            What a full per-game model would add
          </h2>
          <span style={{ color: "var(--vault-text-faint)", fontSize: 11.5 }}>
            We show only what we actually compute. These are honestly held back — WC is odds-only and no persisted per-game Monte-Carlo exists for this fixture, so we do not fabricate a distribution or a stat layer.
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {view.unavailable.map((u) => (
            <div
              key={u.label}
              className="flex flex-col gap-0.5 rounded-[10px] px-3 py-2.5"
              style={{ background: "rgba(0,0,0,0.22)", border: "1px dashed var(--vault-rule)" }}
            >
              <span style={{ color: "var(--vault-text-mute)", fontSize: 12, fontWeight: 600 }}>
                {dash(u.label)}
              </span>
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                {dash(u.reason)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <p className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
        Paper-only · educational · not betting advice
      </p>
    </div>
  );
}
