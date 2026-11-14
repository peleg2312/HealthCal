/**
 * Activity catalogue. Every MET value below is copied from the 2024 Adult
 * Compendium of Physical Activities rows recorded in the research file
 * (research-science.md, section 2.2); nothing here comes from memory.
 * MET_SOURCES says, per activity, which rows were used and flags every case
 * where a value is reused or substituted. Do not "tidy" METs: the Compendium
 * asks that values are not changed or combined.
 *
 * Compendium values are standard METs (3.5 ml/kg/min basis). Skiing and
 * snowboarding are active time only; bike rows are riding time.
 */
import type { ActivityCategory, ActivityDef } from '@/types';

type Triple<T> = [T, T, T];

interface Row {
  id: string;
  name: string;
  category: ActivityCategory;
  emoji: string;
  /** [light, moderate, vigorous] */
  met: Triple<number>;
  /** [light, moderate, vigorous] hints, each at most ~30 characters */
  hints: Triple<string>;
  /** Provenance, shown in the app. */
  source: string;
  distance?: boolean;
  keywords?: string[];
}

const ROWS: Row[] = [
  // ------------------------------------------------------------- cardio
  {
    id: 'walking', name: 'Walking', category: 'cardio', emoji: '🚶',
    met: [2.8, 3.8, 5.5],
    hints: ['Slow stroll, about 3.5 km/h', 'Moderate, about 5 km/h', 'Very brisk, about 6.5 km/h'],
    source: 'Compendium 2024 codes 17152 (2.0-2.4 mph) / 17190 (2.8-3.4 mph) / 17220 (4.0-4.4 mph).',
    distance: true, keywords: ['walk', 'stroll', 'steps', 'brisk walk', 'power walk'],
  },
  {
    id: 'treadmill_walking', name: 'Treadmill walking', category: 'cardio', emoji: '🚶',
    met: [3.5, 4.8, 5.8],
    hints: ['About 4.5 km/h', 'About 6 km/h', 'About 7 km/h'],
    source: 'Compendium 2024 codes 17352 (2.5-2.9 mph) / 17358 (3.5-3.9 mph) / 17361 (4.0-4.4 mph), 0% grade.',
    distance: true, keywords: ['treadmill', 'indoor walking', 'walk'],
  },
  {
    id: 'running', name: 'Running', category: 'cardio', emoji: '🏃',
    met: [8.5, 9.3, 11.8],
    hints: ['Jog, about 8 km/h', 'About 10 km/h', 'About 12 km/h or faster'],
    source: 'Compendium 2024 codes 12030 (5.0-5.2 mph) / 12050 (6-6.3 mph) / 12080 (7.5 mph).',
    distance: true, keywords: ['run', 'jog', 'jogging', 'treadmill', 'sprint', '5k', '10k'],
  },
  {
    id: 'jogging_in_place', name: 'Jogging in place', category: 'cardio', emoji: '🏃',
    met: [4.8, 4.8, 4.8], hints: ['Jogging on the spot', 'Jogging on the spot', 'Jogging on the spot'],
    source: 'Compendium 2024 code 12025; single Compendium value 4.8, same value used for all intensities.',
    keywords: ['jog', 'on the spot', 'indoor run'],
  },
  {
    id: 'trail_running', name: 'Cross-country running', category: 'cardio', emoji: '🏞️',
    met: [9.3, 9.3, 9.3], hints: ['Cross-country running', 'Cross-country running', 'Cross-country running'],
    source: 'Compendium 2024 code 12140; single Compendium value 9.3, same value used for all intensities.',
    distance: true, keywords: ['trail run', 'trail running', 'cross country', 'off-road run'],
  },
  {
    id: 'cycling', name: 'Cycling', category: 'cardio', emoji: '🚴',
    met: [4.0, 8.0, 10.0],
    hints: ['Leisure, under 16 km/h', 'Steady, about 20 km/h', 'Hard, about 24 km/h'],
    source: 'Compendium 2024 codes 01010 (<10 mph) / 01030 (12-13.9 mph) / 01040 (14-15.9 mph).',
    distance: true, keywords: ['bike', 'biking', 'bicycle', 'road bike', 'commute'],
  },
  {
    id: 'mountain_biking', name: 'Mountain biking', category: 'cardio', emoji: '🚵',
    met: [8.5, 8.5, 14.0],
    hints: ['General trail riding', 'General trail riding', 'Uphill, vigorous'],
    source: 'Compendium 2024 codes 01009 / 01009 / 01003. Light and moderate share the single general value 8.5 (no lighter row); vigorous is uphill vigorous 14.0 (racing 16.0 not used).',
    distance: true, keywords: ['mtb', 'mountain bike', 'trail bike', 'off-road bike'],
  },
  {
    id: 'bmx', name: 'BMX', category: 'cardio', emoji: '🚲',
    met: [8.5, 8.5, 8.5], hints: ['BMX riding', 'BMX riding', 'BMX riding'],
    source: 'Compendium 2024 code 01008; single Compendium value 8.5, same value used for all intensities.',
    keywords: ['bmx', 'bike park', 'pump track'],
  },
  {
    id: 'e_bike', name: 'E-bike', category: 'cardio', emoji: '🚲',
    met: [4.0, 6.0, 6.8],
    hints: ['High motor assistance', 'Light motor assistance', 'No motor assistance'],
    source: 'Compendium 2024 codes 01088 (high electronic support) / 01084 (light support) / 01080 (no support).',
    distance: true, keywords: ['electric bike', 'ebike', 'pedelec'],
  },
  {
    id: 'stationary_bike', name: 'Stationary bike', category: 'cardio', emoji: '🚴',
    met: [4.0, 6.8, 10.3],
    hints: ['Easy, about 50 W', 'Steady, 100-125 W', 'Hard, 150-200 W'],
    source: 'Compendium 2024 codes 01214 (50 W) / 01224 (101-125 W) / 01232 (151-199 W).',
    keywords: ['exercise bike', 'indoor cycling', 'turbo trainer', 'bike trainer'],
  },
  {
    id: 'spinning', name: 'Spinning class', category: 'cardio', emoji: '🚴',
    met: [9.0, 9.0, 9.0], hints: ['Spin bike class', 'Spin bike class', 'Spin bike class'],
    source: 'Compendium 2024 code 01270 (RPM/Spin bike class); single Compendium value 9.0, same value used for all intensities.',
    keywords: ['spin', 'rpm', 'indoor cycling class'],
  },
  {
    id: 'rowing_machine', name: 'Rowing machine', category: 'cardio', emoji: '🚣',
    met: [5.0, 7.5, 11.0],
    hints: ['Easy, under 100 W', 'Steady, 100-150 W', 'Hard, 150-200 W'],
    source: 'Compendium 2024 codes 02071 (<100 W) / 02072 (100-149 W) / 02073 (150-199 W).',
    distance: true, keywords: ['rower', 'ergometer', 'erg', 'concept2', 'indoor rowing'],
  },
  {
    id: 'elliptical', name: 'Elliptical trainer', category: 'cardio', emoji: '🏋️',
    met: [5.0, 5.0, 9.0],
    hints: ['Moderate effort', 'Moderate effort', 'Vigorous effort'],
    source: 'Compendium 2024 codes 02048 / 02048 / 02049. Only two rows (moderate 5.0, vigorous 9.0): light reuses the moderate value.',
    keywords: ['cross trainer', 'x-trainer'],
  },
  {
    id: 'jump_rope', name: 'Jump rope', category: 'cardio', emoji: '🪢',
    met: [8.3, 11.8, 12.3],
    hints: ['Slow, under 100 skips/min', 'Moderate, 100-120 /min', 'Fast, 120-160 skips/min'],
    source: 'Compendium 2024 codes 15552 (slow) / 15551 (moderate) / 15550 (fast). General rope skipping 02068 is 11.0, not used.',
    keywords: ['skipping', 'skipping rope', 'rope skipping'],
  },
  {
    id: 'aerobics', name: 'Aerobics class', category: 'cardio', emoji: '🤸',
    met: [4.8, 7.3, 8.0],
    hints: ['Low-impact class', 'General aerobics class', 'High-impact class'],
    source: 'Compendium 2024 codes 02005 (aerobic dance, low impact) / 02000 (aerobics, general) / 02006 (aerobic dance, high impact).',
    keywords: ['aerobic', 'aerobic dance', 'group fitness', 'jazzercise'],
  },
  {
    id: 'step_aerobics', name: 'Step aerobics', category: 'cardio', emoji: '🪜',
    met: [5.5, 7.3, 9.0],
    hints: ['Low step, 4 inch (10 cm)', 'Medium step, 6-8 inch', 'High step, 10-12 inch'],
    source: 'Compendium 2024 codes 02001 (4-inch step) / 02002 (6-8 inch) / 02003 (10-12 inch).',
    keywords: ['step class', 'step up', 'bench aerobics'],
  },
  {
    id: 'stair_climbing', name: 'Stair climbing', category: 'cardio', emoji: '🪜',
    met: [4.5, 6.8, 9.3],
    hints: ['Slow pace', 'General pace', 'Fast pace'],
    source: 'Compendium 2024 codes 17133 (slow) / 17131 (general) / 17134 (fast), one step at a time. Two steps at a time (17136) is 7.5, not used.',
    keywords: ['stairs', 'climbing stairs', 'steps', 'stair run'],
  },
  {
    id: 'stair_machine', name: 'Stair machine', category: 'cardio', emoji: '🪜',
    met: [9.3, 9.3, 9.3], hints: ['Stair treadmill', 'Stair treadmill', 'Stair treadmill'],
    source: 'Compendium 2024 code 02065 (stair treadmill ergometer, general); single Compendium value 9.3, same value used for all intensities.',
    keywords: ['stairmaster', 'step mill', 'stair climber'],
  },

  // ----------------------------------------------------------- strength
  {
    id: 'strength_training', name: 'Strength training', category: 'strength', emoji: '🏋️',
    met: [3.5, 5.0, 6.0],
    hints: ['Many exercises, 8-15 reps', 'Squats or deadlifts', 'Powerlifting, bodybuilding'],
    source: 'Compendium 2024 codes 02054 / 02052 / 02050. No explicit "light effort" row exists; 02054 (multiple exercises, 8-15 reps) is the nearest and is used for light.',
    keywords: ['weights', 'weight lifting', 'lifting', 'gym', 'resistance', 'bodybuilding', 'powerlifting'],
  },
  {
    id: 'calisthenics', name: 'Calisthenics', category: 'strength', emoji: '💪',
    met: [2.8, 3.8, 7.5],
    hints: ['Light effort', 'Moderate effort', 'Vigorous effort'],
    source: 'Compendium 2024 codes 02024 (light) / 02022 (moderate) / 02020 (vigorous).',
    keywords: ['push ups', 'pull ups', 'sit ups', 'bodyweight', 'street workout'],
  },
  {
    id: 'bodyweight_training', name: 'Bodyweight resistance', category: 'strength', emoji: '🤸',
    met: [3.0, 3.0, 6.5],
    hints: ['General bodyweight work', 'General bodyweight work', 'High intensity'],
    source: 'Compendium 2024 codes 02056 / 02056 / 02057. Only two rows (general 3.0, high intensity 6.5): light reuses the general value.',
    keywords: ['resistance', 'home workout', 'no equipment'],
  },
  {
    id: 'circuit_training', name: 'Circuit training', category: 'strength', emoji: '🔁',
    met: [3.5, 5.0, 7.5],
    hints: ['Light circuit', 'Moderate circuit', 'Vigorous, with kettlebells'],
    source: 'Compendium 2024 codes 02034 (light) / 02035 (moderate) / 02040 (vigorous, incl. kettlebells). Body-weight circuit 02032 (6.0) not used.',
    keywords: ['circuit', 'stations', 'boot camp', 'bootcamp'],
  },
  {
    id: 'hiit', name: 'HIIT', category: 'strength', emoji: '⚡',
    met: [7.0, 7.0, 11.0],
    hints: ['Moderate intervals', 'Moderate intervals', 'Burpees, Tabata, climbers'],
    source: 'Compendium 2024 codes 02210 / 02210 / 02214. Only two rows (moderate 7.0, vigorous 11.0): light reuses the moderate value.',
    keywords: ['high intensity', 'interval training', 'tabata', 'burpees', 'intervals'],
  },
  {
    id: 'kettlebell', name: 'Kettlebell swings', category: 'strength', emoji: '🔔',
    met: [9.8, 9.8, 9.8], hints: ['Kettlebell swings', 'Kettlebell swings', 'Kettlebell swings'],
    source: 'Compendium 2024 code 02058; single Compendium value 9.8, same value used for all intensities.',
    keywords: ['kettlebell', 'kettle bell', 'swings'],
  },
  {
    id: 'crossfit', name: 'CrossFit', category: 'strength', emoji: '🏋️',
    met: [7.5, 7.5, 11.0],
    hints: ['Circuit-style workout', 'Circuit-style workout', 'Max-effort intervals'],
    source: 'No dedicated row; uses circuit training incl. kettlebells 02040 (7.5) for light and moderate, and HIIT vigorous 02214 (11.0) for vigorous. Substitution, research file marks CrossFit UNVERIFIED.',
    keywords: ['wod', 'functional fitness', 'cross fit', 'box'],
  },
  {
    id: 'pilates', name: 'Pilates', category: 'mind', emoji: '🧘',
    met: [1.8, 2.8, 2.8],
    hints: ['Traditional mat Pilates', 'General Pilates', 'General Pilates'],
    source: 'Compendium 2024 codes 02103 (traditional mat) / 02105 (general) / 02105. Only two rows: vigorous reuses the general value 2.8.',
    keywords: ['reformer', 'core', 'mat pilates'],
  },
  {
    id: 'stretching', name: 'Stretching', category: 'mind', emoji: '🤸',
    met: [2.3, 2.3, 2.3], hints: ['Mild stretching', 'Mild stretching', 'Mild stretching'],
    source: 'Compendium 2024 code 02101; single Compendium value 2.3, same value used for all intensities.',
    keywords: ['flexibility', 'mobility', 'warm up', 'cool down'],
  },
  {
    id: 'yoga', name: 'Yoga', category: 'mind', emoji: '🧘',
    met: [2.3, 3.0, 4.0],
    hints: ['Gentle Hatha', 'Hot yoga', 'Power yoga'],
    source: 'Compendium 2024 codes 02150 (Hatha) / 02155 (hot yoga) / 02160 (power yoga). Hatha high intensity 02153 (8.0), vinyasa 02185 (2.7) and Surya Namaskar 02180 (3.5) not used.',
    keywords: ['hatha', 'vinyasa', 'power yoga', 'hot yoga', 'asana', 'flow', 'stretch'],
  },
  {
    id: 'tai_chi', name: 'Tai chi / qi gong', category: 'mind', emoji: '☯️',
    met: [1.5, 3.3, 6.0],
    hints: ['Seated, light', 'Qi gong', 'Yang style tai chi'],
    source: 'Compendium 2024 codes 15672 (seated, light) / 15670 (qi gong, general) / 15674 (Yang style tai chi chuan).',
    keywords: ['taichi', 'qigong', 'qi gong', 'chi kung'],
  },

  // --------------------------------------------------------------- team
  {
    id: 'volleyball', name: 'Volleyball', category: 'team', emoji: '🏐',
    met: [3.0, 4.0, 6.0],
    hints: ['Casual, non-competitive', 'Recreational game', 'Competitive match'],
    source: 'Compendium 2024 codes 15720 (non-competitive) / 15710 (general) / 15711 (competitive, gymnasium). Beach volleyball is a separate activity (15725).',
    keywords: ['indoor volleyball', 'spike', 'net'],
  },
  {
    id: 'beach_volleyball', name: 'Beach volleyball', category: 'team', emoji: '🏐',
    met: [8.0, 8.0, 8.0], hints: ['Volleyball in sand', 'Volleyball in sand', 'Volleyball in sand'],
    source: 'Compendium 2024 code 15725; single Compendium value 8.0, same value used for all intensities.',
    keywords: ['volleyball', 'sand', 'beach'],
  },
  {
    id: 'basketball', name: 'Basketball', category: 'team', emoji: '🏀',
    met: [5.0, 6.0, 8.0],
    hints: ['Shooting baskets', 'Casual, non-game play', 'Full game'],
    source: 'Compendium 2024 codes 15070 (shooting baskets) / 15050 (non-game, general) / 15040 (game). General 15055 (7.5) and drills 15072 (9.3) not used.',
    keywords: ['hoops', 'streetball', 'pickup', 'shooting', 'dunk'],
  },
  {
    id: 'soccer', name: 'Soccer', category: 'team', emoji: '⚽',
    met: [3.5, 7.0, 9.5],
    hints: ['Walking football', 'Casual game', 'Competitive match'],
    source: 'Compendium 2024 codes 15615 (walking football) / 15610 (casual, general) / 15605 (competitive).',
    keywords: ['football', 'futbol', 'kickabout', 'five-a-side'],
  },
  {
    id: 'futsal', name: 'Futsal', category: 'team', emoji: '⚽',
    met: [7.8, 7.8, 7.8], hints: ['Indoor five-a-side', 'Indoor five-a-side', 'Indoor five-a-side'],
    source: 'Compendium 2024 code 15195; single Compendium value 7.8, same value used for all intensities.',
    keywords: ['indoor soccer', 'indoor football', 'five-a-side'],
  },
  {
    id: 'football', name: 'Football (touch/flag)', category: 'team', emoji: '🏈',
    met: [4.0, 8.0, 8.0],
    hints: ['Light touch or flag', 'Touch or flag game', 'Touch or flag game'],
    source: 'Compendium 2024 codes 15232 (light) / 15230 (general) / 15230. Only two touch/flag rows: vigorous reuses 8.0. Competitive football 15210 is also 8.0, but the research table does not say whether it is American football, so it is not relied on.',
    keywords: ['american football', 'flag football', 'touch football', 'gridiron', 'nfl'],
  },
  {
    id: 'rugby', name: 'Rugby', category: 'team', emoji: '🏉',
    met: [6.3, 6.3, 8.3],
    hints: ['Touch, non-competitive', 'Touch, non-competitive', 'Union, competitive'],
    source: 'Compendium 2024 codes 15562 / 15562 / 15560. Only two rows (touch 6.3, union competitive 8.3): light and moderate share 6.3.',
    keywords: ['union', 'touch rugby', 'scrum'],
  },
  {
    id: 'field_hockey', name: 'Field hockey', category: 'team', emoji: '🏑',
    met: [7.8, 7.8, 7.8], hints: ['Field hockey', 'Field hockey', 'Field hockey'],
    source: 'Compendium 2024 code 15350; single Compendium value 7.8, same value used for all intensities.',
    keywords: ['hockey', 'stick'],
  },
  {
    id: 'ice_hockey', name: 'Ice hockey', category: 'team', emoji: '🏒',
    met: [8.0, 8.0, 10.0],
    hints: ['General play', 'General play', 'Competitive'],
    source: 'Compendium 2024 codes 15360 / 15360 / 15362. Only two rows (general 8.0, competitive 10.0): light reuses general.',
    keywords: ['hockey', 'puck', 'rink'],
  },
  {
    id: 'baseball_softball', name: 'Baseball / softball', category: 'team', emoji: '⚾',
    met: [4.0, 5.0, 6.0],
    hints: ['Practice, easy pace', 'Moderate game', 'Pitching'],
    source: 'Compendium 2024 codes 15625 (softball practice) / 15620 (baseball/softball, general) / 15640 (softball pitching).',
    keywords: ['baseball', 'softball', 'batting', 'pitching'],
  },
  {
    id: 'handball', name: 'Handball', category: 'team', emoji: '🤾',
    met: [8.0, 8.0, 12.0],
    hints: ['Team handball', 'Team handball', 'General handball, fast'],
    source: 'Compendium 2024 codes 15330 / 15330 / 15320. Only two rows (team 8.0, general 12.0): light reuses team handball.',
    keywords: ['team handball', 'court handball'],
  },
  {
    id: 'lacrosse', name: 'Lacrosse', category: 'team', emoji: '🥍',
    met: [8.0, 8.0, 8.0], hints: ['Lacrosse game', 'Lacrosse game', 'Lacrosse game'],
    source: 'Compendium 2024 code 15460; single Compendium value 8.0, same value used for all intensities.',
    keywords: ['lax'],
  },
  {
    id: 'cricket', name: 'Cricket', category: 'team', emoji: '🏏',
    met: [4.8, 4.8, 4.8], hints: ['Batting, bowling, fielding', 'Batting, bowling, fielding', 'Batting, bowling, fielding'],
    source: 'Compendium 2024 code 15150; single Compendium value 4.8, same value used for all intensities.',
    keywords: ['bat', 'bowl', 'wicket'],
  },
  {
    id: 'ultimate_frisbee', name: 'Ultimate Frisbee', category: 'team', emoji: '🥏',
    met: [8.0, 8.0, 8.0], hints: ['Ultimate game', 'Ultimate game', 'Ultimate game'],
    source: 'Compendium 2024 code 15250; single Compendium value 8.0, same value used for all intensities.',
    keywords: ['ultimate', 'disc', 'frisbee'],
  },
  {
    id: 'frisbee', name: 'Frisbee (casual)', category: 'team', emoji: '🥏',
    met: [3.0, 3.0, 3.0], hints: ['Casual throwing', 'Casual throwing', 'Casual throwing'],
    source: 'Compendium 2024 code 15240; single Compendium value 3.0, same value used for all intensities.',
    keywords: ['disc', 'throwing', 'catch'],
  },
  {
    id: 'bowling', name: 'Bowling', category: 'team', emoji: '🎳',
    met: [3.0, 3.0, 3.8],
    hints: ['General bowling', 'General bowling', 'Indoor alley'],
    source: 'Compendium 2024 codes 15090 / 15090 / 15092. Only two rows (general 3.0, indoor alley 3.8): light reuses general.',
    keywords: ['tenpin', 'ten-pin', 'alley'],
  },

  // ------------------------------------------------------------- racket
  {
    id: 'tennis', name: 'Tennis', category: 'racket', emoji: '🎾',
    met: [4.5, 6.8, 8.0],
    hints: ['Doubles, relaxed pace', 'Recreational, moderate', 'Singles or competitive'],
    source: 'Compendium 2024 codes 15685 (doubles) / 15675 (general, moderate effort) / 15690 (singles, 8.0; competitive 15676 also 8.0). CONFLICT: the research table lists tennis doubles at both 6.0 (15680, Taylor 430) and 4.5 (15685); the 2024 edition could not be identified, so the lower 4.5 is used.',
    keywords: ['racket', 'racquet', 'court', 'wimbledon', 'singles', 'doubles'],
  },
  {
    id: 'padel', name: 'Padel', category: 'racket', emoji: '🎾',
    met: [4.5, 6.0, 6.8],
    hints: ['Doubles, relaxed pace', 'Doubles, moderate', 'Hard-hitting rallies'],
    source: 'No dedicated row (research file: padel NOT FOUND); uses tennis doubles 15685 (4.5) / 15680 (6.0) / general tennis 15675 (6.8). Substitution; the tennis doubles 6.0 vs 4.5 conflict applies (see tennis).',
    keywords: ['paddle', 'padel tennis', 'racket'],
  },
  {
    id: 'pickleball', name: 'Pickleball', category: 'racket', emoji: '🏓',
    met: [4.5, 4.5, 6.0],
    hints: ['Relaxed doubles', 'Relaxed doubles', 'Fast, competitive doubles'],
    source: 'No dedicated row (research file: pickleball NOT FOUND); uses tennis doubles 15685 (4.5) for light and moderate and 15680 (6.0) for vigorous. Substitution; the 6.0 vs 4.5 tennis doubles conflict applies (see tennis).',
    keywords: ['pickle ball', 'paddle', 'dink'],
  },
  {
    id: 'table_tennis', name: 'Table tennis', category: 'racket', emoji: '🏓',
    met: [4.0, 4.0, 4.0], hints: ['Ping pong', 'Ping pong', 'Ping pong'],
    source: 'Compendium 2024 code 15660 (Taylor 410); single Compendium value 4.0, same value used for all intensities.',
    keywords: ['ping pong', 'pingpong'],
  },
  {
    id: 'badminton', name: 'Badminton', category: 'racket', emoji: '🏸',
    met: [5.5, 7.0, 9.0],
    hints: ['Social game', 'Competitive', 'Competitive match play'],
    source: 'Compendium 2024 codes 15030 (social singles/doubles) / 15020 (competitive) / 15025 (competitive match play).',
    keywords: ['shuttlecock', 'shuttle', 'racket'],
  },
  {
    id: 'squash', name: 'Squash', category: 'racket', emoji: '🎾',
    met: [7.3, 7.3, 12.0],
    hints: ['General squash', 'General squash', 'Competitive, fast rallies'],
    source: 'Compendium 2024 codes 15652 / 15652 / 15650 (Taylor 530). Only two rows (general 7.3, 12.0): light and moderate share 7.3.',
    keywords: ['racket', 'racquet'],
  },
  {
    id: 'racquetball', name: 'Racquetball', category: 'racket', emoji: '🎾',
    met: [7.0, 7.0, 10.0],
    hints: ['General play', 'General play', 'Competitive'],
    source: 'Compendium 2024 codes 15530 / 15530 / 15520. Only two rows (general 7.0, competitive 10.0): light reuses general.',
    keywords: ['racket', 'racquet', 'court'],
  },

  // ------------------------------------------------------------- combat
  {
    id: 'boxing', name: 'Boxing', category: 'combat', emoji: '🥊',
    met: [5.8, 7.8, 12.3],
    hints: ['Punching bag', 'Sparring', 'In the ring'],
    source: 'Compendium 2024 codes 15110 (punching bag) / 15120 (sparring) / 15100 (in ring, general). Simulated round 15125 (9.3) not used.',
    keywords: ['punch', 'sparring', 'heavy bag', 'shadow boxing', 'boxercise'],
  },
  {
    id: 'kickboxing', name: 'Kickboxing', category: 'combat', emoji: '🥋',
    met: [5.3, 7.3, 10.3],
    hints: ['Slow pace, novice', 'Kickboxing, general', 'Fast-paced practice'],
    source: 'Compendium 2024 codes 15425 (martial arts, slower pace/novice) / 15457 (kickboxing) / 15430 (martial arts incl. kick boxing, moderate pace).',
    keywords: ['kick boxing', 'cardio kickboxing', 'tae bo', 'tai-bo'],
  },
  {
    id: 'martial_arts', name: 'Martial arts', category: 'combat', emoji: '🥋',
    met: [5.3, 10.3, 10.3],
    hints: ['Slow pace, novice', 'Moderate pace', 'Moderate pace'],
    source: 'Compendium 2024 codes 15425 / 15430 / 15430. Only two rows (novice 5.3, moderate pace 10.3): vigorous reuses 10.3.',
    keywords: ['mma', 'self defence', 'self defense', 'dojo'],
  },
  {
    id: 'judo', name: 'Judo', category: 'combat', emoji: '🥋',
    met: [11.3, 11.3, 11.3], hints: ['Judo practice', 'Judo practice', 'Judo practice'],
    source: 'Compendium 2024 code 15433; single Compendium value 11.3, same value used for all intensities.',
    keywords: ['throws', 'grappling', 'martial arts'],
  },
  {
    id: 'taekwondo', name: 'Taekwondo', category: 'combat', emoji: '🥋',
    met: [5.3, 10.3, 14.3],
    hints: ['Slow pace, novice', 'Moderate pace', 'Combat simulation'],
    source: 'Compendium 2024 codes 15425 (martial arts, novice) / 15430 (moderate pace, names tae kwon do) / 15432 (taekwondo combat simulation).',
    keywords: ['tae kwon do', 'tkd', 'martial arts'],
  },
  {
    id: 'karate', name: 'Karate', category: 'combat', emoji: '🥋',
    met: [5.3, 10.3, 10.3],
    hints: ['Slow pace, novice', 'Moderate pace', 'Moderate pace'],
    source: 'No dedicated row; uses martial arts 15425 (5.3) and 15430 (10.3, a row that names karate). Substitution; vigorous reuses 10.3.',
    keywords: ['kata', 'kumite', 'martial arts'],
  },
  {
    id: 'jiu_jitsu', name: 'Jiu-jitsu', category: 'combat', emoji: '🥋',
    met: [5.3, 10.3, 10.3],
    hints: ['Slow pace, novice', 'Moderate pace', 'Moderate pace'],
    source: 'No dedicated row; uses martial arts 15425 (5.3) and 15430 (10.3, a row that names judo/jujitsu). Substitution; vigorous reuses 10.3.',
    keywords: ['bjj', 'brazilian jiu jitsu', 'jujitsu', 'ju-jitsu', 'grappling', 'martial arts'],
  },
  {
    id: 'muay_thai', name: 'Muay Thai', category: 'combat', emoji: '🥊',
    met: [5.3, 10.3, 10.3],
    hints: ['Slow pace, novice', 'Moderate pace', 'Moderate pace'],
    source: 'No dedicated row; uses martial arts 15425 (5.3) and 15430 (10.3, a row that names Muay Thai). Substitution; vigorous reuses 10.3.',
    keywords: ['thai boxing', 'martial arts', 'kickboxing'],
  },
  {
    id: 'wrestling', name: 'Wrestling', category: 'combat', emoji: '🤼',
    met: [6.0, 6.0, 6.0], hints: ['Competitive, 5-minute match', 'Competitive, 5-minute match', 'Competitive, 5-minute match'],
    source: 'Compendium 2024 code 15730 (competitive; one match = 5 min); single Compendium value 6.0, same value used for all intensities.',
    keywords: ['grappling', 'mat'],
  },
  {
    id: 'fencing', name: 'Fencing', category: 'combat', emoji: '🤺',
    met: [6.0, 6.0, 9.8],
    hints: ['General fencing', 'General fencing', 'Epee, competitive'],
    source: 'Compendium 2024 codes 15200 / 15200 / 15203. Only two rows (general 6.0, epee competitive 9.8): light reuses general.',
    keywords: ['sword', 'epee', 'foil', 'sabre'],
  },

  // -------------------------------------------------------------- water
  {
    id: 'swimming', name: 'Swimming (laps)', category: 'water', emoji: '🏊',
    met: [5.8, 8.0, 10.5],
    hints: ['Slow, relaxed laps', 'Medium-pace laps', 'Fast laps'],
    source: 'Compendium 2024 codes 18292 (crawl, slow 30-45 yd/min) / 18290 (medium ~50 yd/min) / 18280 (fast ~75 yd/min).',
    distance: true, keywords: ['swim', 'pool', 'laps', 'freestyle', 'crawl', 'front crawl'],
  },
  {
    id: 'leisure_swimming', name: 'Swimming (leisure)', category: 'water', emoji: '🏊',
    met: [6.0, 6.0, 6.0], hints: ['Leisurely, not laps', 'Leisurely, not laps', 'Leisurely, not laps'],
    source: 'Compendium 2024 code 18310; single Compendium value 6.0, same value used for all intensities.',
    distance: true, keywords: ['swim', 'paddling', 'pool', 'holiday swim'],
  },
  {
    id: 'open_water_swimming', name: 'Open water swimming', category: 'water', emoji: '🌊',
    met: [6.0, 6.0, 6.0], hints: ['Lake, ocean or river', 'Lake, ocean or river', 'Lake, ocean or river'],
    source: 'Compendium 2024 code 18300 (lake, ocean, river); single Compendium value 6.0, same value used for all intensities.',
    distance: true, keywords: ['swim', 'sea swim', 'wild swimming', 'lake', 'ocean', 'triathlon'],
  },
  {
    id: 'backstroke', name: 'Backstroke', category: 'water', emoji: '🏊',
    met: [4.8, 4.8, 9.5],
    hints: ['Recreational', 'Recreational', 'Training or competition'],
    source: 'Compendium 2024 codes 18255 / 18255 / 18250. Only two rows (recreational 4.8, training/competition 9.5): light reuses recreational.',
    distance: true, keywords: ['swim', 'back crawl', 'pool'],
  },
  {
    id: 'breaststroke', name: 'Breaststroke', category: 'water', emoji: '🏊',
    met: [5.3, 5.3, 10.3],
    hints: ['Recreational', 'Recreational', 'Training or competition'],
    source: 'Compendium 2024 codes 18265 / 18265 / 18260. Only two rows (recreational 5.3, training/competition 10.3): light reuses recreational.',
    distance: true, keywords: ['swim', 'pool'],
  },
  {
    id: 'butterfly', name: 'Butterfly stroke', category: 'water', emoji: '🏊',
    met: [13.8, 13.8, 13.8], hints: ['Butterfly swimming', 'Butterfly swimming', 'Butterfly swimming'],
    source: 'Compendium 2024 code 18270; single Compendium value 13.8, same value used for all intensities.',
    distance: true, keywords: ['swim', 'fly', 'pool'],
  },
  {
    id: 'water_aerobics', name: 'Water aerobics', category: 'water', emoji: '🌊',
    met: [5.5, 5.5, 7.5],
    hints: ['General aqua class', 'General aqua class', 'High intensity'],
    source: 'Compendium 2024 codes 18355 / 18355 / 18358. Only two rows (general 5.5, high intensity 7.5): light reuses general.',
    keywords: ['aqua aerobics', 'aqua fit', 'aquafit', 'pool class', 'aqua'],
  },
  {
    id: 'water_polo', name: 'Water polo', category: 'water', emoji: '🤽',
    met: [10.0, 10.0, 10.0], hints: ['Water polo game', 'Water polo game', 'Water polo game'],
    source: 'Compendium 2024 code 18360; single Compendium value 10.0, same value used for all intensities.',
    keywords: ['polo', 'pool'],
  },
  {
    id: 'surfing', name: 'Surfing', category: 'water', emoji: '🏄',
    met: [3.0, 3.0, 5.0],
    hints: ['General surfing', 'General surfing', 'Competitive'],
    source: 'Compendium 2024 codes 18220 / 18220 / 18222. Only two rows (general 3.0, competitive 5.0): light reuses general.',
    keywords: ['surf', 'waves', 'surfboard', 'bodyboard'],
  },
  {
    id: 'paddleboarding', name: 'Stand-up paddleboarding', category: 'water', emoji: '🏄',
    met: [2.8, 3.8, 5.0],
    hints: ['About 10-19 strokes/min', 'About 20-29 strokes/min', 'About 30-39 strokes/min'],
    source: 'Compendium 2024 stand-up paddleboard rows by stroke rate, code range 18225-18229 (10-19 / 20-29 / 30-39 strokes/min). Higher rates (9.8, 11.0) and general 6.5 (18224) not used.',
    distance: true, keywords: ['sup', 'paddle board', 'paddle boarding', 'stand up paddle'],
  },
  {
    id: 'kayaking', name: 'Kayaking', category: 'water', emoji: '🛶',
    met: [5.0, 5.0, 9.0],
    hints: ['Moderate paddling', 'Moderate paddling', 'Slalom, flat water'],
    source: 'Compendium 2024 codes 18100 / 18100 / 18106. Light and moderate share the moderate row 5.0 (no lighter row); vigorous is slalom flat water 9.0 (competition 13.5 not used).',
    distance: true, keywords: ['kayak', 'paddle', 'sea kayak', 'canoe'],
  },
  {
    id: 'canoeing', name: 'Canoeing', category: 'water', emoji: '🛶',
    met: [2.8, 5.8, 5.8],
    hints: ['Light, 3-6 km/h', 'Moderate, 6.5-9.5 km/h', 'Moderate, 6.5-9.5 km/h'],
    source: 'Compendium 2024 codes 18040 (2.0-3.9 mph) / 18050 (4.0-5.9 mph) / 18050. Only two rows: vigorous reuses 5.8.',
    distance: true, keywords: ['canoe', 'paddle'],
  },
  {
    id: 'rowing_outdoor', name: 'Rowing (on water)', category: 'water', emoji: '🚣',
    met: [3.5, 3.5, 12.0],
    hints: ['Rowing for pleasure', 'Rowing for pleasure', 'Competition crew or sculling'],
    source: 'Compendium 2024 codes 18070 / 18070 / 18080. Only two rows (pleasure 3.5, competition 12.0): light and moderate share 3.5.',
    distance: true, keywords: ['row', 'sculling', 'crew', 'boat', 'regatta'],
  },

  // ------------------------------------------------------------- winter
  {
    id: 'downhill_skiing', name: 'Downhill skiing', category: 'winter', emoji: '⛷️',
    met: [4.3, 6.3, 8.0],
    hints: ['Light effort', 'Moderate effort', 'Vigorous effort'],
    source: 'Compendium 2024 codes 19150 (light) / 19160 (moderate) / 19170 (vigorous). Active time only, excludes lift rides.',
    distance: true, keywords: ['ski', 'skiing', 'alpine', 'piste', 'slopes'],
  },
  {
    id: 'snowboarding', name: 'Snowboarding', category: 'winter', emoji: '🏂',
    met: [4.3, 6.3, 8.0],
    hints: ['Light effort', 'Moderate effort', 'Vigorous effort'],
    source: 'Compendium 2024 codes 19150 / 19160 / 19170 (rows cover "alpine or snowboarding"). Active time only, excludes lift rides. Recreational snowboarding 19201 (7.5) not used.',
    distance: true, keywords: ['snowboard', 'snow', 'slopes', 'board'],
  },
  {
    id: 'cross_country_skiing', name: 'Cross-country skiing', category: 'winter', emoji: '🎿',
    met: [6.8, 8.5, 11.3],
    hints: ['Slow, about 4 km/h', 'About 6.5-8 km/h', 'Fast, 8-12 km/h'],
    source: 'Compendium 2024 codes 19080 (2.5 mph) / 19090 (4.0-4.9 mph) / 19100 (5.0-7.9 mph).',
    distance: true, keywords: ['nordic skiing', 'xc ski', 'ski', 'langlauf', 'skate ski'],
  },
  {
    id: 'ice_skating', name: 'Ice skating', category: 'winter', emoji: '⛸️',
    met: [5.5, 7.0, 9.0],
    hints: ['Easy, under 14 km/h', 'General skating', 'Rapid, over 14 km/h'],
    source: 'Compendium 2024 codes 19020 (9 mph or less) / 19030 (general) / 19040 (rapid, >9 mph).',
    distance: true, keywords: ['skate', 'skating', 'rink', 'figure skating', 'speed skating'],
  },

  // ------------------------------------------------------------ outdoor
  {
    id: 'hiking', name: 'Hiking', category: 'outdoor', emoji: '🥾',
    met: [3.8, 5.3, 7.8],
    hints: ['Slow, no load', 'Normal pace, no load', 'With a daypack'],
    source: 'Compendium 2024 codes 17081 (slow/ambling, no load) / 17082 (normal pace, no load) / 17012 (with daypack). Generic cross-country hiking 17080 (6.0) not used.',
    distance: true, keywords: ['hike', 'trek', 'trekking', 'trail', 'mountain', 'ramble'],
  },
  {
    id: 'hill_walking', name: 'Uphill walking', category: 'outdoor', emoji: '⛰️',
    met: [7.0, 7.0, 7.0], hints: ['Uphill, 6-10% grade', 'Uphill, 6-10% grade', 'Uphill, 6-10% grade'],
    source: 'Compendium 2024 code 17035 (hill climbing, no load, 6-10% grade); single Compendium value 7.0, same value used for all intensities.',
    distance: true, keywords: ['hill climbing', 'incline walk', 'mountain walk', 'hill'],
  },
  {
    id: 'nordic_walking', name: 'Nordic walking', category: 'outdoor', emoji: '🥢',
    met: [5.3, 5.3, 5.3], hints: ['Level, moderate, 6-7 km/h', 'Level, moderate, 6-7 km/h', 'Level, moderate, 6-7 km/h'],
    source: 'Compendium 2024 code 17304 (3.6-4.4 mph, level, moderate); single Compendium value 5.3, same value used for all intensities.',
    distance: true, keywords: ['pole walking', 'poles', 'walk'],
  },
  {
    id: 'dog_walking', name: 'Dog walking', category: 'outdoor', emoji: '🐕',
    met: [3.0, 3.0, 3.0], hints: ['Walking the dog', 'Walking the dog', 'Walking the dog'],
    source: 'Compendium 2024 code 17165; single Compendium value 3.0, same value used for all intensities.',
    distance: true, keywords: ['dog', 'walk', 'pet', 'puppy'],
  },
  {
    id: 'rock_climbing', name: 'Rock climbing', category: 'outdoor', emoji: '🧗',
    met: [5.8, 8.0, 10.5],
    hints: ['Low-moderate difficulty', 'General climbing', 'Speed climbing'],
    source: 'Compendium 2024 codes 15537 (low-to-moderate difficulty) / 15533 (rock or mountain climbing, general) / 15536 (speed). High difficulty 15535 (7.3) and rappelling 15540 (5.0) not used.',
    keywords: ['climb', 'climbing', 'indoor climbing', 'wall', 'mountaineering', 'abseil'],
  },
  {
    id: 'bouldering', name: 'Bouldering', category: 'outdoor', emoji: '🧗',
    met: [8.8, 8.8, 8.8], hints: ['Free bouldering', 'Free bouldering', 'Free bouldering'],
    source: 'Compendium 2024 code 15534 (free boulder); single Compendium value 8.8, same value used for all intensities.',
    keywords: ['boulder', 'climbing', 'climb', 'wall'],
  },
  {
    id: 'golf', name: 'Golf', category: 'outdoor', emoji: '⛳',
    met: [3.5, 4.3, 4.5],
    hints: ['Using a power cart', 'Walking, carrying clubs', 'Walking, pulling clubs'],
    source: 'Compendium 2024 codes 15290 (power cart) / 15265 (walking, carrying clubs) / 15285 (walking, pulling clubs). General golf 15255 is 4.5.',
    distance: true, keywords: ['driving range', 'fairway', 'putting', 'course'],
  },
  {
    id: 'horseback_riding', name: 'Horseback riding', category: 'outdoor', emoji: '🏇',
    met: [3.8, 5.8, 7.3],
    hints: ['Walking pace', 'Trotting', 'Canter or gallop'],
    source: 'Compendium 2024 codes 15400 (walking) / 15390 (trotting) / 15395 (canter/gallop). General 15370 (5.5) and jumping 15402 (9.0) not used.',
    distance: true, keywords: ['horse', 'riding', 'equestrian', 'pony', 'dressage'],
  },
  {
    id: 'skateboarding', name: 'Skateboarding', category: 'outdoor', emoji: '🛹',
    met: [5.0, 5.0, 6.0],
    hints: ['Moderate effort', 'Moderate effort', 'Competitive'],
    source: 'Compendium 2024 codes 15580 / 15580 / 15582. Only two rows (moderate 5.0, competitive 6.0): light reuses moderate.',
    keywords: ['skate', 'skatepark', 'longboard', 'board'],
  },
  {
    id: 'roller_skating', name: 'Roller skating', category: 'outdoor', emoji: '🛼',
    met: [7.0, 7.0, 7.0], hints: ['General roller skating', 'General roller skating', 'General roller skating'],
    source: 'Compendium 2024 code 15590 (Taylor 360); single Compendium value 7.0, same value used for all intensities.',
    distance: true, keywords: ['roller', 'quad skates', 'roller derby', 'skate'],
  },
  {
    id: 'inline_skating', name: 'Inline skating', category: 'outdoor', emoji: '🛼',
    met: [7.5, 9.8, 12.3],
    hints: ['Recreational, about 14 km/h', 'Moderate, about 18 km/h', 'Fast, about 21 km/h'],
    source: 'Compendium 2024 codes 15591 (9 mph) / 15592 (11 mph) / 15593 (13-13.6 mph).',
    distance: true, keywords: ['rollerblading', 'rollerblade', 'blades', 'skate'],
  },
  {
    id: 'archery', name: 'Archery', category: 'outdoor', emoji: '🏹',
    met: [4.3, 4.3, 4.3], hints: ['Non-hunting archery', 'Non-hunting archery', 'Non-hunting archery'],
    source: 'Compendium 2024 code 15010; single Compendium value 4.3, same value used for all intensities.',
    keywords: ['bow', 'arrows', 'target'],
  },
  {
    id: 'disc_golf', name: 'Disc golf', category: 'outdoor', emoji: '🥏',
    met: [3.8, 3.8, 3.8], hints: ['Disc golf round', 'Disc golf round', 'Disc golf round'],
    source: 'Compendium 2024 code 15252; single Compendium value 3.8, same value used for all intensities.',
    keywords: ['frisbee golf', 'frolf', 'disc'],
  },

  // -------------------------------------------------------------- dance
  {
    id: 'dancing', name: 'Dancing', category: 'dance', emoji: '💃',
    met: [3.8, 4.5, 9.8],
    hints: ['Easy, general dancing', 'Folk or cultural dance', 'Club, folk or line, vigorous'],
    source: 'Compendium 2024 codes 03070 (contemporary, general) / 03025 (ethnic or cultural) / 03031 (nightclub, folk, line dancing, vigorous).',
    keywords: ['dance', 'club', 'nightclub', 'line dance', 'folk dance', 'party', 'freestyle'],
  },
  {
    id: 'ballroom_dancing', name: 'Ballroom dancing', category: 'dance', emoji: '🕺',
    met: [3.0, 5.5, 11.3],
    hints: ['Slow ballroom', 'Fast ballroom', 'Competitive ballroom'],
    source: 'Compendium 2024 codes 03040 (slow) / 03030 (fast) / 03038 (competitive). Recreational ballroom 03042 is listed at 6.0, above fast (5.5); not used.',
    keywords: ['ballroom', 'waltz', 'foxtrot', 'ballroom dance', 'latin', 'tango', 'swing'],
  },
  {
    id: 'ballet', name: 'Ballet / modern / jazz', category: 'dance', emoji: '🩰',
    met: [5.0, 5.0, 6.8],
    hints: ['Class or rehearsal', 'Class or rehearsal', 'Performance'],
    source: 'Compendium 2024 codes 03010 / 03010 / 03012. Only two rows (class/rehearsal 5.0, performance vigorous 6.8): light reuses class/rehearsal.',
    keywords: ['ballet', 'modern dance', 'jazz dance', 'contemporary'],
  },
  {
    id: 'salsa', name: 'Salsa', category: 'dance', emoji: '💃',
    met: [4.8, 4.8, 4.8], hints: ['Salsa with a partner', 'Salsa with a partner', 'Salsa with a partner'],
    source: 'Compendium 2024 code 03090; single Compendium value 4.8, same value used for all intensities.',
    keywords: ['latin dance', 'bachata', 'merengue', 'dance'],
  },
  {
    id: 'tap_dance', name: 'Tap dance', category: 'dance', emoji: '👞',
    met: [4.8, 4.8, 4.8], hints: ['Tap dancing', 'Tap dancing', 'Tap dancing'],
    source: 'Compendium 2024 code 03014; single Compendium value 4.8, same value used for all intensities.',
    keywords: ['tap', 'dance'],
  },
  {
    id: 'flamenco', name: 'Flamenco', category: 'dance', emoji: '💃',
    met: [8.5, 8.5, 8.5], hints: ['Flamenco dancing', 'Flamenco dancing', 'Flamenco dancing'],
    source: 'Compendium 2024 code 03075; single Compendium value 8.5, same value used for all intensities.',
    keywords: ['spanish dance', 'dance'],
  },
  {
    id: 'pole_fitness', name: 'Pole fitness', category: 'dance', emoji: '💃',
    met: [4.5, 4.5, 4.5], hints: ['Pole dance class', 'Pole dance class', 'Pole dance class'],
    source: 'Compendium 2024 code 02108 (pole dancing class); single Compendium value 4.5, same value used for all intensities.',
    keywords: ['pole dance', 'pole dancing', 'pole'],
  },
  {
    id: 'zumba', name: 'Zumba', category: 'dance', emoji: '💃',
    met: [5.5, 6.5, 6.5],
    hints: ['Home video workout', 'Group class', 'Group class'],
    source: 'Compendium 2024 codes 02315 (home video) / 02310 (group class) / 02310. Only two rows: vigorous reuses the group class value 6.5.',
    keywords: ['latin fitness', 'dance fitness', 'dance class'],
  },

  // -------------------------------------------------------------- daily
  {
    id: 'gardening', name: 'Gardening', category: 'daily', emoji: '🌱',
    met: [2.0, 3.8, 7.3],
    hints: ['General, light work', 'Moderate gardening', 'Vigorous digging'],
    source: 'Compendium 2024 codes 08066 (general) / 08245 (moderate) / 08052 (digging, vigorous). The research table lists general gardening at both 2.0 and 3.8, which are different effort rows; 2.0 is used for light and 3.8 for moderate. Weeding 08240 (4.5) and light digging 08045 (3.5) not used.',
    keywords: ['garden', 'weeding', 'digging', 'planting', 'yard work', 'allotment'],
  },
  {
    id: 'lawn_mowing', name: 'Lawn mowing', category: 'daily', emoji: '🌿',
    met: [2.5, 5.0, 6.0],
    hints: ['Riding mower', 'Walking, power mower', 'Hand mower, vigorous'],
    source: 'Compendium 2024 codes 08100 (riding mower) / 08120 (walking, power mower) / 08110 (hand mower, vigorous).',
    keywords: ['mowing', 'lawn', 'grass', 'yard work'],
  },
  {
    id: 'house_cleaning', name: 'House cleaning', category: 'daily', emoji: '🧹',
    met: [2.0, 3.3, 6.5],
    hints: ['Light floor scrubbing', 'General, moderate', 'Vigorous scrubbing'],
    source: 'Compendium 2024 codes 05131 (scrubbing floors, light) / 05030 (general, moderate) / 05132 (scrubbing floors, vigorous).',
    keywords: ['housework', 'chores', 'cleaning', 'tidying', 'scrubbing'],
  },
  {
    id: 'vacuuming', name: 'Vacuuming', category: 'daily', emoji: '🧹',
    met: [3.0, 3.0, 3.0], hints: ['Vacuuming', 'Vacuuming', 'Vacuuming'],
    source: 'Compendium 2024 code 05043; single Compendium value 3.0, same value used for all intensities.',
    keywords: ['hoovering', 'hoover', 'housework', 'chores'],
  },
  {
    id: 'mopping', name: 'Mopping', category: 'daily', emoji: '🧽',
    met: [3.5, 3.5, 3.5], hints: ['Mopping, moderate', 'Mopping, moderate', 'Mopping, moderate'],
    source: 'Compendium 2024 code 05021; single Compendium value 3.5, same value used for all intensities.',
    keywords: ['mop', 'floors', 'housework', 'chores'],
  },
  {
    id: 'sweeping', name: 'Sweeping', category: 'daily', emoji: '🧹',
    met: [3.8, 3.8, 3.8], hints: ['Sweeping, fast pace', 'Sweeping, fast pace', 'Sweeping, fast pace'],
    source: 'Compendium 2024 code 05012 (sweeping, fast); single Compendium value 3.8, same value used for all intensities.',
    keywords: ['broom', 'housework', 'chores'],
  },
  {
    id: 'playing_with_kids', name: 'Playing with kids', category: 'daily', emoji: '🧸',
    met: [2.3, 3.5, 5.8],
    hints: ['Sitting or lying, light', 'Walking or running around', 'Vigorous play'],
    source: 'Compendium 2024 codes 05170 (sitting, light) / 05175 (walking/running, moderate) / 05180 (vigorous). Active periods only. Standing light 05171 (2.8) not used.',
    keywords: ['children', 'child', 'toddler', 'play', 'park', 'parenting', 'playground', 'family'],
  },
  {
    id: 'stairs_descending', name: 'Walking downstairs', category: 'daily', emoji: '🪜',
    met: [3.5, 3.5, 3.5], hints: ['Descending stairs', 'Descending stairs', 'Descending stairs'],
    source: 'Compendium 2024 code 17070; single Compendium value 3.5, same value used for all intensities.',
    keywords: ['stairs', 'steps', 'downstairs'],
  },
];

