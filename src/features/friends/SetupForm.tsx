import React, { useState } from 'react';
import { View } from 'react-native';

import { setupSocial, type SocialSharing } from '@/services/friends';
import { useTheme } from '@/theme';
import { Button, Card, LargeTitle, Screen, Text, toast } from '@/ui';

import { AvatarPicker, NameField, SharingSwitches } from './components';
import { DEFAULT_SHARING } from './summary';

/**
 * Turning friends on: the name friends will see (prefilled from the profile),
 * how you appear, what is shared, and one primary action pinned in the footer.
 */
export function SetupForm({ header, defaultName, onDone }: { header: React.ReactNode; defaultName: string; onDone: () => void }) {
  const { spacing } = useTheme();
  const [name, setName] = useState(defaultName);
  const [avatar, setAvatar] = useState('');
  const [sharing, setSharing] = useState<SocialSharing>(DEFAULT_SHARING);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const res = await setupSocial({ displayName: name, avatar, sharing });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    toast('Friends turned on. Share your code to add someone.');
    onDone();
  };

  return (
    <Screen
      header={header}
      testID="friends-screen"
      footer={<Button testID="friends-setup-save" title="Turn on friends" loading={saving} disabled={!name.trim()} onPress={() => void submit()} />}>
      <LargeTitle title="Friends" />
      <Text variant="body" color="textSecondary">
        Add people with a code and see each other&apos;s training week. You choose what they see, and you can change it any time.
      </Text>
      <Card testID="friends-setup">
        <View style={{ gap: spacing.xl }}>
          <NameField testID="friends-setup-name" value={name} onChange={setName} />
          <AvatarPicker name={name} value={avatar} onChange={setAvatar} />
          <SharingSwitches sharing={sharing} onChange={(key, on) => setSharing((s) => ({ ...s, [key]: on }))} />
        </View>
      </Card>
      {error ? (
        <Text variant="label" color="danger" testID="friends-setup-error">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
