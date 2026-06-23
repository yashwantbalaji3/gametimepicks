/**
 * /homer-nukes — the daily MLB home-run product: ONE 5-leg home-run parlay (flat $20/day), tracked
 * inside Mr. Dub alongside Bank Builder, Moonshot and World Cup Specials. Honest by construction: real
 * posted home-run props only, or a data-gated empty state. Server component; reads committed artifacts.
 */
import path from "node:path";
import Link from "next/link";

import PicksSurfaceHeader, { type PicksSurfaceStatus } from "@/components/picks-surface-header";
import HomerNukesBoard from "@/components/mlb/homer-nukes-board";
import { loadHomerNukes, HOMER_NUKES_STAKE } from "@/lib/mlb/homer-nukes";
import { currentEtDate } from "@/lib/freshness";
import { currentSlateDate } from "@/lib/parlays/ui-loader";

export const metadata = {
  title: "Homer Nukes · GameTime Picks",
  description:
    "Homer Nukes — one daily 5-leg MLB home-run parlay, a flat $20 paper stake tracked inside Mr. Dub. Educational, paper-only; real posted props only.",
};

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function HomerNukesPage() {
  const today = currentSlateDate() ?? currentEtDate();
  const board = loadHomerNukes(path.join(process.cwd(), "public", "data"), today);
  const status: PicksSurfaceStatus = board.available ? "pregame" : "data_pending";

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-12 overflow-x-hidden flex flex-col gap-6">
      <PicksSurfaceHeader
        eyebrow="Homer Nukes · MLB"
        title="Homer Nukes"
        status={status}
        counts={board.parlay ? { eligibleLegs: board.parlay.legs.length } : undefined}
        primaryAction={{ label: "Mr. Dub portfolio", href: "/mr-dub" }}
        secondaryAction={{ label: "MLB board", href: "/mlb" }}
        note={`One daily 5-leg MLB home-run parlay — a flat ${money(HOMER_NUKES_STAKE)} paper stake, tracked inside Mr. Dub. Real posted home-run props only; paper-only.`}
      />

      <HomerNukesBoard board={board} />

      <p className="text-center text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        A daily product, drawn from the single Mr. Dub bankroll.{" "}
        <Link href="/mr-dub" className="underline" style={{ color: "var(--vault-text-mute)" }}>See the full portfolio allocation →</Link>
      </p>
    </div>
  );
}
