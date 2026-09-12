import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { targetSpeed, useWorld } from "@/features/world";
import { LANE_SPACING } from "./constants";
import { createMotion, registerMotion, stepMotion, unregisterMotion } from "./motion";
import { Scenery } from "./scenery";
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

  useFrame((_, dt) => {
    const train = useWorld.getState().trains[trainId];
    if (!train) return;
    const cruise = targetSpeed({ phase: "running", efficiency: train.efficiency });
    stepMotion(motion.current, cruise, targetSpeed(train), Math.min(dt, 0.1));
  });

  return (
    <group position-z={-lane * LANE_SPACING}>
      <Track motion={motion} />
      <Scenery motion={motion} />
      <Train trainId={trainId} motion={motion} />
    </group>
  );
}
