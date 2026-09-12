import { Billboard, useTexture } from "@react-three/drei";
import { SRGBColorSpace } from "three";
import { CHARACTER_OFFSET, CHARACTER_SIZE } from "./constants";

type CharacterProps = { url: string; position?: [number, number, number] };

// A hand-drawn 2D sprite that always faces the camera. Any PNG or SVG with
// width/height attributes works; swap the URL, not the code.
export function Character({ url, position = CHARACTER_OFFSET }: CharacterProps) {
  const texture = useTexture(url);
  // useTexture caches one Texture per URL, so this mutates a shared object on
  // every render. Safe only because the value is a constant; keep it that way.
  texture.colorSpace = SRGBColorSpace;
  return (
    <Billboard position={position}>
      <mesh>
        <planeGeometry args={CHARACTER_SIZE} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.5} />
      </mesh>
    </Billboard>
  );
}
