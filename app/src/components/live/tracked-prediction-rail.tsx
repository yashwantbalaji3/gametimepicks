"use client";
/**
 * THE PROGRESS RAIL (§5) — a tracked prediction, from frozen forecast to canonical result.
 *
 * The founder's reference for this interaction is a sportsbook bet-slip. What is borrowed is the
 * SCANABILITY — a vertical list where each row states participant, market, current value and how
 * that value sits against a frozen target, without opening anything. What is deliberately NOT
 * borrowed is the settlement grammar, because a sportsbook may call a leg won the moment a stat
 * crosses a line and this product may not.
 *
 * ⚠ THE RULE, AND WHERE IT IS ENFORCED. `railStateOf` in `tracked-prediction.mjs` cannot return a
 * result state outside FINAL_CANONICAL, proved there across 1,344 input combinations. This file
 * therefore has NO branch that decides a win: it renders whatever state it is handed. The green
 * treatment is reachable only through FINAL_WIN, and FINAL_WIN is reachable only through
 * settlement. A colour cannot get ahead of the truth because no code path exists for it to.
 *
 * ⚠ NO PROBABILITY IS EXPRESSIBLE. Like `live-primitives.tsx`, there is no prop through which a
 * percentage, a pace or an "on track" reading could be passed. The rail is arithmetic over two
 * numbers that are already public.
 *
 * ACCESSIBILITY (§5.3). Colour never carries state alone: every row states its status in words, and
 * the bar itself is `aria-hidden` with a full sentence exposed to assistive technology — current
 * value, frozen target, event state and finality. Motion is opt-out via `prefers-reduced-motion`.
 *
 * ⚠ STYLES ARE HOISTED, NOT BUILT PER ROW. A per-cell style object took one page of this product to
 * 1,160KB. Everything constant below is defined once at module scope; only the two rail offsets,
 * which genuinely vary per row, are computed inline.
 */
import {
  RAIL_STATE, MARKET_KIND, FINALITY,
  railStateOf, railGeometry,
} from "@/lib/live/tracked-prediction.mjs";

const MONO = "var(--font-mono)";

/* ── the state vocabulary, as a reader meets it ─────────────────────────────────────────────────
 *
 * `tone` picks a colour; `label` is the words that carry the same thing without it. Every entry has
 * both — an entry with a colour and no label would be a state only sighted readers can perceive.
 */
type Tone = "neutral" | "live" | "win" | "loss" | "muted" | "warn";

const PRESENTATION: Record<string, { label: string; tone: Tone }> = {
  [RAIL_STATE.PRE]: { label: "Scheduled", tone: "neutral" },
  [RAIL_STATE.PRE_GAME_SNAPSHOT_MISSING]: { label: "Pregame snapshot missing", tone: "warn" },

  /* Factual, during play. None of these is a statement about money. */
  [RAIL_STATE.CURRENTLY_ABOVE_LINE]: { label: "Currently above line", tone: "live" },
  [RAIL_STATE.CURRENTLY_BELOW_LINE]: { label: "Currently below line", tone: "live" },
  [RAIL_STATE.CURRENTLY_AT_LINE]: { label: "Currently at line", tone: "live" },
  [RAIL_STATE.CURRENTLY_ABOVE_RANGE]: { label: "Currently above pregame range", tone: "live" },
  [RAIL_STATE.CURRENTLY_INSIDE_RANGE]: { label: "Currently inside pregame range", tone: "live" },
  [RAIL_STATE.CURRENTLY_BELOW_RANGE]: { label: "Currently below pregame range", tone: "live" },
  [RAIL_STATE.RECORDED]: { label: "Recorded", tone: "live" },
  [RAIL_STATE.NOT_YET_RECORDED]: { label: "Not yet recorded", tone: "muted" },
  [RAIL_STATE.LIVE_UNRESOLVED]: { label: "Live — unresolved", tone: "live" },
  [RAIL_STATE.PROVIDER_DELAY]: { label: "Feed delayed", tone: "warn" },
  [RAIL_STATE.NO_MEASUREMENT]: { label: "No measurement", tone: "muted" },
  [RAIL_STATE.NOT_LIVE_TRACKABLE]: { label: "Not trackable live", tone: "muted" },

  /* Settled, and only settled. */
  /* The event is over and nothing has settled it. Neutral, and explicitly not a result. */
  [RAIL_STATE.FINAL_AWAITING_SETTLEMENT]: { label: "Final — awaiting settlement", tone: "neutral" },
  [RAIL_STATE.FINAL_WIN]: { label: "Final — hit", tone: "win" },
  [RAIL_STATE.FINAL_LOSS]: { label: "Final — miss", tone: "loss" },
  [RAIL_STATE.FINAL_PUSH]: { label: "Final — push", tone: "neutral" },
  [RAIL_STATE.FINAL_VOID]: { label: "Void — no action", tone: "neutral" },
  [RAIL_STATE.FINAL_NO_MEASUREMENT]: { label: "Final — ungraded", tone: "muted" },
};

