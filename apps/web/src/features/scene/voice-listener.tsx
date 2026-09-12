import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";
import { updateVoiceListener } from "./voice-audio";

export function VoiceListener() {
  const position = useRef(new Vector3());
  const forward = useRef(new Vector3());
  const up = useRef(new Vector3());
  useFrame(({ camera }) => {
    camera.getWorldPosition(position.current);
    camera.getWorldDirection(forward.current);
    up.current.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    updateVoiceListener(position.current, forward.current, up.current);
  });
  return null;
}
