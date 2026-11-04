import LaneCard, { type LaneView } from "@/components/challenge-lanes/lane-card";

/* A product's two independent challenge lanes, A and B side by side (stacked on a phone), as on the X graphics. */
export default function LanePair({ product, lanes, lead = false }: { product: "bank-builder" | "moonshot"; lanes: LaneView[]; lead?: boolean }) {
  const moon = product === "moonshot";
  const name = moon ? "Moonshot" : "Bank Builder";
  const goal = lanes[0] ? `${lanes[0].base} to ${lanes[0].target} in ${lanes[0].steps} steps` : "";
  return (
    <section id="challenge-lanes" className="cl-section scroll-mt-24" aria-labelledby="challenge-lanes-h" data-lane-pair={product}>
      {/* LEAD (founder 2026-11-04 cleanup): the lanes open the page under one plain header, "BANK BUILDER — $100 TO $10,000". */}
      {lead ? (
        <h1 id="challenge-lanes-h" className={`cl-lead-title${moon ? " cl-lead-title--moonshot" : ""}`}>
          {name.toUpperCase()}{lanes[0] ? <> — <span className="cl-lead-range">{lanes[0].base} TO {lanes[0].target}</span></> : null}
        </h1>
      ) : (
        <div className="tb-section-head">
          <h2 id="challenge-lanes-h" className="tb-section-title">The {name} challenge · lanes A and B</h2>
        </div>
      )}
      <p className="cl-intro">
        Two independent lanes, each {goal}. Every step is one frozen card; only a settled win moves a lane up, and one
        lane&rsquo;s result never moves the other. Odds come from an eligible sportsbook at the capture time shown.
      </p>
      <div className="cl-pair">
        {lanes.map((l) => <LaneCard key={l.laneId} lane={l} />)}
      </div>
    </section>
  );
}
