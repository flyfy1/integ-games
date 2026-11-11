import type { Screen, ScreenName } from './context';
import { cookbookScreen } from './cookbook';
import { loadoutScreen } from './loadout';
import { mapScreen } from './map';
import { pauseScreen, resultsScreen } from './results';
import { settingsScreen } from './settings';
import { shopScreen } from './shop';
import { titleScreen } from './title';

/** Screen registry: one function per menu, each in its own file. */
export const SCREENS: Record<ScreenName, Screen> = {
  title: titleScreen, map: mapScreen, loadout: loadoutScreen, cookbook: cookbookScreen, shop: shopScreen, settings: settingsScreen, results: resultsScreen, pause: pauseScreen
};
export type { ResultsData, Screen, ScreenName, ScreenParams, UiContext } from './context';
