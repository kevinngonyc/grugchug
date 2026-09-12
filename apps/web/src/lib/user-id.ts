export const USER_ID_KEY = "grugchug.userId";

if (typeof window !== "undefined" && !window.crypto?.randomUUID) {
  const cryptoObj = window.crypto;
  if (cryptoObj) {
    Object.defineProperty(cryptoObj, 'randomUUID', {
      value: function () {
        const arr = new Uint8Array(16);
        cryptoObj!.getRandomValues(arr);
        
        // Use Type Assertions to guarantee to TypeScript these indices are valid
        (arr as any)[6] = ((arr as any)[6] & 0x0f) | 0x40; 
        (arr as any)[8] = ((arr as any)[8] & 0x3f) | 0x80;
        
        const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0'));
        return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
      },
      configurable: true,
      writable: true
    });
  }
}

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
