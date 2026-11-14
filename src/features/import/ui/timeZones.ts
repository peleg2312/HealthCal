/**
 * Time zones the import screen offers. The engine's own list is used where it
 * exists (Intl.supportedValuesOf); otherwise a short list of common zones.
 * Every zone is checked by the reader itself, which reports "bad-time-zone".
 */
const COMMON = [
  'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Vancouver', 'America/Denver', 'America/Phoenix',
  'America/Chicago', 'America/Mexico_City', 'America/New_York', 'America/Toronto', 'America/Halifax', 'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires', 'America/Bogota', 'America/Lima', 'America/Santiago', 'Atlantic/Reykjavik', 'Europe/London',
  'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris', 'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Berlin',
  'Europe/Zurich', 'Europe/Rome', 'Europe/Vienna', 'Europe/Copenhagen', 'Europe/Oslo', 'Europe/Stockholm', 'Europe/Warsaw',
  'Europe/Prague', 'Europe/Budapest', 'Europe/Helsinki', 'Europe/Athens', 'Europe/Istanbul', 'Europe/Kyiv', 'Africa/Cairo',
  'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Bangkok',
  'Asia/Jakarta', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Taipei', 'Asia/Seoul', 'Asia/Tokyo',
  'Australia/Perth', 'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'UTC',
];

let cached: string[] | null = null;

export function allTimeZones(): string[] {
  if (cached) return cached;
  let list: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    list = intl.supportedValuesOf ? intl.supportedValuesOf('timeZone') : [];
  } catch {
    list = [];
  }
  cached = list.length > 50 ? [...new Set([...list, 'UTC'])] : COMMON;
  return cached;
}

/** The device's zone name, or null when the engine does not say. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** "Europe/Amsterdam" -> "Amsterdam (Europe)"; "America/Argentina/Buenos_Aires" -> "Buenos Aires (America)". */
export function zoneLabel(zone: string): string {
  const parts = zone.split('/');
  if (parts.length < 2) return zone;
  return `${parts[parts.length - 1].replace(/_/g, ' ')} (${parts[0]})`;
}

export function searchZones(query: string, limit = 40): string[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '_');
  const all = allTimeZones();
  if (!q) return COMMON.filter((z) => all.includes(z)).slice(0, limit);
  return all.filter((z) => z.toLowerCase().includes(q)).slice(0, limit);
}
