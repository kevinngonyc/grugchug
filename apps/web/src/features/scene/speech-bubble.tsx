import { Html } from "@react-three/drei";
import { BUBBLE_DISTANCE_FACTOR, BUBBLE_OFFSET } from "./constants";

type SpeechBubbleProps = { text: string };

// A DOM bubble pinned above the conductor. drei projects it to the screen each
// frame, so it follows the train, the lane depth, and the bob. `center` puts
// the element's centre on the anchor; the translate lifts it so the tail sits
// on the anchor instead.
export function SpeechBubble({ text }: SpeechBubbleProps) {
  return (
    <Html
      position={BUBBLE_OFFSET}
      center
      distanceFactor={BUBBLE_DISTANCE_FACTOR}
      zIndexRange={[10, 0]}
      pointerEvents="none"
    >
      <div className="relative w-max max-w-56 -translate-y-1/2 animate-in rounded-2xl border bg-background px-3 py-2 text-sm text-foreground shadow fade-in zoom-in-75 duration-200">
        {text}
        <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-r border-b bg-background" />
      </div>
    </Html>
  );
}
