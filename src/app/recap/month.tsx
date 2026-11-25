import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { PeriodRecapScreen } from '@/features/recap/PeriodRecapScreen';

/** A month in cups (`?month=YYYY-MM`; without it, the last month that has ended). */
export default function MonthRecapScreen() {
  const { month } = useLocalSearchParams<{ month?: string }>();
  return <PeriodRecapScreen kind="month" param={month} />;
}
