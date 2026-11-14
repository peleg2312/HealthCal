import { describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';

import { FIT_SPORTS, FIT_SUB_SPORTS } from './fitProfile';
import { activityFromTitle, GARMIN_TYPE_TO_ACTIVITY, mapFitSport, mapGarminType, mapTcxSport, sportKey, suggestActivity } from './sports';

describe('sport mapping', () => {
  it('only names activities that exist', () => {
    for (const v of Object.values(GARMIN_TYPE_TO_ACTIVITY)) {
      for (const id of Array.isArray(v) ? v : [v]) expect(ACTIVITY_BY_ID[id], id).toBeDefined();
    }
    for (const s of Object.values(FIT_SPORTS)) {
      for (const sub of [null, ...Object.values(FIT_SUB_SPORTS)]) {
        const m = mapFitSport(s, sub, 5000, 1800);
        if (m.activityId) expect(ACTIVITY_BY_ID[m.activityId], `${s}/${sub}`).toBeDefined();
      }
    }
  });

  it('maps FIT sport and sub sport', () => {
    expect(mapFitSport('running', 'generic').activityId).toBe('running');
    expect(mapFitSport('running', 'trail').activityId).toBe('trail_running');
    expect(mapFitSport('cycling', 'commuting').activityId).toBe('cycling');
    expect(mapFitSport('cycling', 'mountain').activityId).toBe('mountain_biking');
    expect(mapFitSport('cycling', 'indoor_cycling').activityId).toBe('stationary_bike');
    expect(mapFitSport('fitness_equipment', 'indoor_rowing').activityId).toBe('rowing_machine');
    expect(mapFitSport('training', 'strength_training').activityId).toBe('strength_training');
    expect(mapFitSport('training', 'yoga').activityId).toBe('yoga');
    expect(mapFitSport('training', 'hiit').activityId).toBe('hiit');
    expect(mapFitSport('swimming', 'open_water').activityId).toBe('open_water_swimming');
    expect(mapFitSport('swimming', 'lap_swimming').activityId).toBe('swimming');
    expect(mapFitSport('stand_up_paddleboarding', 'generic').activityId).toBe('paddleboarding');
    expect(mapFitSport('racket', 'padel').activityId).toBe('padel');
    expect(mapFitSport('hockey', 'ice').activityId).toBe('ice_hockey');
  });

  it('decides a treadmill session by its speed, and asks when it cannot', () => {
    expect(mapFitSport('fitness_equipment', 'treadmill', 5000, 1800).activityId).toBe('running');
    expect(mapFitSport('fitness_equipment', 'treadmill', 2500, 1800).activityId).toBe('treadmill_walking');
    expect(mapFitSport('fitness_equipment', 'treadmill', null, 1800)).toEqual({ activityId: null, alternatives: ['running', 'treadmill_walking'] });
  });

  it('asks for anything unclear or unknown', () => {
    expect(mapFitSport('generic', null).activityId).toBeNull();
    expect(mapFitSport('transition', null).activityId).toBeNull();
    expect(mapFitSport('multisport', null).activityId).toBeNull();
    expect(mapFitSport('sport_200', null).activityId).toBeNull();
    expect(mapFitSport('training', 'cardio_training')).toEqual({ activityId: null, alternatives: ['circuit_training', 'hiit', 'aerobics'] });
    expect(mapGarminType('Cardio').activityId).toBeNull();
    expect(mapGarminType('Other').activityId).toBeNull();
    expect(mapGarminType('Underwater basket weaving').activityId).toBeNull();
    expect(mapGarminType('').activityId).toBeNull();
  });

  it('maps TCX sports', () => {
    expect(mapTcxSport('Running').activityId).toBe('running');
    expect(mapTcxSport('Biking').activityId).toBe('cycling');
    expect(mapTcxSport('Other').activityId).toBeNull();
  });

  it('maps GPX type keys and CSV types, including translations', () => {
    expect(mapGarminType('street_running').activityId).toBe('running');
    expect(mapGarminType('windsurfing').activityId).toBeNull();
    expect(mapGarminType('Pool Swim').activityId).toBe('swimming');
    expect(mapGarminType('Open Water Swimming').activityId).toBe('open_water_swimming');
    expect(mapGarminType('eMountain Biking').activityId).toBe('e_bike');
    expect(mapGarminType('Virtual Cycling').activityId).toBe('stationary_bike');
    expect(mapGarminType('Strength Training').activityId).toBe('strength_training');
    expect(mapGarminType('Laufen').activityId).toBe('running');
    expect(mapGarminType('Course à pied').activityId).toBe('running');
    expect(mapGarminType('Hardlopen op een loopband').activityId).toBe('running');
    expect(mapGarminType('resort_skiing_snowboarding_ws').alternatives).toEqual(['downhill_skiing', 'snowboarding']);
    expect(sportKey('eMountain Biking')).toBe('emountain_biking');
  });

  it('offers an activity named by the title, without choosing it', () => {
    expect(activityFromTitle('Bouldering')).toBe('bouldering');
    expect(activityFromTitle('CrossFit')).toBe('crossfit');
    expect(activityFromTitle('Eindhoven Running')).toBeNull();
    const m = suggestActivity({ format: 'csv', sport: 'Cardio', subSport: null, distanceM: 0, durationSec: 1769, title: 'CrossFit' });
    expect(m.activityId).toBeNull();
    expect(m.alternatives[0]).toBe('crossfit');
  });

  it('asks for multisport transitions', () => {
    expect(suggestActivity({ format: 'fit', sport: 'transition', subSport: null, distanceM: 200, durationSec: 300, transition: true, title: null }).activityId).toBeNull();
  });
});
