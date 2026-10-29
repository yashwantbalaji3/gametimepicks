/**
 * /cage-chaos — the UFC signature product's own page (P251 · F4).
 *
 * Cage Chaos is the UFC model's product view (an experimental model: tested on past fights, winner
 * forecasts graded on every new card — founder decision D2, 2026-10-07), and it had no home: /mr-dub's "Open →" dropped a reader at the top of the UFC hub. This is the
 * product view — the whole card ranked by how decisively the model reads each bout, with the three
 * heads' held-out evidence, and every row opening its own bout report.
 */
import Link from "next/link";

import SectionHeader from "@/components/section-header";
import PlayerAvatar from "@/components/ui/player-avatar";
import { loadUfcCard } from "@/lib/sports/ufc/bout";
import { ufcMethodRead, ufcPct, ufcRoundRead } from "@/lib/sports/ufc/round-phrase.mjs";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/cage-chaos/", {
  title: "Cage Chaos · GameTime Picks",
  description:
    "How each fight on the next UFC card ends — winner, method and round — from three separately evaluated heads, each published only on its own preregistered verdict. Paper-only, educational.",
});

const ET = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso));
const pct = (n: number) => ufcPct(n) ?? "—";

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
          {/* GTP-34: probability language — these are experimental estimates, not how fights WILL end. */}
          How each fight might end: the model&apos;s chances by method and round
        </h1>
        <p className="m-0 max-w-[68ch]" style={{ color: "var(--vault-text-mute)", fontSize: 14, lineHeight: 1.6 }}>
          Three separate estimates: who wins, the likeliest way the fight ends, and how far it is likely to go. Each was tested on past
          fights it never trained on before it was published. This is an experimental model: winner forecasts are
          graded on every new card, method and round are not yet graded, and it has not been shown to have an edge
          over the market.
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
            {/* Overnight 10-28: at 390/430px the 620px-wide table pushed "Likeliest ending" and "Likeliest round" off-screen
                behind a horizontal scroll with no cue. Below the sm breakpoint each row now stacks as a card — the bout on
                top, the four reads in a labelled 2×2 grid — so every column is visible on a phone. Desktop is unchanged. */}
            <div className="sm:overflow-x-auto" style={{ marginTop: 12 }}>
              <table className="w-full max-sm:block sm:min-w-[620px]" style={{ borderCollapse: "collapse" }}>
                <thead className="max-sm:hidden">
                  <tr>{["Bout", "Model pick", "Win chance", "Likeliest ending", "Likeliest round"].map((h) => (
                    <th key={h} scope="col" style={{ textAlign: "left", padding: "7px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-2">
                  {ranked.map((b) => (
                    <tr key={b.boutId} className="max-sm:grid max-sm:grid-cols-2 max-sm:overflow-hidden max-sm:rounded-[10px] max-sm:border max-sm:border-[color:var(--vault-border)]" data-cage-chaos-row="">
                      <td className="max-sm:col-span-2 max-sm:block" style={{ padding: "8px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5 }}>
                        <Link href={`/ufc/bout/${b.boutId}/`} style={{ color: "var(--vault-text)", textDecoration: "none" }}>
                          {/* GTP-16: each fighter's portrait from the card artifact (exact athleteId); initials otherwise.
                              Decorative — the names follow in text. */}
                          <span aria-hidden style={{ display: "inline-flex", gap: 4, verticalAlign: "middle", marginRight: 8 }}>
                            <PlayerAvatar name={b.red.name} photo={b.red.photoUrl} size={28} decorative />
                            <PlayerAvatar name={b.blue.name} photo={b.blue.photoUrl} size={28} decorative />
                          </span>
                          {b.red.name} vs {b.blue.name}
                          <span style={{ display: "block", color: "var(--vault-text-faint)", fontSize: 11 }}>{b.weightClass}{b.titleFight ? " · title fight" : ""}</span>
                        </Link>
                      </td>
                      <td className="max-sm:block" style={{ padding: "8px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontWeight: 600 }}><CellLabel>Model pick</CellLabel>{b.prediction!.winner!.name}</td>
                      <td className="font-mono max-sm:block" style={{ padding: "8px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5 }}><CellLabel>Win chance</CellLabel>{pct(b.prediction!.winner!.probability)}</td>
                      <td className="max-sm:block" style={{ padding: "8px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12, color: "var(--vault-text-mute)" }}>
                        <CellLabel>Likeliest ending</CellLabel>
                        {ufcMethodRead(b.prediction?.method)?.text ?? "—"}
                      </td>
                      <td className="max-sm:block" style={{ padding: "8px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12, color: "var(--vault-text-mute)" }}>
                        <CellLabel>Likeliest round</CellLabel>
                        {/* Batch 1 #4: was "R3 or later · distance 47%" — the 47% was the decision share, not the round mass.
                            Both quantities now print under their own labels, from the one accessor the hub and bout page read. */}
                        {(() => {
                          const r = ufcRoundRead(b.prediction?.rounds);
                          const parts = [r?.likeliest?.text, r?.goesTheDistance?.text].filter(Boolean);
                          return parts.length ? parts.join(" · ") : "—";
                        })()}
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
                    {pct(e.accuracy)} accurate over {e.n.toLocaleString("en-US")} held-out fights
                    {e.baselineAccuracy != null ? ` · baseline ${pct(e.baselineAccuracy)}` : ""}
                  </div>
                ) : null,
              )}
              {card.model?.corpus?.fights ? (
                <p className="font-mono m-0" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
                  corpus {card.model.corpus.fights.toLocaleString("en-US")} fights
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

/** The column name, shown inside the cell only below the sm breakpoint (where the table header is hidden). */
function CellLabel({ children }: { children: string }) {
  return (
    /* display comes from the classes only: an inline display would override sm:hidden. */
    <span className="block sm:hidden" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)", fontWeight: 400 }}>
      {children}
    </span>
  );
}
