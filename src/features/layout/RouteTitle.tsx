/**
 * Sets the browser tab's title to the route shown ("Water · HealthCal", `documentTitle` in `./routeTitle`).
 * The root Stack's `screenLayout` renders it once per stack screen, on the web only (its parent checks
 * `Platform.OS`): expo-router's `Head` draws only while its screen is focused, so the screen in front names
 * the page, and the tabs, one stack screen, follow the pathname as it changes. On a phone it is not
 * rendered, so no Handoff activity is registered and nothing reads the address.
 */
import { useGlobalSearchParams, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import React from 'react';

import { documentTitle } from './routeTitle';

export function RouteTitle() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  return (
    <Head>
      <title>{documentTitle(pathname, params)}</title>
    </Head>
  );
}
