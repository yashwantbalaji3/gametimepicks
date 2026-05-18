import SportSectionTabs from "@/components/sport-section-tabs";

/** Thin wrapper around the unified SportSectionTabs. Kept as a named
 *  module so existing imports across MLB pages don't need to change. */
export default function MlbSectionTabs() {
  return <SportSectionTabs sport="mlb" />;
}
