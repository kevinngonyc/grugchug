import { z } from "zod";

// The drawings in apps/web/public/characters/. Adding one means adding its id
// here, its PNG there, and its display name in features/profile/avatars.ts.
export const avatarIdSchema = z.enum([
  "conductor",
  "bonbon",
  "poku",
  "cat",
  "doug",
  "bbob",
  "bilby",
]);
export type AvatarId = z.infer<typeof avatarIdSchema>;

// Identified by the browser, not an account: the web mints `id` once and keeps
// it in localStorage. The avatar is the passenger riding this user's carriage;
// the conductor on the locomotive is the agent's face.
export const userSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  avatar: avatarIdSchema,
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof userSchema>;

// What the client may set. Body of PUT /api/users/:id.
export const userProfileSchema = userSchema.pick({ name: true, avatar: true });
export type UserProfile = z.infer<typeof userProfileSchema>;
