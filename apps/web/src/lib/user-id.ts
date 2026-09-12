export const USER_ID_KEY = "grugchug.userId";

// The browser is the account. One random id per browser profile, minted on
// first use and kept in localStorage. Clearing site data makes a new user.
// Shared by profile (the user record) and chat (sent as the caller id on the
// first create or join, which the server keeps) so one browser is one user.
export function getUserId(storage: Storage = localStorage): string {
  const existing = storage.getItem(USER_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage.setItem(USER_ID_KEY, id);
  return id;
}
