/**
 * The two questions answered on the phone, as text: the same facts Train's overview and What fits
 * show (stage one's functions, nothing more), free and at once. They may use everything the phone
 * holds, synced workouts included, because they never leave it: neither the answer nor its button's
 * question is ever part of what a typed question sends (`historyFor`, ./request.ts). Pure.
 */
import { overviewAnswer, trainingOverview, type LoadSession } from '@/lib/trainingLoad';
import { hasEstimate } from '@/features/food/favoriteWords';
import { ideaLine, overLine, PLATE_NOTE, type MealIdea, type MealIdeas } from '@/features/today/ideas';
import { formatNumber } from '@/lib/units';
import type { ISODate, MealType } from '@/types';

import { FEW_LEFT_ANSWER } from './words';

/** "How is my training week?": the training overview of the last 7 days as one paragraph. */
export function trainingAnswer(activities: readonly LoadSession[], today: ISODate): string {
  return overviewAnswer(trainingOverview(activities, today));
}

/**
 * One idea as What fits lists it. An idea whose items carry a range (a saved or past AI estimate) never
 * shows an exact number: "Chicken and rice: ~640 kcal, ...".
 */
export function ideaAnswerLine(idea: MealIdea): string {
  const line = ideaLine(idea);
  const head = `${idea.name}: `;
  return hasEstimate(idea.items) && line.startsWith(head) ? `${head}~${line.slice(head.length)}` : line;
}

/** "Ideas for dinner": the meals that fit what is left today, as What fits lists them. */
export function ideasAnswer(ideas: MealIdeas, meal: MealType, kcalLeft: number): string {
  if (ideas.state === 'over') return overLine(ideas.overBy, true);
  if (ideas.state === 'few' || ideas.ideas.length === 0) return FEW_LEFT_ANSWER;
  const mealWord = meal === 'snack' ? 'a snack' : meal;
  const head = `Meals that fit the ${formatNumber(Math.max(0, Math.round(kcalLeft)))} kcal left today, for ${mealWord}:`;
  return [head, ...ideas.ideas.map(ideaAnswerLine), ...(ideas.plates ? [PLATE_NOTE] : [])].join('\n');
}
