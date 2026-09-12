import { PerformanceMonitor, Stats, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { targetSpeed, useWorld } from "@/features/world";
import { ConductorCameraRig } from "./conductor-camera";
import {
  CAMERA_FOV,
  CAMERA_LOOK_AT,
  CAMERA_POSITION,
  DPR_MAX,
  DPR_MIN,
  SKY_COLOR,
  STATION_DISTANCE,
} from "./constants";
import { Hills } from "./hills";
import { Lane } from "./lane";
import { ALL_MODEL_URLS } from "./models";
import { createMotion, registerMotion, stepMotion, unregisterMotion } from "./motion";
import { useRegroup } from "./use-regroup";
import { VoiceListener } from "./voice-listener";

for (const url of ALL_MODEL_URLS) useGLTF.preload(url);

type TrainWorldProps = {
  /** `/session?dev`: show the frame-rate panel over the scene. */
  debug?: boolean;
};

export function TrainWorld({ debug = false }: TrainWorldProps) {
  // Pixels are the one cost that scales with the window rather than with the
  // scene, so they are what gets given up first when frames start dropping.
  const [dpr, setDpr] = useState(DPR_MAX);

  return (
    <Canvas
      camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV }}
      onCreated={({ camera }) => camera.lookAt(...CAMERA_LOOK_AT)}
      dpr={dpr}
      gl={{ powerPreference: "high-performance" }}
    >
      {/* `flipflops` is the important part: a machine sitting right on the
          threshold would otherwise trade pixel ratios back and forth forever,
          and every swap reallocates the drawing buffer — a stutter of its own,
          caused by the thing meant to prevent stutters. After a few swaps it
          settles on the low setting and stops asking. */}
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setDpr(DPR_MIN)}
        onIncline={() => setDpr(DPR_MAX)}
        onFallback={() => setDpr(DPR_MIN)}
      />
      {debug ? <Stats /> : null}
      <VoiceListener />
      <ConductorCameraRig />
      <color attach="background" args={[SKY_COLOR]} />
      <fog attach="fog" args={[SKY_COLOR, 30, 70]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 15, -10]} intensity={1.4} />
      <Suspense fallback={null}>
        <TravellingWorld />
      </Suspense>
    </Canvas>
  );
}

// All lanes share the local train's travel so rails and scenery never slide
// against each other. Friend trains move relative to this shared world.
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
    const world = useWorld.getState();
    const train = leaderId ? world.trains[leaderId] : undefined;
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
