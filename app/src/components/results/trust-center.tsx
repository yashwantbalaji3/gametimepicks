/**
 * TrustCenter — the lead of `/results` (Chunk 6B).
 *
 * A single public trust surface. Every number here arrives as a prop from
 * `getTrustCenterModel()` (lib/results-trust-center.ts), which resolves them
 * from committed canonical artifacts. No money literal is hardcoded in this
 * file; no JSON is re-read here.
 *
 * The cardinal rule this component encodes: the OFFICIAL product-card record
 * (19-14) and the RAW MLB model-performance ledger are two different things.
 * They live in visually distinct sections with explicit disclaimers and are
 * never summed. Pending is never shown as a loss; an awaiting-next-card lane
 * is shown as awaiting, not as a pending settlement.
 *
 * Server component (calls a couple of read-only loaders for the settled
 * Bank Builder steps). Presentational otherwise.
 */
import Link from "next/link";

import FreshnessBadge from "@/components/ui/freshness-badge";
import BankBuilderResults from "@/components/bank-builder-results";
import { getBankBuilderSettledSteps } from "@/lib/bank-builder-results";
import { currentEtDate } from "@/lib/freshness";
import type { TrustCenterModel } from "@/lib/results-trust-center";

/** $19,065.40 · $0 (no trailing cents on an exact zero). */
function usd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0";
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 0.4457 → "44.6%"; null → "—". */
function pct(r: number | null): string {
  if (r == null || !Number.isFinite(r)) return "—";
  return `${(r * 100).toFixed(1)}%`;
}

const CARD: React.CSSProperties = {
  background: "var(--gtp-card)",
  border: "1px solid var(--vault-rule)",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono uppercase tracking-[0.16em]"
      style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}
    >
      {children}
    </span>
  );
}

