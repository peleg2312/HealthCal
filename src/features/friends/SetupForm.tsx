import React, { useState } from 'react';
import { View } from 'react-native';

import { setupSocial, type SocialSharing } from '@/services/friends';
import { useTheme } from '@/theme';
import { Button, Card, LargeTitle, Screen, Text, toast } from '@/ui';

import { NameField, SharingSwitches } from './components';
import { DEFAULT_SHARING } from './summary';

/**
 * Turning friends on: the name friends will see (prefilled from the profile),
 * what is shared, and one primary action pinned in the footer. Friends see your initials.
 */
export function SetupForm({ header, defaultName, onDone }: { header: React.ReactNode; defaultName: string; onDone: () => void }) {
  const { spacing } = useTheme();
  const [name, setName] = useState(defaultName);
  const [sharing, setSharing] = useState<SocialSharing>(DEFAULT_SHARING);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const res = await setupSocial({ displayName: name, avatar: '', sharing });
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
      footer={
        // The refusal sits right above the button the user just pressed, never under the pinned footer.
        <View style={{ gap: spacing.sm }}>
          {error ? (
            <Text variant="label" color="danger" testID="friends-setup-error" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button testID="friends-setup-save" title="Turn on friends" loading={saving} disabled={!name.trim()} onPress={() => void submit()} />
        </View>
      }>
      <LargeTitle title="Friends" />
      <Text variant="body" color="textSecondary">
        Add people with a code and see each other&apos;s training week. You choose what they see, and you can change it any time.
      </Text>
      <Card testID="friends-setup">
        <View style={{ gap: spacing.xl }}>
          <NameField testID="friends-setup-name" value={name} onChange={setName} />
          <SharingSwitches sharing={sharing} onChange={(key, on) => setSharing((s) => ({ ...s, [key]: on }))} />
        </View>
      </Card>
    </Screen>
  );
}
