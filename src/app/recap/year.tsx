import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { PeriodRecapScreen } from '@/features/recap/PeriodRecapScreen';

/** A year in cups (`?year=YYYY`; without it, this year, or in the first week of January the year just ended). */
export default function YearRecapScreen() {
  const { year } = useLocalSearchParams<{ year?: string }>();
  return <PeriodRecapScreen kind="year" param={year} />;
}
