/**
 * Profile's "Home screen widget" row (Android only; nothing on the web or an iPhone). A tap asks the
 * launcher to place the widget, and the launcher shows its own dialog. Where the launcher cannot
 * place widgets for an app, the row says so and how to add it from the home screen instead. The row
 * says when the widget is already on the home screen, read again whenever Profile comes back.
 */
import { useIsFocused } from 'expo-router';
import { LayoutGrid } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { IconTile } from '@/features/settings/components';
import { useTheme } from '@/theme';
import { ListRow, toast } from '@/ui';

import { pinTodayWidget, placedWidgets, widgetAvailable } from './pin';
import { ROW_HOW_TO_ADD, ROW_HOW_TO_ADD_SHORT, ROW_LINE, ROW_PLACED, ROW_TITLE } from './words';

export function WidgetRow() {
  if (!widgetAvailable) return null;
  return <PinRow />;
}

function PinRow() {
  const { colors } = useTheme();
  const focused = useIsFocused();
  const [placed, setPlaced] = useState(0);
  const [cannotPin, setCannotPin] = useState(false);

  useEffect(() => {
    if (!focused) return;
    let live = true;
    const read = () => void placedWidgets().then((n) => live && setPlaced(n));
    read();
    // Back from the launcher's dialog the app returns to the front: the widget may be there now.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [focused]);

  const onPress = async () => {
    const result = await pinTodayWidget();
    if (result === 'unsupported') {
      setCannotPin(true);
      toast(ROW_HOW_TO_ADD_SHORT);
    }
  };

  return (
    <ListRow
      testID="profile-widget-add"
      title={ROW_TITLE}
      subtitle={cannotPin ? ROW_HOW_TO_ADD : placed > 0 ? ROW_PLACED : ROW_LINE}
      left={
        <IconTile color={colors.water}>
          <LayoutGrid size={20} color={colors.water} />
        </IconTile>
      }
      onPress={() => void onPress()}
    />
  );
}
