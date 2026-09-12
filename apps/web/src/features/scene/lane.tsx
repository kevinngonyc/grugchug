import { useEffect, useRef } from "react";
import { useWorld } from "@/features/world";
import { LANE_SPACING } from "./constants";
import { createMotion, registerMotion, unregisterMotion } from "./motion";
import { Track } from "./track";
import { Train } from "./train";

type LaneProps = { trainId: string };

// One train's strip of world. Owns that train's motion state.
export function Lane({ trainId }: LaneProps) {
  const lane = useWorld((s) => s.trains[trainId]?.lane ?? 0);
  const motion = useRef(createMotion());

  useEffect(() => {
    registerMotion(trainId, motion.current);
    return () => unregisterMotion(trainId);
  }, [trainId]);

  return (
    <group position-z={-lane * LANE_SPACING}>
      <Track motion={motion} />
      <Train trainId={trainId} motion={motion} />
    </group>
  );
}