/* ⚠ Only DECLARED tokens. A token that is read but never declared renders as inherited body text,
   which this repository has shipped once already. */
const TONE_FG: Record<Tone, string> = {
  neutral: "var(--vault-text-mute)",
  live: "var(--vault-info)",
  win: "var(--vault-success)",
  loss: "var(--vault-loss-red)",
  muted: "var(--vault-text-faint)",
  warn: "var(--vault-warn)",
};

const TONE_FILL: Record<Tone, string> = {
  neutral: "var(--vault-border-strong)",
  live: "var(--vault-info)",
  win: "var(--vault-success)",
  loss: "var(--vault-loss-red)",
  muted: "var(--vault-border-strong)",
  warn: "var(--vault-warn)",
};

/* ── hoisted styles ─────────────────────────────────────────────────────────────────────────── */

const S = {
  row: { padding: "10px 0", borderTop: "1px solid var(--vault-border)" } as const,
  head: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" } as const,
  who: { fontSize: 13, color: "var(--vault-text)", minWidth: 0, overflowWrap: "anywhere" } as const,
  market: { color: "var(--vault-text-faint)", fontSize: 11 } as const,
  value: {
    fontFamily: MONO, fontSize: 15, fontVariantNumeric: "tabular-nums",
    color: "var(--vault-text)", whiteSpace: "nowrap",
  } as const,
  target: { color: "var(--vault-text-faint)", fontSize: 11 } as const,
  track: {
    position: "relative", height: 6, background: "var(--vault-panel-elevated)",
    borderRadius: 3, marginTop: 8,
  } as const,
  fillBase: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 3 } as const,
  tick: { position: "absolute", top: -3, width: 2, height: 12, background: "var(--vault-gold)" } as const,
  statusLine: { fontFamily: MONO, fontSize: 10, margin: "6px 0 0", letterSpacing: "0.06em", textTransform: "uppercase" } as const,
  bookLine: { fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "3px 0 0" } as const,
  groupHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", padding: "2px 0 6px" } as const,
  groupTitle: { fontFamily: "var(--font-headline)", fontSize: 14, color: "var(--vault-text)" } as const,
  groupMeta: { fontFamily: MONO, fontSize: 11, color: "var(--vault-text-mute)", whiteSpace: "nowrap" } as const,
} satisfies Record<string, React.CSSProperties>;

const fmt = (n: number | null) => (n === null || n === undefined ? "—" : String(Math.round(n * 10) / 10));

/**
 * The accessible sentence. It is the ONLY place the row's meaning is stated in full, and it is
 * assembled from the same fields the visual reads — so the two cannot diverge.
 */
function sentence(p: any, state: string): string {
  const who = p.participantName ?? "This participant";
  const what = p.label ?? p.marketFamily;
  const target = p.pregame?.line !== null && p.pregame?.line !== undefined
    ? `a frozen ${p.pregame.sportsbook ?? "sportsbook"} line of ${p.pregame.line}`
    : p.pregame?.modelRange?.low !== null && p.pregame?.modelRange?.high !== null
      ? `a pregame range of ${fmt(p.pregame.modelRange.low)} to ${fmt(p.pregame.modelRange.high)}`
      : "no published target";
  const current = p.live?.currentValue === null || p.live?.currentValue === undefined
    ? "no value recorded"
    : `a current value of ${p.live.currentValue}`;
  const finality = p.final?.finality === FINALITY.FINAL_CANONICAL
    ? "The result is final and settled."
    : p.final?.finality === FINALITY.FINAL_PROVISIONAL
      ? "The provider reports the event as final; it is not yet settled."
      : "The event is not final.";
  const st = PRESENTATION[state]?.label ?? state;
  return `${who}, ${what}: ${current}, against ${target}. Status: ${st}. ${finality}`;
}

/* ── one row ────────────────────────────────────────────────────────────────────────────────── */

