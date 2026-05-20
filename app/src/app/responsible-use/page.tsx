import SportOverviewHero from "@/components/sport-overview-hero";

export default function ResponsibleUsePage() {
  return (
    <div className="mx-auto max-w-[760px] px-4 sm:px-6 py-10">
      <SportOverviewHero
        eyebrow="Responsible use · educational only"
        sport="Read this first."
        tagline="not a tipster · not a betting advisory"
        statusKind="warn"
        statusLabel="Reference"
        accent="gold"
        ctas={[
          { href: "/methodology", label: "How the model works", primary: true },
          { href: "/results", label: "Latest audit" },
        ]}
        framing="GameTimePicks exists to demonstrate analytical methodology. It is not a tipster service, not a betting advisory, and not a financial product."
      />

      <div className="mt-10 space-y-6 text-[15px] text-[var(--text-mute)] leading-relaxed">
        <Block
          icon="!"
          title="Not betting advice"
          body="Nothing on this site is a recommendation to wager money. Model leans are educational outputs of a transparent analytical pipeline. Past hit rates do not predict future results."
        />
        <Block
          icon="!"
          title="No guarantees"
          body="No model is profitable on every market or every day. The site exists to show the methodology, not to sell certainty. Expect variance. Some leans will lose."
        />
        <Block
          icon="!"
          title="Lines move"
          body="Sportsbook lines and odds change continuously. The model board is generated at a single point in time, shown alongside its timestamp. By the time you read it, the underlying odds may have shifted."
        />
        <Block
          icon="!"
          title="Educational use only"
          body="GametimePicks is an educational analytics project. It does not sell tips, does not operate any paid community, and does not collect payment of any kind. There are no affiliate links to sportsbooks. If you ever see commercial messaging on this domain, assume the site has been compromised."
        />
        <Block
          icon="!"
          title="If betting affects your life"
          body="If gambling is harming you or someone you know, help is free and available 24/7."
          links={[
            { label: "1-800-GAMBLER (US)", href: "tel:1-800-426-2537" },
            { label: "ncpgambling.org", href: "https://www.ncpgambling.org/", external: true },
          ]}
        />
        <Block
          icon="!"
          title="Age restrictions"
          body="Sports wagering is restricted to legal-age adults in jurisdictions where it is permitted. This site is published in the United States; users under 21 should not engage with sportsbook products. Always verify the laws of your jurisdiction."
        />
        <Block
          icon="!"
          title="No automated betting"
          body="GametimePicks does not automate wagers. There is no bet-placement integration, no API hand-off to sportsbooks, and no wallet connectivity. The model board is a research artifact — manual decisions only."
        />
        <Block
          icon="!"
          title="Follow local laws"
          body="Sports wagering legality varies by state, country, and platform. It is your responsibility to comply with the laws where you live. This project takes no position on whether wagering is legal in your jurisdiction."
        />
        <Block
          icon="!"
          title="Parlay Lab is educational analysis"
          body="The Parlay Lab takes parlay slips you've already built on a sportsbook and compares each leg against the model. It's an educational analysis tool — it does NOT recommend wagers, NOT guarantee outcomes, and NOT scrape sportsbook pages. Same-game legs are explicitly flagged as correlated, and parlay variance is high. Use it to inspect, not to bet."
        />
      </div>
    </div>
  );
}

function Block({
  icon,
  title,
  body,
  links,
}: {
  icon: string;
  title: string;
  body: string;
  links?: Array<{ label: string; href: string; external?: boolean }>;
}) {
  // Iteration 5: deluxe-card surface — but intentionally NO
  // casino-glow rim or hover lift. The page stays calm and serious; we
  // just want a real premium panel instead of a flat .surface box. The
  // helpline block (links present) gets a slightly stronger warn-tone
  // accent on the icon so it visually anchors as the support row.
  const hasLinks = links && links.length > 0;
  return (
    <div className="vault-deluxe-card p-5 sm:p-6 reveal flex gap-4">
      <div
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-[14px]"
        style={{
          background: hasLinks
            ? "var(--vault-warn-dim)"
            : "rgba(240, 199, 94, 0.08)",
          color: "var(--vault-warn)",
          border: `1px solid ${
            hasLinks
              ? "rgba(240, 199, 94, 0.35)"
              : "rgba(240, 199, 94, 0.18)"
          }`,
        }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0">
        <h3
          className="font-display text-[17px] sm:text-[18px] font-semibold tracking-tight mb-1.5"
          style={{ color: "var(--vault-text)" }}
        >
          {title}
        </h3>
        <p
          className="leading-relaxed text-[14px] sm:text-[15px]"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {body}
        </p>
        {hasLinks && (
          <div className="mt-4 flex flex-wrap gap-2">
            {links!.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target={l.external ? "_blank" : undefined}
                rel={l.external ? "noopener" : undefined}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-[13px] transition-colors"
                style={{
                  background: "var(--vault-warn-dim)",
                  border: "1px solid rgba(240, 199, 94, 0.35)",
                  color: "var(--vault-warn)",
                  textDecoration: "none",
                }}
              >
                <span style={{ fontWeight: 500 }}>{l.label}</span>
                {l.external && (
                  <span aria-hidden style={{ opacity: 0.7 }}>
                    ↗
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
