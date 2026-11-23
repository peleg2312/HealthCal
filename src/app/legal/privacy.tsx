import React from 'react';

import { PRIVACY } from '@/features/legal/content';
import { LegalScreen } from '@/features/legal/LegalScreen';

/** The privacy page (`/legal/privacy`), open without a profile: ./src/features/legal/content.ts holds the words. */
export default function PrivacyScreen() {
  return <LegalScreen doc={PRIVACY} />;
}
