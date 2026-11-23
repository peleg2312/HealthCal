import React from 'react';

import { TERMS } from '@/features/legal/content';
import { LegalScreen } from '@/features/legal/LegalScreen';

/** The terms of use (`/legal/terms`), open without a profile: ./src/features/legal/content.ts holds the words. */
export default function TermsScreen() {
  return <LegalScreen doc={TERMS} />;
}
