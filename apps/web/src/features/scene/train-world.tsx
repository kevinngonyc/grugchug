import { useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { useShallow } from "zustand/react/shallow";
import { useWorld } from "@/features/world";
import { CAMERA_FOV, CAMERA_LOOK_AT, CAMERA_POSITION, SKY_COLOR } from "./constants";
import { Hills } from "./hills";
import { Lane } from "./lane";
import { ALL_MODEL_URLS } from "./models";

for (const url of ALL_MODEL_URLS) useGLTF.preload(url);

export function TrainWorld() {
  const trainIds = useWorld(useShallow((s) => Object.keys(s.trains)));
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
        <Hills />
        {trainIds.map((id) => (
          <Lane key={id} trainId={id} />
        ))}
      </Suspense>
    </Canvas>
  );
}
