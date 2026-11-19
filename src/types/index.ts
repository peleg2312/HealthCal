/**
 * Core domain types. Everything persisted locally and synced to the backend
 * is one of these records. All quantities are stored in metric (kg, cm, ml,
 * kcal, grams); unit conversion happens only at the display edge.
 */

export type ISODate = string; // 'YYYY-MM-DD' in the user's local calendar
export type ISODateTime = string; // full ISO-8601 timestamp

export type Sex = 'male' | 'female';
export type UnitSystem = 'metric' | 'imperial';
export type ThemePreference = 'system' | 'light' | 'dark' | 'blossom';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
export type GoalType = 'lose' | 'maintain' | 'gain';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Base fields carried by every synced record. */
export interface SyncedRecord {
  id: string;
  /** Last local modification, used for last-write-wins sync. */
  updatedAt: ISODateTime;
  /** Soft delete so removals propagate to other devices. */
  deleted?: boolean;
}

// ---------------------------------------------------------------- profile

export interface MacroSplit {
  /** Fractions of total calories, summing to 1. */
  protein: number;
  carbs: number;
  fat: number;
}

/** Where a workout's added calories go: its own day, or shared over that day and the six after it (`@/lib/exerciseBudget`). */
export type ExerciseSpread = 'day' | 'week';

export interface Profile {
  name: string;
  sex: Sex;
  birthDate: ISODate;
  heightCm: number;
  /** Latest known body weight; kept in step with the newest WeightEntry. */
  weightKg: number;
  /** Optional body fat %, unlocks lean-mass based formulas. */
  bodyFatPct?: number;
  activityLevel: ActivityLevel;
  goal: GoalType;
  targetWeightKg?: number;
  /** Desired weekly change in kg (positive number; direction comes from goal). */
  weeklyRateKg: number;
  units: UnitSystem;
  /** Manual overrides. When unset the calculation engine decides. */
  calorieTargetOverride?: number;
  macroSplitOverride?: MacroSplit;
  waterGoalMlOverride?: number;
  /** Whether logged exercise adds calories back to the daily budget. */
  eatBackExercise: boolean;
  /** How added workout calories are placed; absent = 'day'. Only read when eatBackExercise is true. */
  exerciseSpread?: ExerciseSpread;
  /** A drink logged as food in the diary also adds its volume to Water; absent = on (src/features/drinks/diary.ts). */
  diaryDrinksInWater?: boolean;
  /** Closed periods with the rule each had; written only by a Goals save (withRuleChange). */
  exerciseRuleHistory?: { until: ISODate; rule: 'day' | 'week' | 'off' }[];
  /** Use the adaptive (data-driven) expenditure estimate once it is reliable. */
  useAdaptiveTdee: boolean;
  onboardedAt?: ISODateTime;
  updatedAt: ISODateTime;
}

// ------------------------------------------------------------------ food

export interface Nutrients {
  kcal: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  fiber?: number; // g
  sugar?: number; // g
  satFat?: number; // g
  sodium?: number; // mg
}

export type FoodSource = 'builtin' | 'usda' | 'openfoodfacts' | 'custom' | 'ai' | 'quick';

export interface Serving {
  label: string; // e.g. '1 cup', '1 medium', '100 g'
  grams: number;
}

/** A food definition (database item), nutrients are per 100 g (or 100 ml). */
export interface Food {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  per100g: Nutrients;
  servings: Serving[];
  source: FoodSource;
  /** True for lab/label-sourced data, false for crowd-sourced entries. */
  verified: boolean;
  /** The USDA FoodData Central record a bundled food's values were checked against. */
  fdcId?: number;
  /**
   * The Israeli national nutrition database (Tzameret, Ministry of Health) record a bundled food's
   * values come from: its `Code` column. Carbohydrate is stored as the record's available
   * carbohydrate plus its fibre, so it is total carbohydrate like every other food.
   */
  ilCode?: number;
  category?: string;
  /**
   * Whether this is a drink, for a food that is not bundled: true or false from an online product's
   * categories or from the person's switch on their own food; absent = not known. A drink logged in
   * the diary also adds its volume to Water (src/features/drinks/diary.ts). Bundled foods never
   * carry it: their rule is the list there.
   */
  beverage?: boolean;
  /** Emoji shown in lists. */
  emoji?: string;
}

/** User-created food, synced. */
export interface CustomFood extends Food, SyncedRecord {}

/** A logged diary line. Nutrients are absolute (already scaled to the amount eaten). */
export interface FoodEntry extends SyncedRecord {
  date: ISODate;
  meal: MealType;
  name: string;
  brand?: string;
  emoji?: string;
  foodId?: string;
  source: FoodSource;
  verified: boolean;
  servingLabel: string;
  quantity: number;
  grams: number;
  nutrients: Nutrients;
  /** For AI estimates: plausible calorie range and 0..1 confidence. */
  kcalRange?: [number, number];
  confidence?: number;
  /** The definition this entry was logged from, kept so it can be re-scaled or re-logged offline. */
  food?: Food;
  loggedAt: ISODateTime;
  /** 'water': written with a water record by the water screen (src/features/drinks). Keeps it out of recents, usual foods, last portions, copies, saved meals and the logging streak. */
  via?: 'water';
}

