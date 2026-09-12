import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, Suspense, useCallback, useEffect, useRef } from "react";
import type { Group, Object3D } from "three";
import { targetSpeed, useWorld } from "@/features/world";
import { Character } from "./character";
import {
  CARRIAGE_GAP,
  CONDUCTOR_OFFSET,
  CONDUCTOR_SPRITE_URL,
  KIT_ROTATION_Y,
  TRAIN_Y,
  WHEEL_RADIUS,
} from "./constants";
import { DriftMarker } from "./drift-marker";
import { MODELS } from "./models";
import { createMotion, driftClosing, driftGap, type LaneMotion, stepMotion } from "./motion";
import { Smoke } from "./smoke";
import { useRegroup } from "./use-regroup";

type TrainProps = { trainId: string; motion: RefObject<LaneMotion> };

// Locomotive at the lane origin, one carriage behind it. Faces +x. Only the
// individual "wheel" nodes spin about local x; the "wheels-*" nodes are whole
// bogies (two axles and a frame in one mesh) and would tumble if rotated.
//
// Every lane scrolls with the local train, which is what keeps the rails and
// scenery in step across the whole world. A friend's train runs at its own
// speed on top of that, so someone studying harder than you pulls ahead along
// the track and someone drifting falls behind — one world, different places
// in it. Wheels and smoke follow whichever speed is actually this train's.
export function Train({ trainId, motion }: TrainProps) {
  const spriteUrl = useWorld((s) => s.trains[trainId]?.owner.spriteUrl);
  const isLocal = useWorld((s) => s.localTrainId === trainId);
  const locomotive = useGLTF(MODELS.locomotive);
  const carriage = useGLTF(MODELS.carriage);
  const root = useRef<Group>(null);
  // Everything that rides: the marker stays behind in `root` so the drift does
  // not carry it off screen too.
  const body = useRef<Group>(null);
  const wheels = useRef<Object3D[]>([]);

  // A companion train's own motion. Unused for the local train, which is the
  // lane. `synced` is false until it has been placed alongside, so a train
  // that arrives mid-session starts level rather than at the origin — and a
  // regroup clears it again, which is how an arrival re-levels the whole line.
  const own = useRef<LaneMotion>(createMotion());
  const synced = useRef(false);
  const source = isLocal ? motion : own;
  // Metres ahead or behind the local train. Read by DriftMarker on its own
  // frame, so coming and going costs no re-renders.
  const gap = useRef(0);

  // A new arrival is a fresh start: everyone stops and everyone is level
  // again, rather than the newcomer meeting a line that is already strung out
  // over a kilometre. Re-placing is what the sync below already does, so this
  // only has to ask for it. Nothing pops — a train far enough out for the
  // reset to matter is off screen while it happens.
  useRegroup(
    useCallback(() => {
      synced.current = false;
    }, []),
  );

  useEffect(() => {
    const found: Object3D[] = [];
    root.current?.traverse((o) => {
      if (/^wheel(?:_\d+)?$/.test(o.name)) found.push(o);
    });
    wheels.current = found;
  }, []);

  useFrame((_, dt) => {
    const lane = motion.current;
    const step = Math.min(dt, 0.1);

    if (!isLocal) {
      const train = useWorld.getState().trains[trainId];
      if (train) {
        // Level with the lane and matching its speed: true when this train
        // first appears, and again whenever a regroup asks for it.
        if (!synced.current) {
          own.current.scroll = lane.scroll;
          own.current.speed = lane.speed;
          synced.current = true;
        }
        const cruise = targetSpeed({ phase: "running", efficiency: train.efficiency });
        stepMotion(own.current, cruise, targetSpeed(train), step);

        // Folded back into this train's own scroll rather than kept as a
        // correction, so there is still only one number saying where it is.
        const drifted = driftGap(own.current, lane.scroll);
        const closed = drifted - driftClosing(drifted, own.current.speed - lane.speed, step);
        own.current.scroll = lane.scroll + closed;

        gap.current = closed;
        if (body.current) body.current.position.x = closed;
      }
    }

    const spin = (source.current.speed * dt) / WHEEL_RADIUS;
    for (const w of wheels.current) w.rotation.x += spin;
  });

  return (
    <group ref={root} position-y={TRAIN_Y}>
      <group ref={body}>
        <group rotation-y={KIT_ROTATION_Y}>
          <Clone object={locomotive.scene} />
        </group>
        <group position-x={-CARRIAGE_GAP} rotation-y={KIT_ROTATION_Y}>
          <Clone object={carriage.scene} />
        </group>
        <Smoke motion={source} />
        <Suspense fallback={null}>
          <Character url={CONDUCTOR_SPRITE_URL} position={CONDUCTOR_OFFSET} trainId={trainId} />
        </Suspense>
        {spriteUrl ? (
          <Suspense fallback={null}>
            <Character url={spriteUrl} />
          </Suspense>
        ) : null}
      </group>
      {isLocal ? null : <DriftMarker gap={gap} />}
    </group>
  );
}
