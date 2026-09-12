import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { targetSpeed, useWorld } from "@/features/world";
import {
  CAMERA_FOV,
  CAMERA_LOOK_AT,
  CAMERA_POSITION,
  SKY_COLOR,
  STATION_DISTANCE,
} from "./constants";
import { Hills } from "./hills";
import { Lane } from "./lane";
import { ALL_MODEL_URLS } from "./models";
import { createMotion, registerMotion, stepMotion, unregisterMotion } from "./motion";
import { useRegroup } from "./use-regroup";

for (const url of ALL_MODEL_URLS) useGLTF.preload(url);

export function TrainWorld() {
  return (
    <Canvas
      camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}
      onCreated={({ camera }) => camera.lookAt(...CAMERA_LOOK_AT)}
      dpr={[1, 1.5]}
    >
      <color attach="background" args={[SKY_COLOR]} />
      <fog attach="fog" args={[SKY_COLOR, 30, 70]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 15, 10]} intensity={1.4} />
      <Suspense fallback={null}>
        <TravellingWorld />
      </Suspense>
    </Canvas>
  );
}

// All lanes share the local train's travel so rails and scenery never slide
// against each other. Friends stay alongside regardless of efficiency.
function TravellingWorld() {
  const trainIds = useWorld(useShallow((s) => Object.keys(s.trains)));
  const leaderId = useWorld((s) => s.localTrainId ?? Object.keys(s.trains)[0]);
  const phase = useWorld((s) => (leaderId ? s.trains[leaderId]?.phase : undefined));
  const motion = useRef(createMotion());

  // Someone new is here: the whole world stops dead and winds back up from
  // nothing. Scroll is left alone — stations and scenery are placed against
  // it, and it is the shared clock every lane is measured from.
  useRegroup(
    useCallback(() => {
      motion.current.speed = 0;
    }, []),
  );

  useEffect(() => {
    if (!leaderId) return;
    registerMotion(leaderId, motion.current);
    return () => unregisterMotion(leaderId);
  }, [leaderId]);

  useEffect(() => {
    const m = motion.current;
    if (phase === "running" || phase === undefined) m.stopTarget = null;
    else if (m.stopTarget === null) {
      m.stopTarget = m.scroll + (m.speed < 0.01 ? 0 : STATION_DISTANCE);
    }
  }, [phase]);

  useFrame((_, dt) => {
    const train = leaderId ? useWorld.getState().trains[leaderId] : undefined;
    if (!train) return;
    stepMotion(
      motion.current,
      targetSpeed({ phase: "running", efficiency: train.efficiency }),
      targetSpeed(train),
      Math.min(dt, 0.1),
    );
  }, -1);

  return (
    <>
      <Hills />
      {trainIds.map((id) => (
        <Lane key={id} trainId={id} motion={motion} />
      ))}
    </>
  );
}
