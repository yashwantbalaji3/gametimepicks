/**
 * MlbGameLabReport — the MLB "Game Lab" for one fixture, presented like a
 * premium betting-analytics card (paper-only, educational). It renders the
 * PURE view built by `buildMlbGameLabReport` (@/lib/game-lab/mlb-report) and
 * invents nothing: every number traces to a real board lean.
 *
 * Honesty, in the UI itself:
 *   • A "Model report · built from available data" line — NOT a fake loading
 *     sim. We never claim simulations, runs, or a per-game distribution.
 *   • The `unavailable[]` items are shown as an intentional, premium
 *     "Not yet simulated" panel — the honest edge of what we have.
 *   • The product strip is clearly EXPLORE links, not placed cards.
 *
 * Visual idiom matches game-detail-page.tsx: inline styles on CSS vars
 * (--vault-text / --vault-gold-bright / --vault-success / --gtp-bank-heat /
 * --vault-border / --vault-rule), mono/display font classes, rounded panels,
 * mobile-first stacks (no cramped tables).
 */
import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import type {
  MlbGameLabView,
  MlbLeanRow,
  MlbLeanSignal,
} from "@/lib/game-lab/mlb-report";
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
const num1 = (n?: number | null) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(1);
const edgeTxt = (n?: number | null) =>
  n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const SIGNAL_TONE: Record<MlbLeanSignal, string> = {
  supported: "var(--vault-success)",
  neutral: "var(--vault-text-faint)",
  opposed: "var(--gtp-bank-heat)",
};
const SIGNAL_LABEL: Record<MlbLeanSignal, string> = {
  supported: "Supported",
  neutral: "Neutral",
  opposed: "Opposed",
};
const CONF_TONE: Record<string, string> = {
  High: "var(--vault-success)",
  Medium: "var(--vault-gold-bright)",
  Low: "var(--gtp-bank-heat)",
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

function SignalPill({ signal }: { signal: MlbLeanSignal }) {
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

/** The lean's headline line: player · role · market · lean line. */
function LeanHeadline({ r }: { r: MlbLeanRow }) {
  const sideLine =
    r.lean && r.lean !== "Pass"
      ? `${dash(r.lean)} ${dash(r.line)}`
      : `${dash(r.marketLabel)} ${dash(r.line)}`;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
      <span
        className="font-display tracking-tight break-words"
        style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}
      >
        {dash(r.playerName)}
      </span>
      <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
        {dash(r.playerTeamAbbr)} · {dash(r.playerRole)}
      </span>
      <span className="font-mono" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
        {dash(r.marketLabel)} · {sideLine}
      </span>
    </div>
  );
}

/** Model-vs-market row card (module 2 + 3, one presentation). */
function ModelMarketCard({ r }: { r: MlbLeanRow }) {
  // Show the model/implied prob for the side the lean actually took.
  const isUnder = r.lean === "Under";
  const modelProb = isUnder ? r.modelProbUnder : r.modelProbOver;
  const impliedProb = isUnder ? r.impliedUnder : r.impliedOver;
  const odds = isUnder ? r.oddsUnder : r.oddsOver;
  return (
    <div
      className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3"
      style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <LeanHeadline r={r} />
        <SignalPill signal={r.signal} />
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-2">
        <Stat label="Proj" value={num1(r.projection)} />
        <Stat label="Odds" value={american(odds)} color="var(--vault-gold-bright)" />
        <Stat label="Model" value={pct(modelProb)} />
        <Stat label="Implied" value={pct(impliedProb)} />
        <Stat label="Gap" value={edgeTxt(r.edgePct)} color={edgeColor(r.edgePct)} />
        <Stat
          label="Conf"
          value={dash(r.confidence)}
          color={CONF_TONE[r.confidence ?? ""] ?? "var(--vault-text-mute)"}
        />
      </div>
    </div>
  );
}

