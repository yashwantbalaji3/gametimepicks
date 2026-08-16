/**
 * /ufc — the UFC settled archive.
 *
 * UFC is SCAFFOLD_ONLY in the capability registry (formally downgraded 2026-07-23): the retired V1
 * moneyline read was a de-vigged market price with a capped nudge, and no bout is cleanly
 * backtestable without point-in-time odds capture. So nothing predictive publishes here — no
 * projections, no suggested cards, no fight-card simulator, no upcoming-event framing.
 *
 * What DOES stay published is the settled record: UFC Freedom 250 was graded from the official
 * ESPN MMA scoreboard and its outcomes were public product output, so the record is preserved as a
 * dated archive rather than quietly deleted (same principle as the NBA settled archive). The page
 * is fail-closed on the settlement artifact: no official "final" settlement, no record shown.
 */
import fs from "node:fs";
import Explain from "@/components/ui/explain";
import UfcCard, { type UfcCardArtifact } from "@/components/sports/ufc-card";
import { ScheduleList } from "@/components/sports/sport-schedule-page";
import { allUpcoming } from "@/lib/sports/upcoming/adapters.mjs";
import path from "node:path";
import Link from "next/link";
import UfcEventResultsRecap, { type UfcSettlement } from "@/components/ufc/event-results-recap";

export const metadata = {
  title: "UFC Settled Archive · GameTime Picks",
  description:
    "The settled UFC archive — every graded fight from the one officially settled card, sourced from the official ESPN MMA scoreboard. Historical record only; UFC has no live model coverage.",
};

function loadJSONUfc<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", name), "utf-8")) as T;
  } catch {
    return null;
  }
}

const fmtDay = (iso?: string) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
};

export default function UfcArchivePage() {
  // UPCOMING SCHEDULE (P186). The archive stays exactly as it is — it is the only surface the settled
  // record has — and the schedule sits above it so the page answers "what is next" as well as "what
  // happened". Nothing predictive is added: bouts are listed with a time and nothing else.
  type Feed = { sport?: string; events?: unknown[]; totals?: { upcoming?: number }; sourceVerdict?: { sourceId?: string | null; fetchedAt?: string | null } };
  const feed = (allUpcoming({ nowIso: new Date().toISOString() }) as unknown as Feed[]).find((x) => x.sport === "ufc");
  // The full card (bouts, portraits, records, the one modelled prop) when a card artifact exists;
  // the generic schedule list is the fallback so the page never renders empty.
  const card = loadJSONUfc<UfcCardArtifact>("card-latest.json");
  const settlement = loadJSONUfc<UfcSettlement>("results-settled-latest.json");
  // Fail-closed: only an OFFICIAL final settlement may render a record.
  const settled = settlement && settlement.status === "final" ? settlement : null;
  const settledOn = fmtDay(settled?.settledAt);

  // A later card can exist in the schedule artifact without ever being officially settled. It must
  // never be framed as a next/current event here — the only honest statement is that no record exists.
  const sched = loadJSONUfc<{ eventName?: string; eventDate?: string }>("schedule-latest.json");
  const unsettledLaterCard =
    settled && sched?.eventName && sched.eventName !== settled.event
      ? { name: sched.eventName, day: fmtDay(sched.eventDate) }
      : null;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 24, fontWeight: 700 }}>
            UFC
          </h1>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--sport-ufc)", border: "1px solid var(--sport-ufc)", background: "rgba(217,164,65,0.08)" }}
          >
            Predictions · experimental
          </span>
        </div>
        <p className="max-w-2xl font-mono text-[11.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          Winner, method and finishing round for every bout on the next card. Paper and educational.
        </p>
        <Explain label="What changed, and what is still refused">
          The de-vigged-price read that ran until 2026-07-23 was retired: it restated the sportsbook
          rather than forming an opinion. What publishes now is a fight model trained on 8,642
          decisive bouts, with each of its three markets tested separately against a base-rate
          baseline. No sportsbook price is shown or compared — our odds authorisation covers NFL
          only — so these probabilities stand alone rather than being set against a market they have
          not seen. The settled record from the retired era is kept below.
        </Explain>
        <nav className="flex flex-wrap gap-3 font-mono text-[11px]" style={{ color: "var(--vault-text-faint)" }}>
          <Link href="/today" style={{ color: "var(--gtp-bank-heat)" }}>Live action → Today</Link>
          <Link href="/results" style={{ color: "var(--vault-text-mute)" }}>Track record → Results</Link>
          <Link href="/methodology" style={{ color: "var(--vault-text-mute)" }}>How everything is graded → Methodology</Link>
        </nav>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700, margin: 0 }}>Next card</h2>
        </div>
        {card?.bouts?.length
          ? <UfcCard card={card} />
          : <ScheduleList events={(feed?.events ?? []) as never[]} sides={["red", "blue"]} joiner="vs" />}
        <p className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)", margin: 0 }}>
          Schedule source: {feed?.sourceVerdict?.sourceId ?? "ESPN"}
        </p>
      </section>

      {settled ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)" }}>
              Officially settled {settledOn}
            </span>
          </div>
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display" style={{ color: "var(--vault-text)", fontSize: 17, fontWeight: 700, margin: 0 }}>
            Settled archive
          </h2>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em]"
            style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", background: "rgba(7, 11, 9,0.5)" }}
          >
            Archive · no live coverage
          </span>
        </div>
      </section>

          <UfcEventResultsRecap s={settled} />
          <p className="font-mono text-[10px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
            This is one settled event ({settled.fights.length} graded fights). A single-card record is an outcome log,
            not model validation — the moneyline model was retired unvalidated.
          </p>
        </section>
      ) : (
        <section className="rounded-[10px] px-4 py-5 font-mono text-[11.5px]" style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-border)", background: "rgba(11, 18, 14,0.45)" }}>
          No officially settled UFC record is available. Nothing renders here until an official settlement exists.
        </section>
      )}

      {unsettledLaterCard ? (
        <p className="max-w-2xl font-mono text-[10.5px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
          {unsettledLaterCard.name}
          {unsettledLaterCard.day ? ` (${unsettledLaterCard.day})` : ""} was listed with market-implied reads only
          before the event; no model picks were published for it and no official settlement was ingested, so no record
          is claimed for it.
        </p>
      ) : null}
    </div>
  );
}