export interface SavedMealItem {
  name: string;
  brand?: string;
  emoji?: string;
  servingLabel: string;
  quantity: number;
  grams: number;
  nutrients: Nutrients;
  food?: Food;
  source: FoodSource;
  verified: boolean;
  /** Carried along so a saved or copied estimate still reads as an estimate. */
  kcalRange?: [number, number];
  confidence?: number;
}

/** A starred food. Stored with its definition so it can be logged offline and on other devices. */
export interface FavoriteFood extends SyncedRecord {
  food: Food;
}

export interface SavedMeal extends SyncedRecord {
  name: string;
  items: SavedMealItem[];
  /** How many servings the items make together. Logging one serving adds the total divided by this. Default 1. */
  servings?: number;
}

// -------------------------------------------------------------- activity

export type ActivityCategory =
  | 'cardio'
  | 'team'
  | 'racket'
  | 'strength'
  | 'mind'
  | 'water'
  | 'winter'
  | 'combat'
  | 'outdoor'
  | 'dance'
  | 'daily';

export type Intensity = 'light' | 'moderate' | 'vigorous';

/** 'garmin': imported from a Garmin export. 'health': read from Apple Health or Health Connect. */
export type ActivitySource = 'manual' | 'garmin' | 'health';

export interface ActivityDef {
  id: string;
  name: string;
  category: ActivityCategory;
  emoji: string;
  /** MET value per intensity from the Compendium of Physical Activities. */
  met: Record<Intensity, number>;
  /** Short description of what each intensity means for this activity. */
  intensityHint?: Partial<Record<Intensity, string>>;
  /** Whether distance is a meaningful input. */
  tracksDistance?: boolean;
  keywords?: string[];
}

export interface StrengthSet {
  reps: number;
  weightKg: number;
  done?: boolean;
}

export interface StrengthExercise {
  name: string;
  sets: StrengthSet[];
}

export interface ActivityEntry extends SyncedRecord {
  date: ISODate;
  activityId: string;
  name: string;
  emoji: string;
  category: ActivityCategory;
  intensity: Intensity;
  durationMin: number;
  met: number;
  /** Calories above resting for the session; this is what is added to the budget. */
  kcalNet: number;
  /** Total calories during the session, resting included. */
  kcalGross: number;
  /** Body weight and daily baseline the calories were calculated with, so a later edit does not use today's. */
  weightKg?: number;
  baselineKcalPerDay?: number;
  /** Where the session came from. Absent means it was entered by hand in this app. */
  source?: ActivitySource;
  /** The session's identity in the app it came from, so importing the same file twice does not add it twice. */
  externalId?: string;
  /** When the session started, where the source knows it. */
  startedAt?: ISODateTime;
  /** True when the calories were measured by a device (heart rate, power) instead of estimated from a MET table. */
  measured?: boolean;
  avgHeartRate?: number;
  /** Highest heart rate in the session, beats per minute (a device file or the health store); shown on the workout only. */
  maxHeartRate?: number;
  distanceKm?: number;
  notes?: string;
  exercises?: StrengthExercise[];
  loggedAt: ISODateTime;
}

// -------------------------------------------------------- other trackers

export type Beverage = 'water' | 'tea' | 'coffee' | 'juice' | 'milk' | 'sports' | 'other';

export interface WaterEntry extends SyncedRecord {
  date: ISODate;
  ml: number;
  beverage: Beverage;
  loggedAt: ISODateTime;
  /** What the drink was: a DRINK_CHOICES id, 'food' (picked) or 'kcal' (calories entered). Absent: logged before drinks had choices, or plain water. */
  drink?: string;
  /** The diary entry holding this drink's calories (src/features/drinks). Absent: it added no calories. */
  foodEntryId?: string;
  /**
   * The diary entry this water came from: a drink logged as food in the diary also adds its volume
   * here (src/features/drinks/diary.ts). The entry leads: it is removed with the entry and follows its
   * amount and day; deleting this record leaves the entry. Never set together with `foodEntryId`,
   * which is the other direction (a drink logged on the water screen).
   */
  fromEntryId?: string;
}

export interface WeightEntry extends SyncedRecord {
  date: ISODate;
  kg: number;
  bodyFatPct?: number;
  waistCm?: number;
  hipCm?: number;
  neckCm?: number;
  note?: string;
  /** Set only on a weigh-in read from a health store (src/features/health-sync/body.ts). Absent: entered by hand. */
  source?: 'health';
  /** The store it was read from ('file' is not written yet). */
  store?: SleepStore;
  /** The app that wrote it: a package, a bundle id, or appleOrigin()'s com.apple.health.watch/iphone/device. Never a device's or person's name. */
  origin?: string;
  /** The reading's instant, `new Date(ms).toISOString()`; compare with Date.parse. */
  measuredAt?: ISODateTime;
  /**
   * What the sync wrote. The record stays a synced one only while `kg` and
   * `bodyFatPct` still equal these (`isSyncedWeighIn`, src/features/trackers/weighInSource.ts).
   */
  syncedKg?: number;
  syncedBodyFatPct?: number;
}

