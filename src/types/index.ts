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
  category?: string;
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
}

export interface WeightEntry extends SyncedRecord {
  date: ISODate;
  kg: number;
  bodyFatPct?: number;
  waistCm?: number;
  hipCm?: number;
  neckCm?: number;
  note?: string;
}

export interface SleepEntry extends SyncedRecord {
  /** The date the user woke up. */
  date: ISODate;
  hours: number;
  quality: 1 | 2 | 3 | 4 | 5;
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
