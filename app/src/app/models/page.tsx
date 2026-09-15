/**
 * MODEL LAB (P312) — the research discipline, in public.
 *
 * Every line here is derived from a receipt, a protocol or the health scorecard at build time
 * (lib/command-center/model-lab.ts). Nothing is typed as a standing fact: a model that is paused says
 * paused, a research candidate says research only, and a family with too few graded games says so.
 */
import type { Metadata } from "next";
import Link from "next/link";
import path from "node:path";
import ModelStatusPanel from "@/components/command-center/model-status-panel";
import ModelStatusChip from "@/components/command-center/model-status-chip";
import { buildModelLab, type LabDecision } from "@/lib/command-center/model-lab";
import { PUBLIC_STATE_LABEL, PUBLIC_STATE_MEANING, type PublicModelState } from "@/lib/command-center/contract";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata: Metadata = withRouteMetadata("/models/", {
  title: "Model Lab — GameTime Picks",
  description: "Which GameTime Picks models are live, which are being tested, which are paused, and what the receipts decided — in plain English.",
});

const OUTCOME_LABEL: Record<LabDecision["outcome"], string> = { ADOPTED: "Adopted", REJECTED: "Rejected", SECOND_LOOK: "Second look", ESTIMATE: "Estimate", PAUSED: "Paused", SHADOW: "Research only" };
const OUTCOME_TONE: Record<LabDecision["outcome"], string> = { ADOPTED: "var(--vault-success)", REJECTED: "var(--gtp-bank-heat)", SECOND_LOOK: "var(--vault-warn)", ESTIMATE: "var(--vault-warn)", PAUSED: "var(--gtp-bank-heat)", SHADOW: "var(--vault-text-faint)" };
const fmtDay = (d: string) => (Number.isFinite(Date.parse(`${d}T12:00:00Z`)) ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : d);

function Section({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 flex flex-col gap-3">
      <div>
        <h2 id={`${id}-h`} className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 20, fontWeight: 800 }}>{title}</h2>
        <p className="m-0 mt-1 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{sub}</p>
      </div>
      {children}
    </section>
  );
}

export default function ModelLabPage() {
  const lab = buildModelLab({ dataRoot: path.join(process.cwd(), "public", "data"), repoRoot: path.join(process.cwd(), ".."), nowIso: new Date().toISOString() });
  const statesInUse = new Set<PublicModelState>([...lab.live.flatMap((l) => l.items.map((i) => i.state)), ...lab.experiments.map((e) => e.state)]);
  return (
    <div className="vault-page-shell flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold)", fontSize: 10.5 }}>Model Lab</span>
        <h1 className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: "clamp(24px,5vw,34px)", fontWeight: 800, lineHeight: 1.05 }}>What is live, what is being tested, what is paused</h1>
        <p className="m-0 max-w-2xl text-[14px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          Every model here was scored on past games it had never seen before it went live, is graded on every new game after, and can be paused or replaced by its own record. This page reads those receipts; it does not restate them.
        </p>
        <nav aria-label="Model Lab sections" className="flex flex-wrap gap-2 font-mono uppercase tracking-[0.1em]" style={{ fontSize: 10 }}>
          {[["#live", "Live models"], ["#experiments", "Experiments"], ["#decisions", "Recent decisions"], ["#paused", "Why a model pauses"], ["#glossary", "The words we use"]].map(([href, label]) => (
            <a key={href} href={href} className="rounded-full px-2.5 py-1" style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", minHeight: 28, display: "inline-flex", alignItems: "center" }}>{label}</a>
          ))}
        </nav>
      </header>

      <Section id="live" title="Models currently live" sub="Each sport's model families and where they stand right now.">
        <div className="grid gap-3 md:grid-cols-2">
          {lab.live.map((l) => <ModelStatusPanel key={l.sport} id={`live-${l.sport}`} sportLabel={l.label} items={l.items} />)}
        </div>
      </Section>

      <Section id="experiments" title="Experiments and shadows" sub="Blind forward tests grade a live model week by week; a shadow is scored privately and powers nothing public.">
        {lab.experiments.length ? (
          <ul className="m-0 p-0 list-none grid gap-2 md:grid-cols-2">
            {lab.experiments.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 rounded-[10px] px-3 py-2.5" style={{ border: "1px solid var(--vault-rule)", background: "var(--vault-panel)" }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 700 }}>{e.label}</span>
                  <ModelStatusChip state={e.state} label={e.kind === "SHADOW" ? PUBLIC_STATE_LABEL.SHADOW : PUBLIC_STATE_LABEL[e.state]} />
                </div>
                <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{e.headline}</span>
                <p className="m-0 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{e.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No forward test or shadow is registered right now.</p>
        )}
      </Section>

      <Section id="decisions" title="Recent decisions" sub="What the receipts decided, most recent first. A rejected candidate stays rejected; it is never retried by tweaking it.">
        <ol className="m-0 p-0 list-none flex flex-col gap-2">
          {lab.decisions.map((d, i) => (
            <li key={`${d.when}-${i}`} className="flex flex-col gap-1 rounded-[10px] px-3 py-2.5" style={{ border: "1px solid var(--vault-rule)" }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{fmtDay(d.when)} · {d.sport.toUpperCase()}</span>
                <span className="font-mono uppercase tracking-[0.1em]" style={{ color: OUTCOME_TONE[d.outcome], fontSize: 9.5 }}>{OUTCOME_LABEL[d.outcome]}</span>
              </div>
              <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 700 }}>{d.what}</span>
              <p className="m-0 text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{d.detail}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="paused" title="Why a model can be paused" sub="Health is an alarm. Only a preregistered forward test or the live-record gate changes what publishes.">
        <p className="m-0 max-w-2xl text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          Every public call is graded against official results. When a call has done worse than a coin flip by a clear margin over its graded record, the live-record gate withdraws it from every page. The model keeps making and grading that call every day, so the record can recover and the call comes back on its own. Nothing is edited by hand, and grading never reads the paused page.
        </p>
      </Section>

      <Section id="glossary" title="The words we use" sub="Lower is better for a miss or a loss score; about 8 in 10 is the target for a range, not a score to beat.">
        <dl className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(PUBLIC_STATE_LABEL) as PublicModelState[]).filter((k) => statesInUse.has(k)).map((k) => (
            <div key={k} className="rounded-[10px] px-3 py-2.5" style={{ border: "1px solid var(--vault-rule)" }}>
              <dt className="font-mono uppercase tracking-[0.12em] mb-1" style={{ color: "var(--vault-gold)", fontSize: 9.5 }}>{PUBLIC_STATE_LABEL[k]}</dt>
              <dd className="m-0 text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{PUBLIC_STATE_MEANING[k]}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 text-[12.5px]" style={{ color: "var(--vault-text-faint)" }}>
          A range that always hits could be made by widening it; progress is a narrower range that still lands about 8 in 10. A miss or a loss score is lower when better. Calibration means a call shown at 60% lands about 6 in 10 times. Every figure on this site is from a receipt or a graded ledger; the <Link href="/methodology/" style={{ color: "var(--vault-gold-bright)" }}>methodology</Link> explains how each is built.
        </p>
      </Section>
    </div>
  );
}
