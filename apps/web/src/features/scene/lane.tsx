import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { targetSpeed, useWorld } from "@/features/world";
import { LANE_SPACING, STATION_DISTANCE, VISIBLE_HALF_WIDTH } from "./constants";
import { createMotion, registerMotion, stepMotion, unregisterMotion } from "./motion";
import { Scenery } from "./scenery";
import { Station } from "./station";
import { Track } from "./track";
import { Train } from "./train";

type LaneProps = { trainId: string };

type StationSpot = { worldX: number; terminus: boolean };

// One train's strip of world. Owns that train's motion state and decides
// when a station exists.
export function Lane({ trainId }: LaneProps) {
  const lane = useWorld((s) => s.trains[trainId]?.lane ?? 0);
  const phase = useWorld((s) => s.trains[trainId]?.phase);
  const motion = useRef(createMotion());
  const [station, setStation] = useState<StationSpot | null>(null);

  useEffect(() => {
    registerMotion(trainId, motion.current);
    return () => unregisterMotion(trainId);
  }, [trainId]);

  // Phase changes are the only thing that creates or releases a stop target.
  useEffect(() => {
    const m = motion.current;
    if (phase === "running" || phase === undefined) {
      m.stopTarget = null;
      return;
    }
    const terminus = phase === "finished";
    if (m.stopTarget !== null) {
      setStation((s) => (s ? { ...s, terminus } : s));
      return;
    }
    // A train that is already standing still gets its station right here.
    const distance = m.speed < 0.01 ? 0 : STATION_DISTANCE;
    m.stopTarget = m.scroll + distance;
    setStation({ worldX: m.stopTarget, terminus });
  }, [phase]);

  useFrame((_, dt) => {
    const train = useWorld.getState().trains[trainId];
    if (!train) return;
    const cruise = targetSpeed({ phase: "running", efficiency: train.efficiency });
    stepMotion(motion.current, cruise, targetSpeed(train), Math.min(dt, 0.1));
    if (station && station.worldX - motion.current.scroll < -VISIBLE_HALF_WIDTH) {
      setStation(null);
    }
  });

  return (
    <group position-z={-lane * LANE_SPACING}>
      <Track motion={motion} />
      <Scenery motion={motion} />
      {station ? (
        <Station motion={motion} worldX={station.worldX} terminus={station.terminus} />
      ) : null}
      <Train trainId={trainId} motion={motion} />
    </group>
  );
}