/** A single market-snapshot line — scannable, both sides + model. */
function SnapshotRow({ r }: { r: MlbLeanRow }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[8px] px-3 py-2"
      style={{ background: "rgba(0,0,0,0.28)", border: "1px solid var(--vault-rule)" }}
    >
      <div className="flex min-w-0 flex-col">
        <span
          className="font-display break-words leading-tight"
          style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600 }}
        >
          {dash(r.playerName)}
        </span>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {dash(r.marketLabel)} · line {dash(r.line)}
        </span>
      </div>
      <div className="flex items-center gap-3 font-mono" style={{ fontSize: 10.5 }}>
        <span style={{ color: "var(--vault-text-mute)" }}>
          O {american(r.oddsOver)} <span style={{ color: "var(--vault-text-faint)" }}>({pct(r.impliedOver)})</span>
        </span>
        <span style={{ color: "var(--vault-text-mute)" }}>
          U {american(r.oddsUnder)} <span style={{ color: "var(--vault-text-faint)" }}>({pct(r.impliedUnder)})</span>
        </span>
        <span style={{ color: "var(--vault-gold-bright)" }}>
          model {pct(r.lean === "Under" ? r.modelProbUnder : r.modelProbOver)}
        </span>
      </div>
    </div>
  );
}

/** Biggest-leans ladder entry — headline + edge + reason bullets. */
function BiggestLeanCard({ r, rank }: { r: MlbLeanRow; rank: number }) {
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
      {r.reasonBullets.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {r.reasonBullets.map((b, i) => (
            <li
              key={i}
              className="text-[11px] leading-snug"
              style={{ color: b.tone === "warn" ? "var(--gtp-bank-heat)" : "var(--vault-text-mute)" }}
            >
              <span
                className="font-mono uppercase tracking-[0.08em]"
                style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}
              >
                {dash(b.label)}
              </span>{" "}
              {dash(b.text)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A labelled signal bucket. */
function SignalBucket({ label, tone, rows }: { label: string; tone: string; rows: MlbLeanRow[] }) {
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
                {dash(r.playerName)}{" "}
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

/** Recent-form sparkbar row for one lean: recentGames values + proj ± sigma. */
function RecentFormCard({ r }: { r: MlbLeanRow }) {
  const vals = r.recentGames.map((g) => g.value).filter((v): v is number => v != null);
  const max = vals.length > 0 ? Math.max(...vals, r.line ?? 0) : 1;
  return (
    <div
      className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3"
      style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-border)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <LeanHeadline r={r} />
        <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
          proj {num1(r.projection)}
          {r.sigma != null ? (
            <span style={{ color: "var(--vault-text-faint)" }}> ± {num1(r.sigma)}</span>
          ) : null}
        </span>
      </div>
      {r.recentGames.length > 0 ? (
        <div className="flex items-end gap-1" style={{ height: 44 }}>
          {r.recentGames.map((g, i) => {
            const v = g.value ?? 0;
            const h = max > 0 ? Math.max(3, Math.round((v / max) * 40)) : 3;
            const over = r.line != null && v >= r.line;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-0.5" title={`${dash(g.date)} vs ${dash(g.opponent)}: ${dash(g.value)}`}>
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 8 }}>
                  {dash(g.value)}
                </span>
                <div
                  style={{
                    width: "100%",
                    maxWidth: 18,
                    height: h,
                    borderRadius: 3,
                    background: over ? "var(--vault-success)" : "var(--vault-rule)",
                    opacity: over ? 0.85 : 0.55,
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          No recent-game log for this player.
        </span>
      )}
      {r.line != null ? (
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>
          Bars at/above the {dash(r.line)} line shown in green · sample {dash(r.samples)} games. Honest range, not a simulated distribution.
        </span>
      ) : null}
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

export default function MlbGameLabReport({ view }: { view: MlbGameLabView }) {
  const topForForm = view.biggestLeans.slice(0, 4);

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
          {view.status ? (
            <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
              {dash(view.status)}
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center gap-1.5 shrink-0">
            <TeamLogo team={view.awayTeamAbbr} sport="mlb" size="lg" />
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>@</span>
            <TeamLogo team={view.homeTeamAbbr} sport="mlb" size="lg" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h1
              className="font-display tracking-tight truncate"
              style={{ color: "var(--vault-text)", fontSize: "clamp(20px,4vw,28px)", fontWeight: 700, lineHeight: 1.05 }}
            >
              {dash(view.awayTeamName ?? view.awayTeamAbbr)} @ {dash(view.homeTeamName ?? view.homeTeamAbbr)}
            </h1>
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
              {dash(view.venue)}
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
            <span style={{ color: "var(--vault-text-faint)" }}>Away SP</span> {dash(view.awayPitcher)}
          </span>
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
            <span style={{ color: "var(--vault-text-faint)" }}>Home SP</span> {dash(view.homePitcher)}
          </span>
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
            <span style={{ color: "var(--vault-text-faint)" }}>Leans</span> {dash(view.leanCount)}
          </span>
        </div>

        <p className="mt-3 font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
          Model report · built from available data
        </p>
      </section>

      {view.leanCount === 0 ? (
        <div
          className="rounded-[12px] px-4 py-4"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}
        >
          <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
            No model-qualified leans are posted for this game yet — treated as a no-play here, never padded to look active. Props post as the books price this slate.
          </p>
        </div>
      ) : (
        <>
          {/* 2 · Market snapshot */}
          <Module
            eyebrow="Market snapshot"
            title="Posted prices, at a glance"
            sub="Over / Under odds with the book-implied probability, and the model's read for the leaning side."
          >
            <div className="flex flex-col gap-1.5">
              {view.rows.map((r) => (
                <SnapshotRow key={r.id} r={r} />
              ))}
            </div>
          </Module>

          {/* 3 · Model vs market */}
          <Module
            eyebrow="Model vs market"
            title="Where the model differs from the price"
            sub="Projection, model probability vs the book's implied probability, and the resulting model-vs-market gap — per leaning side."
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
            title="Ranked by model gap"
            sub="Sorted by the size of the model's disagreement with the price. Each carries its own reason bullets."
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
            sub={`Legend: supported = gap ≥ ${SUPPORTED_EDGE_MIN}% at Medium+ confidence · opposed = gap ≤ ${OPPOSED_EDGE_MAX}% (model reads against the posted lean) · neutral = everything between.`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <SignalBucket label="Supported" tone="var(--vault-success)" rows={view.supported} />
              <SignalBucket label="Neutral" tone="var(--vault-text-faint)" rows={view.neutral} />
              <SignalBucket label="Opposed" tone="var(--gtp-bank-heat)" rows={view.opposed} />
            </div>
          </Module>

          {/* 6 · Recent form */}
          {topForForm.length > 0 ? (
            <Module
              eyebrow="Recent form"
              title="The last games behind the projection"
              sub="Per top lean: the real recent-game values with the projection ± one sigma band shown honestly — a range, never a simulated distribution."
            >
              <div className="grid grid-cols-1 gap-2">
                {topForForm.map((r) => (
                  <RecentFormCard key={r.id} r={r} />
                ))}
              </div>
            </Module>
          ) : null}

          {/* 7 · What the model likes */}
          <Module eyebrow="What the model likes" title="The strongest supported reads" sub="Plain-language, from the top supported rows. No hype.">
            <BulletList items={view.whatModelLikes} />
          </Module>

          {/* 8 · What breaks it */}
          <Module eyebrow="What breaks it" title="The honest downside" sub="Thin samples, wide bands, model risk flags, and box-score settlement risk.">
            <BulletList items={view.whatBreaksIt} warn />
          </Module>
        </>
      )}

      {/* 9 · Product mapping strip (explore links, not placed cards) */}
      <Module
        eyebrow="Where this fits"
        title="Explore, don't place"
        sub="Descriptive links only — none of these is a placed card, and an MLB game does not imply membership in any soccer product."
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

      {/* 10 · Unavailable placeholders (intentional, premium — not broken) */}
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
            We show only what we actually compute. These are honestly held back — no persisted per-game Monte-Carlo exists for this fixture, so we do not fabricate a distribution.
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
