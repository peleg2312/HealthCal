/**
 * A kept meal photo, drawn from this device only (./files.ts or ./files.web.ts; a drawn plate for a demo photo).
 * Until its address is read the frame shows the card colour, so nothing flashes; a photo whose file is gone
 * shows the same empty frame. The picture itself is content: its name is the tile's or the sheet's.
 */
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { DECORATIVE } from '@/ui';

import { demoPhotoUri, isDemoPhoto } from './demo';
import { photoUri } from './files';

/** The address a photo is drawn from, or null while it is read (or when its file is gone). */
export function usePhotoUri(id: string): string | null {
  const [state, setState] = useState<{ id: string; uri: string | null }>(() => ({ id, uri: isDemoPhoto(id) ? demoPhotoUri(id) : null }));
  useEffect(() => {
    if (isDemoPhoto(id)) return;
    let live = true;
    void photoUri(id).then((uri) => {
      if (live) setState({ id, uri });
    });
    return () => {
      live = false;
    };
  }, [id]);
  if (isDemoPhoto(id)) return demoPhotoUri(id);
  return state.id === id ? state.uri : null;
}

export function MealPhotoImage({ id, style }: { id: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const uri = usePhotoUri(id);
  return (
    <View style={[{ backgroundColor: colors.surfaceAlt, overflow: 'hidden' }, style]} {...DECORATIVE}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={0} /> : null}
    </View>
  );
}
