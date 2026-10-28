/** /data/social/nba/v1/<YYYY-MM-DD>.json — one NBA slate in the gtp-social-nba@1 contract (lib/social/nba-social.mjs). */
import { nbaSocialDates, nbaSocialDay } from "@/lib/social/nba-social-data";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return nbaSocialDates().map((d) => ({ day: `${d}.json` }));
}

export function GET(_req: Request, { params }: { params: { day: string } }) {
  const date = String(params.day).replace(/\.json$/, "");
  const day = nbaSocialDay(date);
  return day ? Response.json(day) : new Response("not found", { status: 404 });
}
