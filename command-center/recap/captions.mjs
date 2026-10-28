/**
 * TEMPLATE CAPTIONS — the fake editorial seat for the NFL recap.
 *
 * Two variants (factual, narrative) assembled only from claim display strings, so they pass the validator by
 * construction — and the validator still runs, because the same check must hold for any future seat. Wins and
 * misses use the same plain register: a miss is called a miss, a win is not called a lock.
 */
import { digestOf } from "../lib/util.mjs";
import { display, claimOf } from "./fact-bundle-nfl.mjs";

export function templateCaptions(bundle, factBundleDigest) {
  const { home, away } = bundle.teams;
  const fav = bundle.favouredSide === "home" ? home : away;
  const other = bundle.favouredSide === "home" ? away : home;
  const result = claimOf(bundle, "result.side").value;
  const totalInside = claimOf(bundle, "result.totalInsideRange").value;
  const finalLine = `${home.nickname} ${display(bundle, "final.home")}, ${away.nickname} ${display(bundle, "final.away")}`;
  const projLine = `${display(bundle, "projected.home")}–${display(bundle, "projected.away")}`;
  const p = display(bundle, "favoured.winProbability");
  const frozen = display(bundle, "frozenAt");
  const total = display(bundle, "projected.total");
  const totalFinal = display(bundle, "final.total");

  const sideSentence =
    result === "WIN" ? `${fav.nickname} won.`
    : result === "LOSS" ? `That forecast missed: the ${other.nickname} won.`
    : "The game ended in a tie.";
  const totalSentence = totalInside
    ? `Total: ${total} projected, ${totalFinal} scored.`
    : `Total missed: ${total} projected, ${totalFinal} scored.`;

  const factual = [
    `Final: ${finalLine}.`,
    `Our pregame forecast (frozen ${frozen}) had the ${fav.nickname} at ${p} to win and projected ${home.abbr} ${projLine.split("–")[0]}, ${away.abbr} ${projLine.split("–")[1]}.`,
    sideSentence,
    totalSentence,
    "Not betting advice.",
  ].join(" ");

  const narrative = [
    `${finalLine}.`,
    result === "WIN"
      ? `Before kickoff our model made the ${fav.nickname} a ${p} favourite: right side.`
      : result === "LOSS"
        ? `Before kickoff our model made the ${fav.nickname} a ${p} favourite. We missed this one.`
        : `Before kickoff our model made the ${fav.nickname} a ${p} favourite; it finished level.`,
    totalInside
      ? `The total landed in range: ${total} forecast, ${totalFinal} scored.`
      : `The total was another story: we forecast ${total} points and got ${totalFinal}.`,
    "Every forecast is frozen before kickoff and graded in public.",
  ].join(" ");

  const variants = [
    { id: "A", tone: "factual", text: factual },
    { id: "B", tone: "narrative", text: narrative },
  ];
  const set = { schema: "gtp.cc.caption-set@1", seat: "fake", provider: "fake", simulated: true, factBundleDigest, variants };
  return { captionSet: set, digest: digestOf(set) };
}
