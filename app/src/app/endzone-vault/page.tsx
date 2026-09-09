/**
 * /endzone-vault — the NFL signature product's own page (P251 · F4).
 *
 * The flagship line is five products, one per sport. Homer Nukes had a route, a nav entry and a
 * track record; the Endzone Vault — live, and publishing on this very slate — was a section a
 * reader had to scroll the NFL hub to find, and it was not in the nav at all. Meanwhile Goal Rush
 * and Bucket Blitz, neither of which is built, each had their own URL. The two products that exist
 * were the two hardest to reach.
 *
 * This renders the same artifact the hub renders, through the same component, so the two cannot
 * disagree: the hub keeps a short preview, and the full board, the gates and the record live here.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

import SectionHeader from "@/components/section-header";
import EndzoneVaultBoard, { type VaultArtifact } from "@/components/nfl/endzone-vault-board";
import { withRouteMetadata } from "@/lib/seo/route-metadata";

export const metadata = withRouteMetadata("/endzone-vault/", {
  title: "Endzone Vault · GameTime Picks",
  description:
    "Who our model thinks is most likely to score a touchdown, for every game on the NFL slate — with the gates a card would have to clear, and why today is or is not one. Paper-only, educational.",
});

const read = <T,>(rel: string): T | null => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", rel), "utf8")) as T; } catch { return null; }
};

const ET = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso));

const PANEL: React.CSSProperties = {
  background: "var(--vault-panel)", border: "1px solid var(--vault-rule)", borderRadius: 12,
  padding: "clamp(14px, 2vw, 20px)",
};

export default function EndzoneVaultPage() {
  const vault = read<VaultArtifact>("nfl/end-zone-vault/latest.json");
  const ledger = read<{ entries?: Array<{ date: string; state: string; legs?: unknown[] }> }>("nfl/end-zone-vault/latest.json");
  void ledger;
  const rows = (vault?.state === "ACTIVE" ? vault.selections : vault?.watchlist) ?? [];

  return (
    <div data-sport="nfl" className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="font-mono uppercase tracking-[0.18em] flex items-center gap-2" style={{ color: "var(--sport-nfl)", fontSize: 10 }}>
          <span aria-hidden>🏈</span> Endzone Vault · NFL
        </span>
        <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
          Who our model thinks is most likely to score
        </h1>
        <p className="m-0 max-w-[68ch]" style={{ color: "var(--vault-text-mute)", fontSize: 14, lineHeight: 1.6 }}>
          A touchdown probability for every skill player on the slate, built from how a team is projected to score
          and how that scoring has historically been shared across its roster. Each name settles on its own.
        </p>
      </header>

      {!vault ? (
        <section style={{ ...PANEL }}>
          <p className="m-0" style={{ fontSize: 14 }}>The Vault has not run for a current NFL window.</p>
        </section>
      ) : (
        <>
          {/*
            THE OUTCOME, STATED BEFORE THE BOARD. The Vault produces exactly one result from a
            closed set, and "watchlist" is a different thing from "card" — a reader meets that
            distinction before the numbers, not after them.
          */}
          <section style={{ ...PANEL, borderColor: vault.isCard ? "color-mix(in srgb, var(--vault-success) 45%, var(--vault-rule))" : "color-mix(in srgb, var(--sport-nfl) 40%, var(--vault-rule))" }}>
            <div className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10, color: vault.isCard ? "var(--vault-success)" : "var(--sport-nfl)", marginBottom: 6 }}>
              {vault.isCard ? "Card published" : "Watchlist — no card today"}
            </div>
            <p className="m-0" style={{ fontSize: 13.5, lineHeight: 1.6 }}>{vault.reason}</p>
            {vault.generatedAt ? (
              <p className="font-mono m-0 mt-2" style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>Generated {ET(vault.generatedAt)} ET</p>
            ) : null}
          </section>

          {rows.length ? (
            <section>
              <SectionHeader eyebrow={`${rows.length} named`} title={vault.isCard ? "Today's card" : "Today's watchlist"}
                sub="Ranked by the model's own touchdown probability. A player designated out is not a scorer candidate and does not appear." />
              <div style={{ marginTop: 12 }}>
                <EndzoneVaultBoard vault={vault} limit={25} />
              </div>
              {vault.candidateCount && vault.candidateCount > rows.length ? (
                <p className="m-0 mt-2" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>
                  {vault.candidateCount.toLocaleString()} players cleared the minimum probability across the slate; the {rows.length} above are the highest.
                </p>
              ) : null}
            </section>
          ) : null}

          <section>
            <SectionHeader eyebrow="Method" title="How the number is built" />
            <div style={{ ...PANEL, display: "grid", gap: 10 }}>
              <p className="m-0" style={{ fontSize: 13, lineHeight: 1.65, color: "var(--vault-text-mute)" }}>
                Each game&rsquo;s projected points become a distribution over how many touchdowns that team scores. That
                total is then shared across the roster using each player&rsquo;s measured share of his club&rsquo;s scoring, taken
                from a walk-forward estimate that only ever folds in games played before this one. The two combine into
                one probability per player: the chance he scores at least once.
              </p>
              <p className="m-0" style={{ fontSize: 13, lineHeight: 1.65, color: "var(--vault-text-mute)" }}>
                The list never sums to 100%. Defences, special teams and every player not named here hold the rest, and
                a touchdown probability is conditional on playing — a player who does not take the field settles void
                rather than losing.
              </p>
              {vault.gates?.required?.length ? (
                <div>
                  <div className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 9.5, color: "var(--vault-text-faint)", marginBottom: 6 }}>
                    What a CARD would have to clear
                  </div>
                  <ul className="m-0" style={{ paddingLeft: 18, display: "grid", gap: 4 }}>
                    {vault.gates.required.map((g) => (
                      <li key={g} style={{ fontSize: 12.5, color: "var(--vault-text-mute)" }}>{g}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {vault.disclaimer ? (
                <p className="m-0" style={{ fontSize: 11.5, color: "var(--vault-text-faint)" }}>{vault.disclaimer}</p>
              ) : null}
            </div>
          </section>
        </>
      )}

      <nav className="flex flex-wrap gap-3" style={{ fontSize: 12.5 }}>
        <Link href="/nfl/" style={{ color: "var(--vault-gold-bright)" }}>NFL hub →</Link>
        <Link href="/mr-dub/" style={{ color: "var(--vault-gold-bright)" }}>Every signature product →</Link>
        <Link href="/methodology/" style={{ color: "var(--vault-gold-bright)" }}>How everything is built →</Link>
      </nav>
    </div>
  );
}
