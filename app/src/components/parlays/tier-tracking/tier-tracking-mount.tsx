/** /build's mount for tier performance: loads its stylesheet (tests render TierTracking directly). */
import TierTracking, { type RecentCard } from "./tier-tracking";
import "./tier-tracking.css";

export default function TierTrackingMount(props: { model: Parameters<typeof TierTracking>[0]["model"]; recent: RecentCard[] }) {
  return <TierTracking {...props} />;
}
