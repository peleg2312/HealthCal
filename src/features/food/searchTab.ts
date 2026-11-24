/**
 * The food search's tab chosen last, on this device only (AsyncStorage `healthcal.searchTab`), so someone
 * who logs from Favourites finds them open the next time (principle 1: a favourite food is then +, Search
 * food, its "+"). Only Favourites is opened from memory, and only while it holds a favourite food or meal
 * (`openingTab`): one look at My foods or Saved meals never hides Usual, the fastest path, behind an extra
 * tap on every later search. Read like the drink choice (`@/features/drinks/memory`): never synced,
 * never in the backup, never a store write; written only on a tab tap; until it is read, or when it is
 * missing or unreadable, search opens as before (Usual when the meal has history, else Recent).
 *
 * Loaded once early (the + sheet, mounted for the whole session, starts the read), so search's first
 * frame is already on the remembered tab. The key is outside the store's `healthcal/` prefix, so sign-out
 * does not clear it, like the other per-device conveniences.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export const SEARCH_TAB_KEY = 'healthcal.searchTab';

export type SearchTab = 'usual' | 'recent' | 'favorites' | 'mine' | 'meals';

const TABS: readonly SearchTab[] = ['usual', 'recent', 'favorites', 'mine', 'meals'];

export function parseSearchTab(raw: string | null | undefined): SearchTab | null {
  return typeof raw === 'string' && (TABS as readonly string[]).includes(raw) ? (raw as SearchTab) : null;
}

/**
 * The tab search opens on: the one picked on this visit; else Favourites when that was the tab chosen last
 * on this device and it lists something (`has.favorites`: a favourite food or meal); else Usual when the
 * meal has history and Recent when not. Any other remembered tab, or Favourites with nothing in it, opens
 * the default. Usual without history falls back to Recent.
 */
export function openingTab(picked: SearchTab | null, remembered: SearchTab | null, has: { usual: boolean; favorites: boolean }): SearchTab {
  const t = picked ?? (remembered === 'favorites' && has.favorites ? 'favorites' : has.usual ? 'usual' : 'recent');
  return t === 'usual' && !has.usual ? 'recent' : t;
}

interface SearchTabState {
  tab: SearchTab | null;
  loaded: boolean;
}

export const useSearchTab = create<SearchTabState>()(() => ({ tab: null, loaded: false }));

let loading: Promise<void> | null = null;

/** Read the stored tab once; later calls return the same promise. */
export function loadSearchTab(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      let stored: SearchTab | null = null;
      try {
        stored = parseSearchTab(await AsyncStorage.getItem(SEARCH_TAB_KEY));
      } catch {
        // Unreadable: search opens as before.
      }
      // A tap while the read was in flight is newer than what was stored.
      useSearchTab.setState((s) => ({ tab: s.tab ?? stored, loaded: true }));
    })();
  }
  return loading;
}

/** A tab tap: keep it, on this device. */
export function rememberSearchTab(tab: SearchTab): void {
  useSearchTab.setState({ tab });
  try {
    AsyncStorage.setItem(SEARCH_TAB_KEY, tab).catch((e: unknown) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[search] could not keep the tab', e);
    });
  } catch (e) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[search] could not keep the tab', e);
  }
}

/** For tests: forget what was read. */
export function resetSearchTabForTests(): void {
  loading = null;
  useSearchTab.setState({ tab: null, loaded: false });
}
