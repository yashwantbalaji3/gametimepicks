import { notFound } from "next/navigation";
import { legalReadiness } from "./texts.mjs";

/**
 * A legal page exists in the public build only once it may publish (texts.mjs · legalReadiness).
 * Until then it is a 404 in production — the same exclusion internal routes use — and visible, with a
 * "draft, not in effect" banner, only in an internal review build (NEXT_PUBLIC_INTERNAL_ROUTES=1).
 * prune-internal-routes.mjs removes the shipped files too, so the gate holds at both layers.
 */
export function guardLegalRoute(id: "terms" | "privacy"): { publishable: boolean; reasons: string[] } {
  const r = legalReadiness(id);
  const reviewBuild = process.env.NEXT_PUBLIC_INTERNAL_ROUTES === "1";
  if (process.env.NODE_ENV === "production" && !r.publishable && !reviewBuild) notFound();
  return { publishable: r.publishable, reasons: r.reasons };
}
