import { Billboard, useCursor, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { type Group, type Mesh, SRGBColorSpace, Vector3 } from "three";
import { useConductorUi } from "@/features/conductor";
import { useWorld } from "@/features/world";
import {
  BOB_AMPLITUDE,
  BOB_EASE,
  BOB_FREQUENCY,
  CHARACTER_OFFSET,
  CHARACTER_SIZE,
  HOVER_SCALE,
  IDLE_BOB_FRACTION,
  IDLE_BOB_FREQUENCY,
} from "./constants";
import { SpeechBubble } from "./speech-bubble";
import { StationTimerLabel } from "./station-timer-label";
import { updateVoicePosition } from "./voice-audio";

type CharacterProps = {
  url: string;
  position?: [number, number, number];
  // When set, this sprite speaks for that train: it bobs harder and shows a
  // bubble while the train has speech.
  trainId?: string;
  // When set, the sprite is clickable and shows a pointer cursor on hover —
  // local conductors and passengers open their respective panels.
  onClick?: () => void;
  // Local conductor only: live study countdown above the sprite.
  showTimer?: boolean;
};

// A hand-drawn 2D sprite that always faces the camera. Any PNG or SVG with
// width/height attributes works; swap the URL, not the code.
export function Character({
  url,
  position = CHARACTER_OFFSET,
  trainId,
  onClick,
  showTimer,
}: CharacterProps) {
  const speech = useWorld((s) => (trainId === undefined ? undefined : s.trains[trainId]?.speech));
  // Zoomed in, the conductor is the subject of the shot rather than a thing
  // to discover: no pointer, no grow. Passengers remain selectable.
  const zoomed = useConductorUi((s) => s.open);
  const [hovered, setHovered] = useState(false);
  const hoverable = onClick !== undefined && !(showTimer && zoomed);
  useCursor(hovered && hoverable);
  const texture = useTexture(url);
  // useTexture caches one Texture per URL, so this mutates a shared object on
  // every render. Safe only because the value is a constant; keep it that way.
  texture.colorSpace = SRGBColorSpace;

  const bob = useRef<Group>(null);
  const sprite = useRef<Mesh>(null);
  const voicePosition = useRef(new Vector3());
  // Amplitude eases toward 1 while speaking and back to the idle fraction
  // after, so a line starts and settles instead of snapping. The phase always
  // advances — a still sprite reads as a frozen one — and starts somewhere
  // random so two characters never bob in lockstep.
  const amplitude = useRef(IDLE_BOB_FRACTION);
  const phase = useRef(Math.random() * Math.PI * 2);
  const scale = useRef(1);

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.1);
    const speaking =
      trainId !== undefined && useWorld.getState().trains[trainId]?.speech !== undefined;
    const ease = Math.min(1, BOB_EASE * step);

    amplitude.current += ((speaking ? 1 : IDLE_BOB_FRACTION) - amplitude.current) * ease;
    phase.current += (speaking ? BOB_FREQUENCY : IDLE_BOB_FREQUENCY) * step;

    if (bob.current) {
      // Bounce above the resting point, never down through the cab roof.
      bob.current.position.y =
        (amplitude.current * BOB_AMPLITUDE * (1 - Math.cos(phase.current))) / 2;
      if (trainId !== undefined) {
        bob.current.getWorldPosition(voicePosition.current);
        updateVoicePosition(trainId, voicePosition.current);
      }
    }

    const targetScale = hovered && hoverable ? HOVER_SCALE : 1;
    scale.current += (targetScale - scale.current) * ease;
    sprite.current?.scale.setScalar(scale.current);
  });

  return (
    <group position={position}>
      <group ref={bob}>
        <Billboard>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: this is a react-three-fiber <mesh>, a 3D object in the Canvas, not an HTML element */}
          <mesh
            ref={sprite}
            onClick={
              onClick
                ? (event) => {
                    event.stopPropagation();
                    onClick();
                  }
                : undefined
            }
            onPointerOver={onClick ? () => setHovered(true) : undefined}
            onPointerOut={onClick ? () => setHovered(false) : undefined}
          >
            <planeGeometry args={CHARACTER_SIZE} />
            <meshBasicMaterial map={texture} transparent alphaTest={0.5} />
          </mesh>
        </Billboard>
        {speech ? <SpeechBubble key={speech.id} text={speech.text} /> : null}
      </group>
      {/* Outside the bob: an <Html> label under a group that moves every frame
          is re-projected and re-positioned in the DOM every frame too. */}
      {showTimer ? <StationTimerLabel /> : null}
    </group>
  );
}
