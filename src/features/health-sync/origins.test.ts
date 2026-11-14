import { describe, expect, it } from 'vitest';

import { garminExternalId } from '@/features/import/convert';

import { healthExternalId, isGarminOrigin, originName, syncedFrom } from './origins';

describe('origins', () => {
  it('knows Garmin Connect on both platforms', () => {
    expect(isGarminOrigin('com.garmin.android.apps.connectmobile')).toBe(true);
    expect(isGarminOrigin('com.garmin.connect.mobile')).toBe(true);
    expect(isGarminOrigin('com.strava')).toBe(false);
    expect(originName('com.garmin.android.apps.connectmobile')).toBe('Garmin Connect');
  });

  it('names well-known apps, uses the platform name when given, and reads the rest from the package', () => {
    expect(originName('com.sec.android.app.shealth')).toBe('Samsung Health');
    expect(originName('com.whatever', 'Trail Buddy')).toBe('Trail Buddy');
    expect(originName('com.example.trailTracker')).toBe('Trail Tracker');
    expect(originName('com.mi.health')).toBe('Mi Health');
    expect(originName('org.runnerup')).toBe('Runnerup');
    expect(originName('com.android')).toBe('another app');
  });

  it('gives a Garmin Connect workout the identity the file import writes', () => {
    expect(healthExternalId('com.garmin.android.apps.connectmobile', '2026-11-12T06:00:00Z')).toBe(garminExternalId({ startUtc: '2026-11-12T06:00:00Z' }));
    expect(healthExternalId('com.strava', '2026-11-12T06:00:00Z')).toBe('health:com.strava:2026-11-12T06:00:00Z');
  });

  it('says where a saved workout was synced from, and nothing for other sessions', () => {
    expect(syncedFrom({ source: 'health', externalId: 'garmin:2026-11-12T06:00:00Z' })).toBe('Garmin Connect');
    expect(syncedFrom({ source: 'health', externalId: 'health:com.strava:2026-11-12T06:00:00Z' })).toBe('Strava');
    expect(syncedFrom({ source: 'health', externalId: 'health:fi.polar.polarflow:2026-11-12T06:00:00Z' })).toBe('Polar Flow');
    expect(syncedFrom({ source: 'health' })).toBe('your health app');
    expect(syncedFrom({ source: 'garmin', externalId: 'garmin:2026-11-12T06:00:00Z' })).toBeNull();
    expect(syncedFrom({})).toBeNull();
  });
});