/** How a night felt, 1 (poor) to 5 (great). Only ever given by the person. */
export type SleepQuality = 1 | 2 | 3 | 4 | 5;

/** Which health store a synced night was read from ('file' is the Health app's export). */
export type SleepStore = 'healthConnect' | 'healthKit' | 'file';

/** Minutes of each sleep stage in a synced night. Awake time is never counted as sleep. */
export interface SleepStages {
  light: number;
  deep: number;
  rem: number;
  awake: number;
}

/**
 * One night, one record per wake day (the id is derived from `date`).
 * Entered by hand: `date`, `hours`, `quality`. Read from a health store
 * (src/features/health-sync): `source: 'health'` with `store`, `origin`,
 * `startedAt`, `endedAt` and `stages`, and no quality until the person gives one.
 */
export interface SleepEntry extends SyncedRecord {
  /** The date the user woke up. */
  date: ISODate;
  /** Hours asleep (time awake and in bed not counted), rounded to 2 decimals when synced. */
  hours: number;
  quality?: SleepQuality;
  /** Set only on a night read from a health store. Cleared when the person changes its hours. */
  source?: 'health';
  store?: SleepStore;
  /** The app that wrote it (a package, bundle id or `com.apple.health.watch`), never a device's name. */
  origin?: string;
  /** First fall asleep and last wake, ISO instants. */
  startedAt?: ISODateTime;
  endedAt?: ISODateTime;
  /** Minutes per stage, or null when the source recorded no stages. */
  stages?: SleepStages | null;
}

/** A saved strength routine: a named list of exercises with a set count each, started in one tap. */
export interface Routine extends SyncedRecord {
  name: string;
  exercises: { name: string; sets: number }[];
  createdAt: ISODateTime;
}

/**
 * The targets a day had while it was the current day. Kept so that history is
 * judged against what applied at the time, not against today's goals.
 */
export interface DaySnapshot extends SyncedRecord {
  date: ISODate;
  /** Calorie target before exercise. */
  target: number;
  /** Expenditure estimate the target was built on. */
  tdee: number;
  eatBackExercise: boolean;
  weightKg: number;
}

export interface FastingSession extends SyncedRecord {
  start: ISODateTime;
  end?: ISODateTime;
  targetHours: number;
}

// -------------------------------------------------------------- settings

export interface ReminderSettings {
  enabled: boolean;
  /** Quiet hours in local 'HH:mm'. No reminder fires inside this window. */
  quietStart: string;
  quietEnd: string;
  water: { enabled: boolean; everyMinutes: number };
  meals: { enabled: boolean; breakfast: string; lunch: string; dinner: string };
  /** Evening check-in with calories left and what is still unlogged. */
  dailySummary: { enabled: boolean; time: string };
  weighIn: { enabled: boolean; time: string; weekdays: number[] };
  movement: { enabled: boolean; time: string };
}

export interface Settings {
  theme: ThemePreference;
  reminders: ReminderSettings;
  haptics: boolean;
  celebrations: boolean;
  /** Quick-add glass sizes in ml. */
  waterPresets: number[];
  fastingTargetHours: number;
  /** Monday of the most recent week whose recap the user has opened. */
  recapSeenWeek?: ISODate;
  /** Weekly rhythm on the consistency page: days a week the user aims to log food, train and weigh in. */
  rhythmTargets?: { food: number; train: number; weigh: number };
  /** The morning page (a summary of yesterday on the first visit each morning). Undefined means on. */
  morningSummary?: boolean;
  /**
   * The last day the morning page opened by itself, for the person's other devices. Written only after
   * that morning's pull (src/features/morning/useMorningPage.ts); each device also keeps its own (seen.ts).
   */
  morningSeenDay?: ISODate;
  updatedAt: ISODateTime;
}

// ----------------------------------------------------------------- sync

export type Collection =
  | 'foodEntries'
  | 'customFoods'
  | 'savedMeals'
  | 'activities'
  | 'water'
  | 'weights'
  | 'sleep'
  | 'fasting'
  | 'favorites'
  | 'days'
  | 'routines';

// --------------------------------------------------------- AI food scan

export interface AiFoodItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  /** 0..1 */
  confidence: number;
}

export interface AiFoodResult {
  dish: string;
  items: AiFoodItem[];
  /** Fats that are easy to miss in a photo (oil, butter, dressing) the user should confirm. */
  hiddenFatQuestion: string | null;
  /** Free-text caveat, e.g. 'portion hard to judge without a reference object'. */
  note: string | null;
  model: string;
  demo?: boolean;
}
