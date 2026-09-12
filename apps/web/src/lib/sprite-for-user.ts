// A face for a rider who never picked an avatar. Pure and shared: session's
// party trains and chat's roster must agree on who looks like what, or the
// same person shows up as two different sprites depending on which screen
// you're reading.

// Every rider needs a face. Sprites are assigned from the userId rather than
// handed out in arrival order, so you look the same on your friend's screen as
// you do on your own.
export const PARTY_SPRITES = [
  "/characters/poku.png",
  "/characters/bonbon.png",
  "/characters/default.svg",
] as const;

export function spriteForUserId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) % 0x7fffffff;
  return PARTY_SPRITES[hash % PARTY_SPRITES.length] ?? PARTY_SPRITES[0];
}
