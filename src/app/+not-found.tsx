import { router } from 'expo-router';
import React from 'react';

import { Button, EmptyState, Screen } from '@/ui';

export default function NotFound() {
  return (
    <Screen scroll={false} contentStyle={{ justifyContent: 'center', gap: 16 }} testID="not-found">
      <EmptyState emoji="🧭" title="This page does not exist" message="The link may be old, or the screen has moved." />
      <Button testID="not-found-home" title="Go to Today" onPress={() => router.replace('/')} />
    </Screen>
  );
}
