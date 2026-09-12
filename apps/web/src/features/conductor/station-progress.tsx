// "Station N/6" plus a segmented timeline, each segment sized by that
// station's estimatedMinutes, so the learner can see how far through the
// route they are and roughly how much of it is left — not just a countdown
// with no sense of the whole trip.
import type { PublicRoutePlan } from "@grugchug/shared";

export function StationProgress({
  plan,
  stationIndex,
}: {
  plan: PublicRoutePlan;
  stationIndex: number;
}) {
  const totalMinutes = plan.stations.reduce((sum, s) => sum + s.estimatedMinutes, 0) || 1;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        Station {stationIndex + 1} of {plan.stations.length}
      </p>
      <div className="flex h-1.5 gap-0.5">
        {plan.stations.map((station, i) => (
          <div
            key={station.id}
            className={`h-full rounded-full ${
              i === stationIndex ? "bg-primary" : i < stationIndex ? "bg-primary/40" : "bg-muted"
            }`}
            style={{ width: `${(station.estimatedMinutes / totalMinutes) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
