export default function ResponsibleUsePage() {
  return (
    <div className="mx-auto max-w-[760px] px-6 py-12">
      <div className="reveal">
        <div className="eyebrow">responsible use</div>
        <h1 className="mt-2 font-display text-[36px] md:text-[48px] tracking-tightest font-semibold leading-[1]">
          Read this before anything else.
        </h1>
        <p className="mt-3 text-[var(--text-mute)] text-[15px] leading-relaxed">
          GametimePicks exists to demonstrate analytical methodology. It is not a
          tipster service, not a betting advisory, and not a financial product.
        </p>
      </div>

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
          title="No parlays in v1"
          body="The model board surfaces single-prop leans only. No parlays, no same-game-parlays, no multi-leg products. Parlay variance is a separate problem that requires its own modeling work."
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
  return (
    <div className="surface p-5 reveal flex gap-4">
      <div
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-[14px]"
        style={{ background: "var(--vault-warn-dim)", color: "var(--vault-warn)" }}
      >
        {icon}
      </div>
      <div>
        <h3 className="font-display text-[18px] font-semibold tracking-tight text-[var(--text)] mb-1.5">
          {title}
        </h3>
        <p className="leading-relaxed">{body}</p>
        {links && links.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3 text-[13px] font-mono">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target={l.external ? "_blank" : undefined}
                rel={l.external ? "noopener" : undefined}
                className="text-[var(--vault-gold-bright)] hover:underline"
              >
                {l.label} {l.external && "↗"}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
