import LaneCard, { type LaneView } from "@/components/challenge-lanes/lane-card";

/* A product's two independent challenge lanes, A and B side by side (stacked on a phone), as on the X graphics. */
export default function LanePair({ product, lanes }: { product: "bank-builder" | "moonshot"; lanes: LaneView[] }) {
  const moon = product === "moonshot";
  const name = moon ? "Moonshot" : "Bank Builder";
  const goal = lanes[0] ? `${lanes[0].base} to ${lanes[0].target} in ${lanes[0].steps} steps` : "";
  return (
    <section id="challenge-lanes" className="cl-section scroll-mt-24" aria-labelledby="challenge-lanes-h" data-lane-pair={product}>
      <div className="tb-section-head">
        <h2 id="challenge-lanes-h" className="tb-section-title">The {name} challenge · lanes A and B</h2>
      </div>
      <p className="cl-intro">
        Two independent lanes, each {goal}. Every step is one frozen card, and only a settled win moves a lane up; one
        lane&rsquo;s result never moves the other. Payouts show once prices are verified.
      </p>
      <div className="cl-pair">
        {lanes.map((l) => <LaneCard key={l.laneId} lane={l} />)}
      </div>
    </section>
  );
}
