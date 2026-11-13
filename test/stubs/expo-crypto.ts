/** expo-crypto stand-in for unit tests. */
import { randomUUID as nodeRandomUUID } from 'node:crypto';

export const randomUUID = (): string => nodeRandomUUID();
