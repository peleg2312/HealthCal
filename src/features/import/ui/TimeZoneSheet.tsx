import { Check, Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/theme';
import { Divider, ListRow, Sheet, TextField } from '@/ui';

import { deviceTimeZone, searchZones, zoneLabel } from './timeZones';

/** Pick the time zone a file's times are in. The first row returns to the device's own zone. */
export function TimeZoneSheet({ visible, value, onClose, onPick }: { visible: boolean; value: string | null; onClose: () => void; onPick: (zone: string | null) => void }) {
  const { colors, spacing } = useTheme();
  const [query, setQuery] = useState('');
  // At 320 px the field holds about 26 characters: the example cities go.
  const narrow = useWindowDimensions().width < 360;
  const device = deviceTimeZone();
  const zones = searchZones(query).filter((z) => z !== device);
  const close = () => {
    setQuery('');
    onClose();
  };
  const choose = (z: string | null) => {
    onPick(z);
    close();
  };
  const mark = (on: boolean) => (on ? <Check size={18} color={colors.text} strokeWidth={2.2} /> : undefined);
  return (
    <Sheet visible={visible} onClose={close} title="Time zone">
      <TextField
        testID="import-zone-search"
        placeholder={narrow ? 'Search a city' : 'Search a city, such as Denver or Berlin'}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        left={<Search size={18} color={colors.textSecondary} />}
      />
      <View style={{ marginTop: -spacing.xs }}>
        {!query.trim() ? (
          <>
            <ListRow
              testID="import-zone-device"
              title="This device’s time zone"
              subtitle={device ? zoneLabel(device) : undefined}
              onPress={() => choose(null)}
              chevron={false}
              right={mark(value === null)}
              accessibilityState={{ selected: value === null }}
            />
            <Divider />
          </>
        ) : null}
        {zones.map((z, i) => (
          <React.Fragment key={z}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              testID={`import-zone-${z.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              title={zoneLabel(z)}
              subtitle={z}
              onPress={() => choose(z)}
              chevron={false}
              right={mark(value === z)}
              accessibilityState={{ selected: value === z }}
            />
          </React.Fragment>
        ))}
        {query.trim() && zones.length === 0 ? <ListRow title="No time zone matches" subtitle="Try the nearest large city in the same zone." /> : null}
      </View>
    </Sheet>
  );
}
