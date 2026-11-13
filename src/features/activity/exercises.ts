/** Built-in list of common strength exercises, grouped by main muscle group. */

export interface ExerciseGroup {
  id: string;
  label: string;
  exercises: string[];
}

export const EXERCISE_GROUPS: ExerciseGroup[] = [
  {
    id: 'chest',
    label: 'Chest',
    exercises: ['Bench press', 'Incline bench press', 'Decline bench press', 'Dumbbell bench press', 'Incline dumbbell press', 'Dumbbell fly', 'Cable crossover', 'Chest press machine', 'Push-up', 'Dip'],
  },
  {
    id: 'back',
    label: 'Back',
    exercises: ['Deadlift', 'Pull-up', 'Chin-up', 'Lat pulldown', 'Barbell row', 'Dumbbell row', 'Seated cable row', 'T-bar row', 'Pendlay row', 'Face pull', 'Back extension'],
  },
  {
    id: 'shoulders',
    label: 'Shoulders',
    exercises: ['Overhead press', 'Seated dumbbell press', 'Arnold press', 'Lateral raise', 'Front raise', 'Rear delt fly', 'Upright row', 'Shrug'],
  },
  {
    id: 'arms',
    label: 'Arms',
    exercises: ['Barbell curl', 'Dumbbell curl', 'Hammer curl', 'Preacher curl', 'Cable curl', 'Tricep pushdown', 'Skull crusher', 'Overhead tricep extension', 'Close-grip bench press', 'Wrist curl'],
  },
  {
    id: 'legs',
    label: 'Legs',
    exercises: ['Back squat', 'Front squat', 'Goblet squat', 'Leg press', 'Romanian deadlift', 'Bulgarian split squat', 'Walking lunge', 'Leg extension', 'Lying leg curl', 'Seated leg curl', 'Hack squat', 'Step-up', 'Standing calf raise', 'Seated calf raise'],
  },
  {
    id: 'glutes',
    label: 'Glutes',
    exercises: ['Hip thrust', 'Glute bridge', 'Sumo deadlift', 'Cable kickback', 'Hip abduction machine'],
  },
  {
    id: 'core',
    label: 'Core',
    exercises: ['Plank', 'Crunch', 'Hanging leg raise', 'Cable crunch', 'Russian twist', 'Ab wheel rollout', 'Side plank', 'Dead bug'],
  },
  {
    id: 'full',
    label: 'Full body',
    exercises: ['Kettlebell swing', 'Clean and jerk', 'Power clean', 'Snatch', 'Thruster', "Farmer's carry", 'Burpee'],
  },
];

export const ALL_EXERCISES: { name: string; group: string }[] = EXERCISE_GROUPS.flatMap((g) =>
  g.exercises.map((name) => ({ name, group: g.label })),
);

/** Case-insensitive search; name-prefix matches first. */
export function searchExercises(query: string, extra: string[] = []): { name: string; group: string }[] {
  const pool = [...ALL_EXERCISES, ...extra.filter((n) => !ALL_EXERCISES.some((e) => e.name.toLowerCase() === n.toLowerCase())).map((name) => ({ name, group: 'Your exercises' }))];
  const q = query.trim().toLowerCase();
  if (!q) return pool;
  const ranked = pool
    .map((e) => {
      const n = e.name.toLowerCase();
      const rank = n.startsWith(q) ? 0 : n.split(/[\s-]+/).some((w) => w.startsWith(q)) ? 1 : n.includes(q) || e.group.toLowerCase().startsWith(q) ? 2 : -1;
      return { e, rank };
    })
    .filter((r) => r.rank >= 0);
  ranked.sort((a, b) => a.rank - b.rank || a.e.name.localeCompare(b.e.name));
  return ranked.map((r) => r.e);
}