// -------------------------------------------------------------- exports

export const ACTIVITIES: ActivityDef[] = ROWS.map((r) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  emoji: r.emoji,
  met: { light: r.met[0], moderate: r.met[1], vigorous: r.met[2] },
  intensityHint: { light: r.hints[0], moderate: r.hints[1], vigorous: r.hints[2] },
  tracksDistance: r.distance === true,
  keywords: r.keywords ?? [],
}));

export const ACTIVITY_BY_ID: Record<string, ActivityDef> = Object.fromEntries(
  ACTIVITIES.map((a) => [a.id, a]),
);

export const ACTIVITY_CATEGORIES: { id: ActivityCategory; label: string; emoji: string }[] = [
  { id: 'cardio', label: 'Cardio', emoji: '🏃' },
  { id: 'strength', label: 'Strength', emoji: '🏋️' },
  { id: 'mind', label: 'Mind & body', emoji: '🧘' },
  { id: 'team', label: 'Team sports', emoji: '⚽' },
  { id: 'racket', label: 'Racket sports', emoji: '🎾' },
  { id: 'combat', label: 'Combat', emoji: '🥊' },
  { id: 'water', label: 'Water', emoji: '🏊' },
  { id: 'winter', label: 'Winter', emoji: '⛷️' },
  { id: 'outdoor', label: 'Outdoor', emoji: '🥾' },
  { id: 'dance', label: 'Dance', emoji: '💃' },
  { id: 'daily', label: 'Everyday', emoji: '🏠' },
];

