/**
 * Which HealthCal activity a Garmin workout is. Garmin names sports four ways:
 * FIT sport + sub sport enums, TCX's Running/Biking/Other, GPX track types
 * (Garmin Connect activity keys such as 'street_running') and CSV activity
 * types ('Pool Swim', possibly translated). Anything without a clear match maps
 * to null, with a short list of likely candidates, so the screen can ask.
 */
import { ACTIVITIES, ACTIVITY_BY_ID } from '@/data/activities';

import { appleHealthSport } from '@/features/health-sync/appleHealthTypes';

import { englishActivityType } from './csv';
import { normalizeText } from './text';
import type { ImportedWorkout } from './types';

export interface SportMatch {
  /** The app activity id, or null when the screen should ask. */
  activityId: string | null;
  /** Likely ids to offer first when asking (may be empty). */
  alternatives: string[];
}

const match = (activityId: string | null, alternatives: string[] = []): SportMatch => ({ activityId, alternatives });
const ask = (...alternatives: string[]) => match(null, alternatives);

/** 'Pool Swim' / 'eMountain Biking' / 'street_running' / 'resort_skiing_snowboarding_ws' -> snake case key. */
export function sportKey(name: string): string {
  return normalizeText(name, 'NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .replace(/_(v\d+|ws)$/, '');
}

/**
 * Garmin Connect activity keys and English CSV activity types, as keys.
 * Values are app activity ids, or a list of candidates when it is a real choice.
 */
export const GARMIN_TYPE_TO_ACTIVITY: Record<string, string | string[]> = {
  // running
  running: 'running', street_running: 'running', track_running: 'running', indoor_track: 'running', treadmill_running: 'running', indoor_running: 'running',
  virtual_run: 'running', virtual_running: 'running', obstacle_run: 'running', obstacle_racing: 'running', ultra_run: 'running', ultra_running: 'running',
  trail_running: 'trail_running',
  // cycling
  cycling: 'cycling', road_biking: 'cycling', road_cycling: 'cycling', gravel_cycling: 'cycling', cyclocross: 'cycling', recumbent_cycling: 'cycling',
  track_cycling: 'cycling', bike_commuting: 'cycling', commuting: 'cycling', hand_cycling: 'cycling', mountain_biking: 'mountain_biking',
  downhill_biking: 'mountain_biking', bmx: 'bmx', indoor_cycling: 'stationary_bike', virtual_ride: 'stationary_bike', virtual_cycling: 'stationary_bike',
  spinning: 'spinning', e_bike_fitness: 'e_bike', ebiking: 'e_bike', e_biking: 'e_bike', e_bike: 'e_bike', ebike: 'e_bike', e_bike_mountain: 'e_bike',
  emountain_biking: 'e_bike', e_mountain_biking: 'e_bike',
  // walking and hiking
  walking: 'walking', casual_walking: 'walking', speed_walking: 'walking', indoor_walking: 'treadmill_walking', treadmill_walking: 'treadmill_walking',
  hiking: 'hiking', rucking: 'hiking', mountaineering: 'hiking', geocaching: 'walking',
  // swimming
  swimming: 'swimming', lap_swimming: 'swimming', pool_swim: 'swimming', pool_swimming: 'swimming', open_water_swimming: 'open_water_swimming', open_water: 'open_water_swimming',
  // gym
  strength_training: 'strength_training', hiit: 'hiit', yoga: 'yoga', pilates: 'pilates', indoor_rowing: 'rowing_machine', elliptical: 'elliptical',
  stair_climbing: 'stair_machine', stair_stepper: 'stair_machine', floor_climbing: 'stair_climbing', jump_rope: 'jump_rope', flexibility_training: 'stretching',
  mobility: 'stretching', cardio: ['circuit_training', 'hiit', 'aerobics'], cardio_training: ['circuit_training', 'hiit', 'aerobics'], training: ['strength_training', 'circuit_training'],
  fitness_equipment: ['elliptical', 'stair_machine', 'rowing_machine', 'stationary_bike'],
  // climbing
  rock_climbing: 'rock_climbing', indoor_climbing: 'rock_climbing', bouldering: 'bouldering',
  // winter
  resort_skiing: 'downhill_skiing', resort_skiing_snowboarding: ['downhill_skiing', 'snowboarding'], alpine_skiing: 'downhill_skiing', backcountry_skiing: 'downhill_skiing',
  resort_snowboarding: 'snowboarding', snowboarding: 'snowboarding', backcountry_snowboarding: 'snowboarding',
  cross_country_skiing: 'cross_country_skiing', cross_country_classic_skiing: 'cross_country_skiing', skate_skiing: 'cross_country_skiing', cross_country_skate_skiing: 'cross_country_skiing',
  ice_skating: 'ice_skating', inline_skating: 'inline_skating', skating: ['inline_skating', 'ice_skating', 'roller_skating'], snowshoeing: ['hiking'],
  // water
  stand_up_paddleboarding: 'paddleboarding', sup: 'paddleboarding', kayaking: 'kayaking', whitewater_kayaking: 'kayaking', canoeing: 'canoeing', surfing: 'surfing',
  rowing: 'rowing_outdoor', paddling: ['kayaking', 'canoeing', 'paddleboarding'],
  // racket
  tennis: 'tennis', pickleball: 'pickleball', padel: 'padel', squash: 'squash', badminton: 'badminton', table_tennis: 'table_tennis', racquetball: 'racquetball',
  racket: ['tennis', 'padel', 'squash', 'badminton', 'table_tennis', 'pickleball'],
  // team
  basketball: 'basketball', soccer: 'soccer', football: 'soccer', american_football: 'football', baseball: 'baseball_softball', softball: 'baseball_softball',
  volleyball: 'volleyball', beach_volleyball: 'beach_volleyball', cricket: 'cricket', rugby: 'rugby', lacrosse: 'lacrosse', field_hockey: 'field_hockey',
  ice_hockey: 'ice_hockey', hockey: ['ice_hockey', 'field_hockey'], ultimate_disc: 'ultimate_frisbee', ultimate: 'ultimate_frisbee', team_sport: [],
  // other
  boxing: 'boxing', mixed_martial_arts: 'martial_arts', golf: 'golf', disc_golf: 'disc_golf', archery: 'archery', horseback_riding: 'horseback_riding',
  dance: 'dancing', dancing: 'dancing',
};

function fromKey(key: string): SportMatch {
  const v = GARMIN_TYPE_TO_ACTIVITY[key];
  if (v === undefined) return ask();
  if (Array.isArray(v)) return ask(...v);
  return match(v);
}

/** Speed in km/h, when distance and duration allow. */
function speedKmh(distanceM: number | null | undefined, durationSec: number | null | undefined): number | null {
  if (!distanceM || !durationSec || distanceM <= 0 || durationSec <= 0) return null;
  return distanceM / 1000 / (durationSec / 3600);
}

/** A FIT sport and sub sport (Profile names, snake case). */
export function mapFitSport(sport: string, subSport: string | null, distanceM?: number | null, durationSec?: number | null): SportMatch {
  const sub = subSport && subSport !== 'generic' && subSport !== 'all' ? subSport : null;
  switch (sport) {
    case 'running':
      if (sub === 'trail') return match('trail_running');
      return match('running');
    case 'cycling':
      if (sub === 'mountain' || sub === 'downhill' || sub === 'enduro') return match('mountain_biking');
      if (sub === 'bmx') return match('bmx');
      if (sub === 'spin') return match('spinning');
      if (sub === 'indoor_cycling' || sub === 'virtual_activity') return match('stationary_bike');
      if (sub === 'e_bike_fitness' || sub === 'e_bike_mountain' || sub === 'e_bike_enduro') return match('e_bike');
      return match('cycling');
    case 'e_biking':
      return match('e_bike');
    case 'walking':
      if (sub === 'indoor_walking' || sub === 'treadmill') return match('treadmill_walking');
      return match('walking');
    case 'hiking':
    case 'mountaineering':
      return match('hiking');
    case 'swimming':
      return match(sub === 'open_water' ? 'open_water_swimming' : 'swimming');
    case 'fitness_equipment': {
      if (sub === 'indoor_rowing') return match('rowing_machine');
      if (sub === 'elliptical') return match('elliptical');
      if (sub === 'stair_climbing') return match('stair_machine');
      if (sub === 'indoor_cycling' || sub === 'spin') return match(sub === 'spin' ? 'spinning' : 'stationary_bike');
      if (sub === 'treadmill' || sub === 'indoor_running' || sub === 'indoor_walking') {
        const v = speedKmh(distanceM, durationSec);
        if (v === null) return ask('running', 'treadmill_walking');
        return match(v >= 7.5 ? 'running' : 'treadmill_walking');
      }
      if (sub === 'strength_training') return match('strength_training');
      return fromKey('fitness_equipment');
    }
    case 'training':
      if (sub === 'strength_training') return match('strength_training');
      if (sub === 'yoga') return match('yoga');
      if (sub === 'pilates') return match('pilates');
      if (sub === 'hiit' || sub === 'amrap' || sub === 'emom' || sub === 'tabata') return match('hiit');
      if (sub === 'flexibility_training') return match('stretching');
      if (sub === 'cardio_training') return fromKey('cardio');
      if (sub === 'indoor_climbing') return match('rock_climbing');
      if (sub === 'bouldering') return match('bouldering');
      if (sub === 'breathing') return ask();
      return fromKey('training');
    case 'rowing':
      return match(sub === 'indoor_rowing' ? 'rowing_machine' : 'rowing_outdoor');
    case 'rock_climbing':
      return match(sub === 'bouldering' ? 'bouldering' : 'rock_climbing');
    case 'alpine_skiing':
      return match('downhill_skiing');
    case 'cross_country_skiing':
      return match('cross_country_skiing');
    case 'racket':
      if (sub && GARMIN_TYPE_TO_ACTIVITY[sub] && !Array.isArray(GARMIN_TYPE_TO_ACTIVITY[sub])) return fromKey(sub);
      return fromKey('racket');
    case 'hockey':
      if (sub === 'ice') return match('ice_hockey');
      if (sub === 'field') return match('field_hockey');
      return fromKey('hockey');
    case 'soccer':
      return match('soccer');
    case 'american_football':
      return match('football');
    case 'baseball':
      return match('baseball_softball');
    case 'dance':
      return match('dancing');
    case 'mixed_martial_arts':
      return match('martial_arts');
    case 'stand_up_paddleboarding':
      return match('paddleboarding');
    default:
      // generic, transition, multisport and anything newer fall through to the key table, which asks when unsure.
      return fromKey(sport);
  }
}

/** TCX Activity@Sport: Running, Biking or Other. */
export function mapTcxSport(sport: string): SportMatch {
  const s = sport.trim().toLowerCase();
  if (s === 'running') return match('running');
  if (s === 'biking') return match('cycling');
  return ask();
}

/** A Garmin Connect activity key (GPX <type>) or a CSV activity type in any supported language. */
export function mapGarminType(type: string): SportMatch {
  if (!type.trim()) return ask();
  return fromKey(sportKey(englishActivityType(type)));
}

/** An activity whose name or a keyword is exactly the title ('Bouldering', 'CrossFit'), for workouts Garmin filed as Other or Cardio. */
export function activityFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const key = sportKey(title);
  if (!key) return null;
  const hit = ACTIVITIES.find((a) => sportKey(a.name) === key || a.keywords?.some((k) => sportKey(k) === key));
  return hit?.id ?? null;
}

