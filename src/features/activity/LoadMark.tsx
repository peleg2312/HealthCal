import React from 'react';
import { View } from 'react-native';

import { positionLabel, type LoadPosition } from '@/lib/trainingLoad';

import { ZoneTrack } from './ZoneScale';

/**
 * Where the last 7 days sit against the person's own recent weeks, as the 36 px mark beside the
 * title on Train's week card: the overview sheet's own scale drawn small (`ZoneTrack`: one slim
 * track in thirds, the third for the position filled in the exercise colour under its level line).
 * Never amber: more than usual is information, not a warning. It does not pour here; the sheet's does.
 */
export function LoadMark({ position, testID }: { position: LoadPosition; testID?: string }) {
  return (
    <View testID={testID} accessible accessibilityLabel={positionLabel(position)} style={{ width: 36 }}>
      <ZoneTrack position={position} height={12} rim={2.5} animate={false} />
    </View>
  );
}