export function TrackedPredictionRail({ prediction }: { prediction: any }) {
  const p = prediction;
  const state = railStateOf(p);
  const pres = PRESENTATION[state] ?? { label: state, tone: "muted" as Tone };

  /* The rail is drawn against a PURCHASED line where one exists, and otherwise against the top of
     the model's band. Which one it is, is said in words beneath — never implied by the bar. */
  const hasLine = typeof p.pregame?.line === "number";
  const against = hasLine ? p.pregame.line : p.pregame?.modelRange?.high ?? null;
  const geo = railGeometry({
    currentValue: p.live?.currentValue,
    line: against,
    marketKind: p.marketKind,
  });

  const showBar = geo !== null && p.marketKind !== MARKET_KIND.TERMINAL;

  return (
    <div style={S.row}>
      <div style={S.head}>
        <span style={S.who}>
          {p.participantName ?? "—"} <span style={S.market}>· {p.label ?? p.marketFamily}</span>
        </span>
        <span style={S.value}>
          {/*
            ⚠ A TERMINAL MARKET HAS NO CURRENT VALUE TO SHOW. A fight winner is resolved at the end
            or not at all, and the join's internal 1 rendered as a bare "1" beside the fighter's
            name — a number that means nothing to a reader and looks like a score. The round is the
            only thing that is actually true about a bout in progress, so that is what is shown.
          */}
          {p.marketKind === MARKET_KIND.TERMINAL
            ? <span style={S.target}>{p.live?.periodState ?? "—"}</span>
            : p.marketKind === MARKET_KIND.BINARY
              ? (p.live?.currentValue === null || p.live?.currentValue === undefined
                  ? "—"
                  : p.live.currentValue >= 1 ? "Yes" : "No")
              : fmt(p.live?.currentValue ?? null)}
          {/* The target, and WHICH KIND of target it is. "96 hi" was this product's own shorthand
              leaking to a reader; a band is shown as a band. */}
          {p.marketKind !== MARKET_KIND.TERMINAL && against !== null && (
            <span style={S.target}>
              {" "}/ {hasLine
                ? fmt(against)
                : `${fmt(p.pregame?.modelRange?.low ?? null)}\u2013${fmt(p.pregame?.modelRange?.high ?? null)}`}
            </span>
          )}
        </span>
      </div>

      {showBar && (
        /* Decoration only. Everything it conveys is also in the status line and the sentence. */
        <div aria-hidden="true" style={S.track}>
          <div style={{ ...S.fillBase, width: `${geo!.valueFraction * 100}%`, background: TONE_FILL[pres.tone] }} />
          <div style={{ ...S.tick, left: `${geo!.targetFraction * 100}%` }} />
        </div>
      )}

      <p style={{ ...S.statusLine, color: TONE_FG[pres.tone] }}>
        {pres.label}
        {geo?.beyondTarget && p.marketKind === MARKET_KIND.ADDITIVE ? " · past target" : ""}
      </p>

      {/* The frozen side, stated plainly: which book, what price, and WHEN it was captured. */}
      {hasLine && (
        <p style={S.bookLine}>
          Frozen {p.pregame.sportsbook ?? "line"} {p.pregame.line}
          {p.pregame.overPrice !== null && p.pregame.overPrice !== undefined ? ` · o ${p.pregame.overPrice}` : ""}
          {p.pregame.underPrice !== null && p.pregame.underPrice !== undefined ? ` · u ${p.pregame.underPrice}` : ""}
          {p.pregame.capturedAt ? ` · captured ${p.pregame.capturedAt.slice(11, 16)}Z` : ""}
        </p>
      )}
      {!hasLine && p.live?.measurementState === "MARKET_UNSUPPORTED" && p.pregame?.provenance && (
        <p style={S.bookLine}>{p.pregame.provenance}</p>
      )}
      {/* ⚠ No line was purchased for this family, and the row says so rather than letting a reader
          read the model's own band as a market number. */}
      {!hasLine && against !== null && p.marketKind !== MARKET_KIND.TERMINAL && (
        <p style={S.bookLine}>
          GameTimePicks pregame range · no sportsbook line published for this market
        </p>
      )}
      {/* §9: for a bout, the round and clock ARE the live state. */}
      {/* The round already sits in the value slot, so the meta line carries only the clock — the
          same fact twice reads as two facts. */}
      {p.marketKind === MARKET_KIND.TERMINAL && p.live?.clock && (
        <p style={S.bookLine}>{p.live.clock} remaining</p>
      )}

      <span className="sr-only">{sentence(p, state)}</span>
    </div>
  );
}

/* ── one event's predictions, grouped (§5.4) ────────────────────────────────────────────────── */

/**
 * ⚠ THE GROUP HEADER STATES THE EVENT, NOT A SCORE IT WAS NOT GIVEN. `score` and `period` are
 * rendered only when the caller passes them; an absent score is omitted rather than shown as 0,
 * which is the same rule `LiveScoreStrip` keeps.
 */
export function TrackedPredictionGroup({
  title, score, period, clock, predictions,
}: {
  title: string;
  score?: string | null;
  period?: string | null;
  clock?: string | null;
  predictions: any[];
}) {
  const meta = [score, period, clock].filter(Boolean).join(" · ");
  return (
    <section style={{ padding: "12px 0" }}>
      <header style={S.groupHead}>
        <h3 style={S.groupTitle}>{title}</h3>
        {meta ? <span style={S.groupMeta}>{meta}</span> : null}
      </header>
      {predictions.map((p, i) => (
        <TrackedPredictionRail key={`${p.eventId}:${p.participantId}:${p.marketFamily}:${i}`} prediction={p} />
      ))}
    </section>
  );
}