export const POPULAR_ACTIVITY_IDS: string[] = [
  'running',
  'walking',
  'strength_training',
  'cycling',
  'yoga',
  'swimming',
  'hiit',
  'volleyball',
  'basketball',
  'soccer',
  'tennis',
  'hiking',
];

/** Where each activity's MET values come from (shown in the app). */
export const MET_SOURCES: Record<string, string> = Object.fromEntries(
  ROWS.map((r) => [r.id, r.source]),
);

const byName = (a: ActivityDef, b: ActivityDef) => a.name.localeCompare(b.name);

/**
 * Case-insensitive match on name and keywords. Results whose name starts with
 * the query come first, then name word-prefix matches, then other matches;
 * ties are sorted by name. An empty query returns everything sorted by name.
 */
export function searchActivities(query: string): ActivityDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...ACTIVITIES].sort(byName);

  const ranked: { a: ActivityDef; rank: number }[] = [];
  for (const a of ACTIVITIES) {
    const name = a.name.toLowerCase();
    let rank = -1;
    if (name.startsWith(q)) rank = 0;
    else if (name.split(/[\s/\-(),]+/).some((w) => w.startsWith(q))) rank = 1;
    else if (name.includes(q)) rank = 2;
    else if (a.keywords?.some((k) => k.toLowerCase().startsWith(q))) rank = 3;
    else if (a.keywords?.some((k) => k.toLowerCase().includes(q))) rank = 4;
    if (rank >= 0) ranked.push({ a, rank });
  }
  ranked.sort((x, y) => x.rank - y.rank || byName(x.a, y.a));
  return ranked.map((r) => r.a);
}
