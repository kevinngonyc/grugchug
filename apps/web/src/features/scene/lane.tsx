import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useWorld } from "@/features/world";
import { LANE_SPACING, STATION_DISTANCE, VISIBLE_HALF_WIDTH } from "./constants";
import { getMotion, type LaneMotion } from "./motion";
import { Scenery } from "./scenery";
import { Station } from "./station";
import { Track } from "./track";
import { Train } from "./train";

type LaneProps = { trainId: string; motion: RefObject<LaneMotion> };

type StationSpot = { id: number; worldX: number; terminus: boolean };

// One train's strip of world. Every lane scrolls with the shared motion of the
// local train, so friends stay in line, but each lane spawns its own stations
// from its own train's phase: the local train's stop lives in the shared lane
// motion (train-world.tsx owns that), while a companion's stop lives in its
// own motion, read here from the registry train.tsx populates.
export function Lane({ trainId, motion }: LaneProps) {
  const lane = useWorld((s) => s.trains[trainId]?.lane ?? 0);
  const phase = useWorld((s) => s.trains[trainId]?.phase);
  const isLocal = useWorld((s) => s.localTrainId === trainId);
  const [stations, setStations] = useState<StationSpot[]>([]);
  const nextStationId = useRef(0);
  const pendingStation = useRef(false);

  // A phase change on this lane's train is what creates a station. The local
  // train's stopTarget is owned by train-world.tsx, so this effect only reads
  // the shared lane motion for it; a companion's motion comes from the
  // registry, where train.tsx registered it, and this effect is the only
  // thing that sets its stopTarget.
  useEffect(() => {
    const m = isLocal ? motion.current : getMotion(trainId);
    if (!m) return;
    if (phase === "running" || phase === undefined) {
      if (!isLocal) m.stopTarget = null;
      pendingStation.current = false;
      return;
    }
    const terminus = phase === "finished";
    if (pendingStation.current) {
      // A stop is already pending or the train is resting at it: only the
      // newest station's role changes, older departing stations are untouched.
      setStations((list) => list.map((s, i) => (i === list.length - 1 ? { ...s, terminus } : s)));
      return;
    }
    // A train that is already standing still gets its station right here.
    const distance = m.speed < 0.01 ? 0 : STATION_DISTANCE;
    const target = m.scroll + distance;
    if (!isLocal) m.stopTarget = target;
    pendingStation.current = true;
    const id = nextStationId.current++;
    setStations((list) => [...list, { id, worldX: target, terminus }]);
  }, [phase, motion, isLocal, trainId]);

  useFrame(() => {
    const scroll = motion.current.scroll;
    if (stations.some((s) => s.worldX - scroll < -VISIBLE_HALF_WIDTH)) {
      setStations((list) => list.filter((s) => s.worldX - scroll >= -VISIBLE_HALF_WIDTH));
    }
  });

  const stationXs = stations.map((s) => s.worldX);

  return (
    <group position-z={lane * LANE_SPACING}>
      <Track motion={motion} />
      <Scenery motion={motion} stationXs={stationXs} />
      {stations.map((s) => (
        <Station key={s.id} motion={motion} worldX={s.worldX} terminus={s.terminus} />
      ))}
      <Train trainId={trainId} motion={motion} />
    </group>
  );
}
