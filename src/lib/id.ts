import * as Crypto from 'expo-crypto';

/** RFC 4122 v4 id. Records are created offline, so ids are generated on device. */
export function newId(): string {
  return Crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}