/**
 * The best app activity for an imported workout. When the sport alone does not
 * decide it, a title that names an activity is offered first among the
 * alternatives (never chosen silently: titles are free text).
 */
export function suggestActivity(w: Pick<ImportedWorkout, 'format' | 'sport' | 'subSport' | 'distanceM' | 'durationSec' | 'transition' | 'title' | 'appleType'>): SportMatch {
  if (w.transition) return ask();
  let m: SportMatch;
  switch (w.format) {
    case 'apple': {
      // The Health export names the type the way HealthKit does: Apple Health's own table decides.
      const sport = appleHealthSport(w.appleType ?? -1);
      m = match(sport.activityId, sport.alternatives);
      break;
    }
    case 'fit':
      m = mapFitSport(w.sport, w.subSport, w.distanceM, w.durationSec);
      break;
    case 'tcx':
      m = mapTcxSport(w.sport);
      break;
    default:
      m = mapGarminType(w.sport);
  }
  // Guard against an id the catalogue does not have (keeps the table honest if activities change).
  const known = (id: string) => id in ACTIVITY_BY_ID;
  const activityId = m.activityId && known(m.activityId) ? m.activityId : null;
  let alternatives = m.alternatives.filter(known);
  const fromTitle = activityId ? null : activityFromTitle(w.title);
  if (fromTitle) alternatives = [fromTitle, ...alternatives.filter((id) => id !== fromTitle)];
  return { activityId, alternatives };
}
