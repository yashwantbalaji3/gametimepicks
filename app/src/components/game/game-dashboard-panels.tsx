/**
 * game-dashboard-panels.tsx — small presentational panels for the tabbed game dashboard:
 * Methodology explainers (MLB / soccer), a Coming-Soon roadmap (grouped, honest), and single
 * coming-soon cards. No data, no money. Every "coming soon" is a real roadmap item with a reason —
 * never a fabricated value.
 */
const CARD: React.CSSProperties = { background: "var(--gtp-card)", border: "1px solid var(--vault-rule)" };
const SUNKEN: React.CSSProperties = { background: "var(--gtp-card-sunken)", border: "1px solid var(--vault-rule)" };

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
      {children}
    </span>
  );
}

/** A single honest "coming soon" card — a title + the reason it isn't available. */
export function ComingSoonCard({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="rounded-[10px] px-3.5 py-3 flex flex-col gap-1" style={SUNKEN}>
      <span className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--vault-text)" }}>
        <span className="font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full" style={{ color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", fontSize: 8 }}>Coming soon</span>
        {title}
      </span>
      <span className="text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>{reason}</span>
    </div>
  );
}

/** Soccer scorers tab — anytime scorer odds exist but are one-sided; deferred honestly. */
export function ScorersPanel() {
  return (
    <section aria-label="Scorers" className="rounded-[12px] px-4 sm:px-5 py-4 flex flex-col gap-3" style={CARD}>
      <Eyebrow>Scorers</Eyebrow>
      <ComingSoonCard
        title="Anytime scorer board"
        reason="The book posts anytime-scorer prices, but one-sided (a Yes price per player, no No side) — a clean de-vig plus a scorer-settlement feed is still needed. Deferred rather than shown with vig, and never invented."
      />
    </section>
  );
}

/** Soccer Coming-Soon roadmap — grouped, honest, never fabricated. */
export function SoccerComingSoonRoadmap() {
  const groups: { group: string; items: { title: string; reason: string }[] }[] = [
    {
      group: "Player markets",
      items: [
        { title: "Anytime scorer", reason: "Provider-posted but one-sided; needs a scoring board + settlement." },
        { title: "Shots · shots on target · assists", reason: "Provider-posted but thin (1–2 books); needs a coverage gate." },
      ],
    },
    {
      group: "Match events",
      items: [
        { title: "Corners", reason: "Not an Odds API soccer market — needs a new provider." },
        { title: "Cards", reason: "Not an Odds API soccer market — needs a new provider." },
        { title: "Exact score", reason: "Needs a correct-score odds feed or a new provider." },
      ],
    },
    {
      group: "Advanced model layer",
      items: [
        { title: "Expected goals (xG)", reason: "Needs an event-data provider / model — not an odds market." },
        { title: "Per-team recent-form model", reason: "Needs a stat layer; this dashboard is odds-only today." },
      ],
    },
  ];
  return (
    <section aria-label="Coming soon" className="flex flex-col gap-4">
      <p className="text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)" }}>
        What&rsquo;s next for the soccer dashboard — an honest roadmap. Each of these is off until a real
        feed backs it; nothing here is estimated from team names.
      </p>
      {groups.map((g) => (
        <div key={g.group} className="flex flex-col gap-2">
          <Eyebrow>{g.group}</Eyebrow>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {g.items.map((it) => (
              <ComingSoonCard key={it.title} title={it.title} reason={it.reason} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Methodology explainer — sport-specific, honest, separates from the official record. */
export function MethodologyPanel({ sport }: { sport: "mlb" | "world_cup" }) {
  return (
    <section aria-label="How this is calculated" className="rounded-[12px] px-4 sm:px-5 py-4 flex flex-col gap-3" style={CARD}>
      <h3 className="font-mono uppercase tracking-[0.16em] m-0 font-normal" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
        How this is calculated
      </h3>
      {sport === "mlb" ? (
        <ul className="pl-4 flex flex-col gap-1.5 text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)", listStyle: "disc" }}>
          <li><strong style={{ color: "var(--vault-text)" }}>Player props</strong> come from a <strong>10,000-run</strong> seeded simulation of the published projections — the run count is read from the artifact, never hardcoded.</li>
          <li><strong style={{ color: "var(--vault-text)" }}>Game lines</strong> (moneyline, run line, total) are <strong>market-implied</strong>: de-vigged from the sportsbook&rsquo;s posted prices, not a separate prediction.</li>
          <li>Game-level run distributions aren&rsquo;t shown until the alternate-line ladders + tail-bin guard are built.</li>
          <li>None of this is part of the official <strong style={{ color: "var(--vault-text)" }}>19-14</strong> paper-card record — model performance is tracked separately.</li>
        </ul>
      ) : (
        <ul className="pl-4 flex flex-col gap-1.5 text-[12px] leading-relaxed m-0" style={{ color: "var(--vault-text-mute)", listStyle: "disc" }}>
          <li>This is a <strong style={{ color: "var(--vault-text)" }}>market-implied dashboard</strong> — every probability is <strong>de-vigged</strong> (no-vig) from the sportsbook&rsquo;s posted prices.</li>
          <li>It is <strong style={{ color: "var(--vault-text)" }}>not</strong> a sampled simulation and not an independent stat model — there is no run-based simulation engine for soccer yet.</li>
          <li><strong style={{ color: "var(--vault-text)" }}>90-minute regulation only</strong> — extra time and penalties do not count; a Draw is a real third outcome.</li>
          <li>None of this is part of the official <strong style={{ color: "var(--vault-text)" }}>19-14</strong> paper-card record.</li>
        </ul>
      )}
      <p className="text-[10.5px] m-0" style={{ color: "var(--vault-text-faint)" }}>Paper-only · educational · not betting advice.</p>
    </section>
  );
}
