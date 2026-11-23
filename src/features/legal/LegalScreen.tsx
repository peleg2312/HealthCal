import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Card, Header, ListRow, Screen, Text } from '@/ui';

import { contactLine, LEGAL_DOCUMENTS, updatedLine, type LegalDocument } from './content';

/**
 * One legal page (`/legal/terms`, `/legal/privacy`): the kit's Header (title, the short line under it,
 * the back chevron), the date and the opening words, one card per section, then a link to the other
 * page and, once the owner has set a support address, the contact line. The words are ./content.ts;
 * this only places them. Open without a profile (src/app/_layout.tsx), since they are also the public
 * pages a payment company, a store and Google sign-in link to.
 */
export function LegalScreen({ doc }: { doc: LegalDocument }) {
  const { spacing } = useTheme();
  const other = doc.id === 'terms' ? LEGAL_DOCUMENTS.privacy : LEGAL_DOCUMENTS.terms;
  const contact = contactLine();
  return (
    <Screen header={<Header title={doc.title} subtitle={doc.subtitle} />} testID={`legal-${doc.id}`}>
      <Card tone="alt" style={{ gap: spacing.sm }}>
        <Text variant="caption" color="textSecondary" testID={`legal-${doc.id}-updated`}>
          {updatedLine()}
        </Text>
        <Text variant="body">{doc.intro}</Text>
      </Card>
      {doc.sections.map((s) => (
        <Card key={s.id} testID={`legal-${doc.id}-${s.id}`}>
          <Text variant="h3" accessibilityRole="header" style={{ marginBottom: spacing.sm }}>
            {s.heading}
          </Text>
          <View style={{ gap: spacing.sm }}>
            {s.paragraphs.map((p, i) => (
              <Text key={i} variant="body" color="textSecondary">
                {p}
              </Text>
            ))}
          </View>
        </Card>
      ))}
      <Card padding={0} style={{ paddingHorizontal: spacing.lg }}>
        <ListRow
          testID={`legal-${doc.id}-other`}
          title={other.title}
          subtitle={other.subtitle}
          accessibilityRole="link"
          onPress={() => router.push(`/legal/${other.id}` as never)}
        />
      </Card>
      {contact ? (
        <Text variant="caption" color="textSecondary" testID={`legal-${doc.id}-contact`} selectable>
          {contact}
        </Text>
      ) : null}
    </Screen>
  );
}
