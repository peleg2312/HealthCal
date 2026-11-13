/**
 * Minimal stand-in for react-native in unit tests, which run under Node.
 * Only what pure service and logic modules touch at import time belongs here;
 * anything that renders is tested in the browser instead.
 */
export const Platform = {
  OS: 'ios' as 'ios' | 'android' | 'web',
  select: <T>(options: { ios?: T; android?: T; web?: T; native?: T; default?: T }): T | undefined =>
    options.ios ?? options.native ?? options.default,
};

export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove: () => {} }),
};

export const Linking = { openURL: async () => {}, openSettings: async () => {} };