export default function TrustCenter({ model }: { model: TrustCenterModel }) {
  const { money, settlement, mlb } = model;
  const today = currentEtDate();

  return (
    <div className="flex flex-col gap-6">
      {/* ── 1. Trust Center Hero ─────────────────────────────────────── */}
      <section
        aria-label="Results and receipts"
        className="rounded-[12px] px-5 sm:px-7 py-6 flex flex-col gap-3"
        style={CARD}
      >
        <Eyebrow>Trust center</Eyebrow>
        <h1
          className="font-display m-0"
          style={{ color: "var(--vault-text)", fontSize: 30, lineHeight: 1.1 }}
        >
          Results &amp; Receipts
        </h1>
        <p
          className="text-[13.5px] leading-relaxed m-0"
          style={{ color: "var(--vault-text-mute)", maxWidth: 640 }}
        >
          Track the official paper-card record, open exposure, settlement
          status, and model-performance receipts in one place. Everything here
          is paper-only and educational — records move only on official finals,
          and a pending card is never counted as a loss.
        </p>
        <div className="flex flex-wrap gap-2 mt-1">
          {[
            "Paper-only · educational",
            "Official settlement only",
            "Pending is not a loss",
          ].map((chip) => (
            <span
              key={chip}
              className="font-mono uppercase tracking-[0.1em] px-2.5 py-1 rounded-full"
              style={{
                color: "var(--vault-text-mute)",
                border: "1px solid var(--vault-rule)",
                fontSize: 9.5,
              }}
            >
              {chip}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <Link
            href="#settled-cards"
            className="font-mono uppercase tracking-[0.12em] px-3.5 py-2 rounded-full"
            style={{
              color: "var(--vault-gold-bright)",
              border: "1px solid var(--vault-gold-bright)",
              fontSize: 11.5,
              lineHeight: 1.1,
            }}
          >
            View settled cards →
          </Link>
          <Link
            href="#mlb-model-performance"
            className="font-mono uppercase tracking-[0.12em] px-3.5 py-2 rounded-full"
            style={{
              color: "var(--vault-text-mute)",
              border: "1px solid var(--vault-rule)",
              fontSize: 11.5,
              lineHeight: 1.1,
            }}
          >
            View MLB model audit →
          </Link>
          <Link
            href="/mr-dub/"
            className="font-mono uppercase tracking-[0.12em] px-3.5 py-2 rounded-full"
            style={{
              color: "var(--vault-text-mute)",
              border: "1px solid var(--vault-rule)",
              fontSize: 11.5,
              lineHeight: 1.1,
            }}
          >
            Open Daily Dashboard →
          </Link>
        </div>
      </section>

      {/* ── 2. Record / Exposure summary strip ───────────────────────── */}
      {money && (
        <section aria-label="Official record and exposure" className="flex flex-col gap-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              {
                k: "Official record",
                v: `${money.record.wins}-${money.record.losses}`,
                sub: money.record.pending > 0 ? `${money.record.pending} pending` : "paper cards",
              },
              { k: "Paper bankroll", v: usd(money.bankroll), sub: "current" },
              { k: "Peak (crown)", v: usd(money.crown), sub: "high-water mark" },
              { k: "Open exposure", v: usd(money.openExposure), sub: money.openExposure === 0 ? "nothing at stake" : "at stake now" },
              { k: "Pending cards", v: String(money.record.pending), sub: "awaiting official grade" },
              {
                k: "Settled cards",
                v: String(money.record.wins + money.record.losses),
                sub: "decisive · graded to date",
              },
            ].map((cell) => (
              <div key={cell.k} className="rounded-[10px] px-3.5 py-3 flex flex-col gap-1" style={CARD}>
                <Eyebrow>{cell.k}</Eyebrow>
                <span
                  className="font-display"
                  style={{ color: "var(--vault-text)", fontSize: 21, lineHeight: 1.05 }}
                >
                  {cell.v}
                </span>
                <span className="text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
                  {cell.sub}
                </span>
              </div>
            ))}
          </div>
          <p
            className="text-[11.5px] leading-snug px-1"
            style={{ color: "var(--vault-text-faint)" }}
          >
            Official product-card record. Raw model-performance results are
            tracked separately, further down this page.
          </p>
        </section>
      )}

      {/* ── 3. Settlement status ─────────────────────────────────────── */}
      <section
        aria-label="Settlement status"
        id="settlement-status"
        className="rounded-[10px] px-4 sm:px-5 py-4 flex flex-col gap-2"
        style={{ scrollMarginTop: 80, ...CARD }}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2
            className="font-mono uppercase tracking-[0.16em] m-0 font-normal"
            style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
          >
            Settlement status
          </h2>
          {settlement?.date && (
            <FreshnessBadge slateDate={settlement.date} serverToday={today} noun="slate" />
          )}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex flex-col gap-0.5">
            <Eyebrow>Latest slate</Eyebrow>
            <span className="text-[13px]" style={{ color: "var(--vault-text)" }}>
              {settlement?.date ?? "—"}
              {settlement && (settlement.status === "none" || settlement.realizedPnl === 0)
                ? " · no card settled (no-play day)"
                : settlement
                  ? ` · ${settlement.status}`
                  : ""}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <Eyebrow>Open exposure</Eyebrow>
            <span className="text-[13px]" style={{ color: "var(--vault-text)" }}>
              {money ? usd(money.openExposure) : "—"}
              {money && money.openExposure === 0 ? " · no active paper cards" : ""}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <Eyebrow>Pending settlements</Eyebrow>
            <span className="text-[13px]" style={{ color: "var(--vault-text)" }}>
              {money ? money.record.pending : "—"}
            </span>
          </div>
        </div>
        <p className="text-[11.5px] leading-relaxed m-0" style={{ color: "var(--vault-text-faint)" }}>
          Cards settle on official finals only. When a slate produces no
          qualified card, it is a no-play day — no exposure is created and
          nothing is graded.
        </p>
      </section>

      {/* ── 4. Product results cards ─────────────────────────────────── */}
      <section aria-label="Products" className="flex flex-col gap-2">
        <Eyebrow>Products</Eyebrow>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {[
            {
              label: "Bank Builder",
              href: "/bank-builder/",
              status:
                model.activeCardsCount > 0
                  ? "Card active"
                  : model.awaitingCards.length > 0
                    ? "Awaiting next qualified card"
                    : "No active card",
              detail:
                model.completedCards.length > 0
                  ? `${model.completedCards[0].name} completed ${model.completedCards[0].result}`
                  : "Flagship paper ladder",
            },
            {
              label: "Longshot Lab",
              href: "/moonshot/",
              status:
                model.moonshot?.status === "stopped"
                  ? "No active longshot"
                  : model.moonshot?.status ?? "No active longshot",
              detail: model.moonshot
                ? `Record ${model.moonshot.record.wins}-${model.moonshot.record.losses} · separate paper lane`
                : "Separate paper lane",
            },
            {
              label: "Today's Picks",
              href: "/today/",
              status: "Daily model hub",
              detail: "The day's model reads and no-play calls",
            },
            {
              label: "Build-a-Pick",
              href: "/picks/",
              status: "Model-qualified picks",
              detail: "Filterable model leans — educational",
            },
            {
              label: "Soccer Specials",
              href: "/world-cup/",
              status: "World Cup model surface",
              detail: "Structured specials + game reads",
            },
            {
              label: "MLB Model Audit",
              href: "/results/mlb/",
              status: mlb.latestDate ? `Graded through ${mlb.latestDate}` : "Awaiting first grade",
              detail: "Raw projection performance — not the product record",
            },
          ].map((p) => (
            <Link
              key={p.label}
              href={p.href}
              className="rounded-[10px] px-4 py-3.5 flex flex-col gap-1.5 transition-colors"
              style={CARD}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span
                  className="font-display"
                  style={{ color: "var(--vault-text)", fontSize: 15 }}
                >
                  {p.label}
                </span>
                <span
                  className="font-mono uppercase tracking-[0.1em]"
                  style={{ color: "var(--vault-gold-bright)", fontSize: 9 }}
                >
                  {p.status}
                </span>
              </span>
              <span className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
                {p.detail}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 5. Bank Builder history (settled steps) ──────────────────── */}
      <section aria-label="Bank Builder history" id="settled-cards" style={{ scrollMarginTop: 80 }} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2
            className="font-mono uppercase tracking-[0.16em] m-0 font-normal"
            style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
          >
            Bank Builder — settled cards
          </h2>
          <Link
            href="/bank-builder/"
            className="font-mono uppercase tracking-[0.12em] ml-auto"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}
          >
            Open Bank Builder →
          </Link>
        </div>
        {model.completedCards.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {model.completedCards.map((c) => (
              <span
                key={c.name}
                className="rounded-[8px] px-3 py-2 flex flex-col gap-0.5"
                style={CARD}
              >
                <span className="text-[12.5px]" style={{ color: "var(--vault-text)" }}>
                  {c.name} · <span style={{ color: "var(--vault-gold-bright)" }}>{c.result}</span>
                </span>
                <span className="text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
                  {c.start != null && c.final != null
                    ? `${usd(c.start)} → ${usd(c.final)}`
                    : ""}{" "}
                  {c.official ? "· official" : ""}
                </span>
              </span>
            ))}
          </div>
        )}
        {model.awaitingCards.length > 0 && (
          <p className="text-[11.5px] leading-snug px-1" style={{ color: "var(--vault-text-faint)" }}>
            {model.awaitingCards.map((c) => c.note).join(" ")} An awaiting lane is
            not a pending settlement and is not counted in the record.
          </p>
        )}
        <BankBuilderResults steps={getBankBuilderSettledSteps()} />
      </section>

      {/* ── 6/7. Settled vs pending, made explicit ───────────────────── */}
      <section
        aria-label="Settled versus pending"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      >
        <div className="rounded-[10px] px-4 py-3.5 flex flex-col gap-1.5" style={CARD}>
          <Eyebrow>Settled</Eyebrow>
          <span className="text-[13px]" style={{ color: "var(--vault-text)" }}>
            {money ? money.record.wins + money.record.losses : 0} settled card
            {(money ? money.record.wins + money.record.losses : 0) === 1 ? "" : "s"}{" "}
            ({money ? `${money.record.wins}-${money.record.losses}` : "—"}) ·{" "}
            {model.completedCards.length} completed ladder
            {model.completedCards.length === 1 ? "" : "s"}
          </span>
          <span className="text-[11px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            Officially graded on final results. Losses are shown here too — the
            record above already counts them.
          </span>
        </div>
        <div className="rounded-[10px] px-4 py-3.5 flex flex-col gap-1.5" style={CARD}>
          <Eyebrow>Pending</Eyebrow>
          <span className="text-[13px]" style={{ color: "var(--vault-text)" }}>
            {money ? money.record.pending : 0} pending settlement
            {(money?.record.pending ?? 0) === 1 ? "" : "s"}
            {model.awaitingCards.length > 0
              ? ` · ${model.awaitingCards.length} lane awaiting next card`
              : ""}
          </span>
          <span className="text-[11px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            Pending cards are never shown as losses. Awaiting-next-card lanes are
            listed separately — they are not pending settlements.
          </span>
        </div>
      </section>

      {/* ── 8. MLB model-performance summary (money-INDEPENDENT) ──────── */}
      <section
        aria-label="MLB model performance"
        id="mlb-model-performance"
        className="rounded-[10px] px-4 sm:px-5 py-4 flex flex-col gap-3"
        style={{ scrollMarginTop: 80, ...CARD }}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2
            className="font-mono uppercase tracking-[0.16em] m-0 font-normal"
            style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
          >
            MLB model performance
          </h2>
          {mlb.latestDate && (
            <FreshnessBadge slateDate={mlb.latestDate} serverToday={today} noun="grading" />
          )}
        </div>
        <p
          className="rounded-[8px] px-3 py-2 text-[11.5px] leading-relaxed m-0"
          style={{
            background: "rgba(242,54,69,0.06)",
            border: "1px solid var(--vault-rule)",
            color: "var(--vault-text-mute)",
          }}
        >
          Raw model-performance ledger — every published MLB projection graded
          against official box scores. This is <strong>not</strong> part of the{" "}
          {money ? `${money.record.wins}-${money.record.losses}` : "official"}{" "}
          product-card record above, and the two are never combined.
        </p>
        {mlb.daily ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-[8px] px-3 py-2.5 flex flex-col gap-0.5" style={{ background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" }}>
                <Eyebrow>Latest date</Eyebrow>
                <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 15 }}>
                  {mlb.latestDate}
                </span>
              </div>
              <div className="rounded-[8px] px-3 py-2.5 flex flex-col gap-0.5" style={{ background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" }}>
                <Eyebrow>Decisive leans</Eyebrow>
                <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 15 }}>
                  {mlb.daily.decisive}
                </span>
              </div>
              <div className="rounded-[8px] px-3 py-2.5 flex flex-col gap-0.5" style={{ background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" }}>
                <Eyebrow>Day hit rate</Eyebrow>
                <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 15 }}>
                  {pct(mlb.daily.hitRate)}
                </span>
              </div>
              <div className="rounded-[8px] px-3 py-2.5 flex flex-col gap-0.5" style={{ background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" }}>
                <Eyebrow>Lifetime hit rate</Eyebrow>
                <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 15 }}>
                  {mlb.lifetime ? pct(mlb.lifetime.hitRate) : "—"}
                </span>
              </div>
            </div>
            {mlb.byMarket.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {mlb.byMarket.map((m) => (
                  <span key={m.key} className="text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
                    {m.label}{" "}
                    <span style={{ color: "var(--vault-text)" }}>{pct(m.hitRate)}</span>
                    <span style={{ color: "var(--vault-text-faint)" }}> ({m.total})</span>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
            No graded MLB slate is available yet.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/results/mlb/"
            className="font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-full"
            style={{ color: "var(--vault-gold-bright)", border: "1px solid var(--vault-gold-bright)", fontSize: 10.5 }}
          >
            MLB results →
          </Link>
          <Link
            href="/results/model-audit/"
            className="font-mono uppercase tracking-[0.12em] px-3 py-1.5 rounded-full"
            style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", fontSize: 10.5 }}
          >
            Model audit →
          </Link>
        </div>
      </section>

      {/* ── 10. Settlement policy ────────────────────────────────────── */}
      <section
        aria-label="Settlement policy"
        className="rounded-[10px] px-4 sm:px-5 py-4 flex flex-col gap-2"
        style={CARD}
      >
        <h2
          className="font-mono uppercase tracking-[0.16em] m-0 font-normal"
          style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
        >
          How settlement works
        </h2>
        <ul className="pl-4 flex flex-col gap-1 text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)", listStyle: "disc" }}>
          <li>Product cards settle on <strong>official finals only</strong> — never on in-progress or web-snippet scores.</li>
          <li>A pending card is <strong>not a loss</strong>. It stays pending until the official result is in.</li>
          <li>Pushes and voids are handled separately and excluded from the win/loss denominator.</li>
          <li>Raw MLB model-performance grading is a separate ledger and never changes the product-card record.</li>
          <li>No paper exposure is created without an approved card — no-play days create nothing.</li>
        </ul>
      </section>
    </div>
  );
}
