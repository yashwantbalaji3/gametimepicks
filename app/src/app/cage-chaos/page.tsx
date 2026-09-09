/**
 * /cage-chaos — the UFC signature product's own page (P251 · F4).
 *
 * Cage Chaos is the only model on this site that beat its baseline on every head it was tested on,
 * and it had no home: /mr-dub's "Open →" dropped a reader at the top of the UFC hub. This is the
 * product view — the whole card ranked by how decisively the model reads each bout, with the three
 * heads' held-out evidence, and every row opening its own bout report.
 */
import Link from "next/link";

import SectionHeader from "@/components/section-header";
import { loadUfcCard } from "@/lib/sports/ufc/bout";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/cage-chaos/", {
  title: "Cage Chaos · GameTime Picks",
  description:
    "How each fight on the next UFC card ends — winner, method and round — from three separately evaluated heads, each published only on its own preregistered verdict. Paper-only, educational.",
});

const ET = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso));
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const METHOD_LABEL: Record<string, string> = { KO: "KO / TKO", SUB: "Submission", DEC: "Decision" };

const PANEL: React.CSSProperties = {
  background: "var(--vault-panel)", border: "1px solid var(--vault-rule)", borderRadius: 12,
  padding: "clamp(14px, 2vw, 20px)",
};

export default function CageChaosPage() {
  const card = loadUfcCard();
  const bouts = card?.bouts ?? [];
  const read = bouts.filter((b) => b.prediction?.winner);
  const refused = bouts.filter((b) => !b.prediction?.winner);
  /* Ranked by how DECISIVE the read is, which is the product's question — the hub keeps card order,
     which is the event's question. Neither re-sorts the other. */
  const ranked = [...read].sort((a, b) => (b.prediction!.winner!.probability) - (a.prediction!.winner!.probability));
  const ev = card?.model?.evidence;

  return (
    <div data-sport="ufc" className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="font-mono uppercase tracking-[0.18em] flex items-center gap-2" style={{ color: "var(--sport-ufc)", fontSize: 10 }}>
          <span aria-hidden>🥊</span> Cage Chaos · UFC
        </span>
        <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
          How each fight ends — and in which round
        </h1>
        <p className="m-0 max-w-[68ch]" style={{ color: "var(--vault-text-mute)", fontSize: 14, lineHeight: 1.6 }}>
          Three heads, evaluated separately: who wins, how it ends, and how far it goes. Each publishes only on its own
          PASS verdict against a bar frozen before it was fitted — and all three cleared theirs, which no other model
          here has done.
        </p>
      </header>

      {!card || !bouts.length ? (
        <section style={{ ...PANEL }}>
          <p className="m-0" style={{ fontSize: 14 }}>No UFC card is inside the current window.</p>
        </section>
      ) : (
        <>
          <section style={{ ...PANEL, borderColor: "color-mix(in srgb, var(--sport-ufc) 40%, var(--vault-rule))" }}>
            <div className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10, color: "var(--sport-ufc)", marginBottom: 6 }}>
              {card.event?.name ?? "Next card"}
            </div>
            <p className="m-0" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
              {read.length} of {bouts.length} bouts carry a model read
              {card.event?.startUtc ? ` · ${ET(card.event.startUtc)} ET` : ""}
              {card.event?.venue ? ` · ${card.event.venue}` : ""}.
              {refused.length ? ` The other ${refused.length} have too little tracked history and are named below rather than guessed.` : ""}
            </p>
          </section>

          <section>
            <SectionHeader eyebrow="The card" title="Ranked by how decisively the model reads it"
              sub="Card order lives on the UFC hub; this is the product's own ordering. Every row opens the full bout report." />
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                <thead>
                  <tr>{["Bout", "Model pick", "Win chance", "How it ends", "How far"].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: "left", padding: "7px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {ranked.map((b) => (
                    <tr key={b.boutId}>
                      <td style={{ padding: "8px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5 }}>
                        <Link href={`/ufc/bout/${b.boutId}/`} style={{ color: "var(--vault-text)", textDecoration: "none" }}>
                          {b.red.name} vs {b.blue.name}
                          <span style={{ display: "block", color: "var(--vault-text-faint)", fontSize: 11 }}>{b.weightClass}{b.titleFight ? " · title fight" : ""}</span>
                        </Link>
                      </td>
                      <td style={{ padding: "8px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontWeight: 600 }}>{b.prediction!.winner!.name}</td>
                      <td className="font-mono" style={{ padding: "8px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5 }}>{pct(b.prediction!.winner!.probability)}</td>
                      <td style={{ padding: "8px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12, color: "var(--vault-text-mute)" }}>
                        {b.prediction?.method ? `${METHOD_LABEL[b.prediction.method.most] ?? b.prediction.method.most} ${pct(b.prediction.method.probabilities[b.prediction.method.most === "KO" ? "ko" : b.prediction.method.most === "SUB" ? "submission" : "decision"])}` : "—"}
                      </td>
                      <td style={{ padding: "8px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12, color: "var(--vault-text-mute)" }}>
                        {b.prediction?.rounds ? `${b.prediction.rounds.endsIn === "3+" ? "R3 or later" : `R${b.prediction.rounds.endsIn}`} · distance ${pct(b.prediction.rounds.goesTheDistance)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {refused.length ? (
            <section>
              <SectionHeader eyebrow="Not read" title="Bouts the model refuses"
                sub="A fighter with no tracked history gets no invented read. These are named rather than dropped." />
              <div style={{ ...PANEL, display: "grid", gap: 8, marginTop: 12 }}>
                {refused.map((b) => (
                  <div key={b.boutId} style={{ fontSize: 12.5 }}>
                    <Link href={`/ufc/bout/${b.boutId}/`} style={{ color: "var(--vault-text)", fontWeight: 600 }}>{b.red.name} vs {b.blue.name}</Link>
                    <span style={{ display: "block", color: "var(--vault-text-faint)", fontSize: 11.5 }}>{b.unmodelledReason}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <SectionHeader eyebrow="Evidence" title="What each head was measured on" />
            <div style={{ ...PANEL, display: "grid", gap: 8 }}>
              {([["Winner", ev?.winner], ["Method", ev?.method], ["Round", ev?.round]] as const).map(([label, e]) =>
                e?.accuracy != null && e?.n != null ? (
                  <div key={label} className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)", lineHeight: 1.7 }}>
                    <strong style={{ color: "var(--vault-text)" }}>{label}</strong>{" "}
                    {pct(e.accuracy)} accurate over {e.n.toLocaleString()} held-out fights
                    {e.baselineAccuracy != null ? ` · baseline ${pct(e.baselineAccuracy)}` : ""}
                  </div>
                ) : null,
              )}
              {card.model?.corpus?.fights ? (
                <p className="font-mono m-0" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
                  corpus {card.model.corpus.fights.toLocaleString()} fights
                  {card.model.corpus.from && card.model.corpus.to ? ` · ${card.model.corpus.from} to ${card.model.corpus.to}` : ""}
                  {card.model.id ? ` · model ${card.model.id}` : ""}
                </p>
              ) : null}
              <p className="m-0" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>Educational and paper-only — not betting advice.</p>
            </div>
          </section>
        </>
      )}

      <nav className="flex flex-wrap gap-3" style={{ fontSize: 12.5 }}>
        <Link href="/ufc/" style={{ color: "var(--vault-gold-bright)" }}>UFC hub →</Link>
        <Link href="/results/picks/ufc/" style={{ color: "var(--vault-gold-bright)" }}>Settled record →</Link>
        <Link href="/mr-dub/" style={{ color: "var(--vault-gold-bright)" }}>Every signature product →</Link>
      </nav>
    </div>
  );
}
