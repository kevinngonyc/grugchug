// Eases the camera between the normal train view and a close-up on the
// conductor when its study panel is open — the "zoom in" half of the
// click-the-conductor interaction (the panel sliding in is plain CSS, done
// in features/conductor). Reads the conductor's open flag directly each
// frame rather than subscribing to it, the same way Character reads speech
// off useWorld in its own useFrame: this component never needs to re-render.
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";
import { useConductorUi } from "@/features/conductor";
import {
  CAMERA_EASE,
  CAMERA_LOOK_AT,
  CAMERA_POSITION,
  CONDUCTOR_CAMERA_LOOK_AT,
  CONDUCTOR_CAMERA_POSITION,
} from "./constants";

const defaultPosition = new Vector3(...CAMERA_POSITION);
const defaultLookAt = new Vector3(...CAMERA_LOOK_AT);
const closeupPosition = new Vector3(...CONDUCTOR_CAMERA_POSITION);
const closeupLookAt = new Vector3(...CONDUCTOR_CAMERA_LOOK_AT);

export function ConductorCameraRig() {
  const lookAt = useRef(defaultLookAt.clone());

  useFrame(({ camera }, dt) => {
    const step = Math.min(dt, 0.1);
    const ease = Math.min(1, CAMERA_EASE * step);
    const open = useConductorUi.getState().open;

    camera.position.lerp(open ? closeupPosition : defaultPosition, ease);
    lookAt.current.lerp(open ? closeupLookAt : defaultLookAt, ease);
    camera.lookAt(lookAt.current);
  });

  return null;
}
