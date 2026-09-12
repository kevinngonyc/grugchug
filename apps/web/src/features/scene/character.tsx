import { Billboard, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { type Group, SRGBColorSpace, Vector3 } from "three";
import { useWorld } from "@/features/world";
import {
  BOB_AMPLITUDE,
  BOB_EASE,
  BOB_FREQUENCY,
  CHARACTER_OFFSET,
  CHARACTER_SIZE,
} from "./constants";
import { SpeechBubble } from "./speech-bubble";
import { updateVoicePosition } from "./voice-audio";

type CharacterProps = {
  url: string;
  position?: [number, number, number];
  // When set, this sprite speaks for that train: it bobs and shows a bubble
  // while the train has speech.
  trainId?: string;
};

// A hand-drawn 2D sprite that always faces the camera. Any PNG or SVG with
// width/height attributes works; swap the URL, not the code.
export function Character({ url, position = CHARACTER_OFFSET, trainId }: CharacterProps) {
  const speech = useWorld((s) => (trainId === undefined ? undefined : s.trains[trainId]?.speech));
  const texture = useTexture(url);
  // useTexture caches one Texture per URL, so this mutates a shared object on
  // every render. Safe only because the value is a constant; keep it that way.
  texture.colorSpace = SRGBColorSpace;

  const bob = useRef<Group>(null);
  const voicePosition = useRef(new Vector3());
  // Amplitude eases toward 1 while speaking and back to 0 after; the phase
  // only advances while there is amplitude, so the sprite settles instead of
  // snapping and every line starts from rest.
  const amplitude = useRef(0);
  const phase = useRef(0);

  useFrame((_, dt) => {
    if (trainId === undefined) return;
    const step = Math.min(dt, 0.1);
    const speaking = useWorld.getState().trains[trainId]?.speech !== undefined;
    const target = speaking ? 1 : 0;
    amplitude.current += (target - amplitude.current) * Math.min(1, BOB_EASE * step);
    if (amplitude.current < 0.001) {
      amplitude.current = 0;
      phase.current = 0;
    } else {
      phase.current += BOB_FREQUENCY * step;
    }
    if (bob.current) {
      // Bounce above the resting point, never down through the cab roof.
      bob.current.position.y =
        (amplitude.current * BOB_AMPLITUDE * (1 - Math.cos(phase.current))) / 2;
      bob.current.getWorldPosition(voicePosition.current);
      updateVoicePosition(trainId, voicePosition.current);
    }
  });

  return (
    <group position={position}>
      <group ref={bob}>
        <Billboard>
          <mesh>
            <planeGeometry args={CHARACTER_SIZE} />
            <meshBasicMaterial map={texture} transparent alphaTest={0.5} />
          </mesh>
        </Billboard>
        {speech ? <SpeechBubble key={speech.id} text={speech.text} /> : null}
      </group>
    </group>
  );
}
