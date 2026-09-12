import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from "@grugchug/shared";

// Identity is deferred (see .llm/architecture.md), so a userId is simply a
// long random string the client stores and sends back. It is unguessable, so
// it behaves like a bearer token, but it is not authentication: anyone
// holding the string is that user. Replace this when real auth lands.
const USER_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const USER_ID_LENGTH = 32;

export function newId(): string {
  return crypto.randomUUID();
}

export function newUserId(): string {
  return randomString(USER_ID_LENGTH, USER_ID_ALPHABET);
}

export function newInviteCode(): string {
  return randomString(INVITE_CODE_LENGTH, INVITE_CODE_ALPHABET);
}

// Rejection sampling rather than a plain modulo: bytes at the tail of the
// 0..255 range that do not divide evenly by the alphabet are discarded, so
// every character is equally likely.
export function randomString(length: number, alphabet: string): string {
  if (length <= 0) return "";
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  const bytes = new Uint8Array(length * 2);
  let out = "";
  while (out.length < length) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out += alphabet.charAt(byte % alphabet.length);
      if (out.length === length) break;
    }
  }
  return out;
}
