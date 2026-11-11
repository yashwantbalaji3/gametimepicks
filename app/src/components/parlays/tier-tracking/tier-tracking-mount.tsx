/** /build's mount for tier performance: loads its stylesheet and the shared drawer styles (tests render TierTracking directly). */
import TierTracking, { type RecentCard } from "./tier-tracking";
import "@/components/trends/trends.css";
import "./tier-tracking.css";

export default function TierTrackingMount(props: { model: Parameters<typeof TierTracking>[0]["model"]; recent: RecentCard[] }) {
  return <TierTracking {...props} />;
}
