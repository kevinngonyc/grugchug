import {
  type AvatarId,
  avatarIdSchema,
  type TrainOwner,
  type User,
  type UserProfile,
} from "@grugchug/shared";

export type Avatar = { id: AvatarId; name: string; url: string };

const NAMES: Record<AvatarId, string> = {
  conductor: "Conductor",
  bonbon: "Bonbon",
  poku: "Poku",
  cat: "Cat",
  doug: "Doug",
  bbob: "Bbob",
  bilby: "Bilby",
};

export function avatarUrl(id: AvatarId): string {
  return `/characters/${id}.png`;
}

// Every drawing the picker offers, in enum order.
export const AVATARS: Avatar[] = avatarIdSchema.options.map((id) => ({
  id,
  name: NAMES[id],
  url: avatarUrl(id),
}));

// What a fresh browser gets before it picks anything.
export const DEFAULT_PROFILE: UserProfile = { name: "You", avatar: "poku" };

// The avatar a rider wears until their profile says otherwise.
export const DEFAULT_AVATAR: AvatarId = DEFAULT_PROFILE.avatar;

// The train owner a profile turns into. Null (not loaded, or API down) rides
// with the default so a session is never blocked on the network.
export function profileOwner(user: User | null): TrainOwner {
  const profile = user ?? DEFAULT_PROFILE;
  return { name: profile.name, spriteUrl: avatarUrl(profile.avatar) };
}
