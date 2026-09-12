import { type User, type UserProfile, userSchema } from "@grugchug/shared";

// Thin wrappers around /api/users. Vite proxies /api to the Bun server in dev.
// `fetchFn` is injectable so tests never touch the network.

export async function fetchUser(id: string, fetchFn: typeof fetch = fetch): Promise<User | null> {
  const res = await fetchFn(`/api/users/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /api/users/${id} failed with ${res.status}`);
  return userSchema.parse(await res.json());
}

export async function saveUser(
  id: string,
  profile: UserProfile,
  fetchFn: typeof fetch = fetch,
): Promise<User> {
  const res = await fetchFn(`/api/users/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`PUT /api/users/${id} failed with ${res.status}`);
  return userSchema.parse(await res.json());
}
