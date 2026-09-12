import { Billboard, useTexture } from "@react-three/drei";
import { SRGBColorSpace } from "three";
import { CHARACTER_OFFSET, CHARACTER_SIZE } from "./constants";

type CharacterProps = { url: string };

// A hand-drawn 2D sprite that always faces the camera. Any PNG or SVG with
// width/height attributes works; swap the URL, not the code.
export function Character({ url }: CharacterProps) {
  const texture = useTexture(url);
  texture.colorSpace = SRGBColorSpace;
  return (
    <Billboard position={CHARACTER_OFFSET}>
      <mesh>
        <planeGeometry args={CHARACTER_SIZE} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.5} />
      </mesh>
    </Billboard>
  );
}
