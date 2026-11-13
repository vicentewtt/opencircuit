import { createSignal } from 'solid-js';
import { readSetting, writeSetting } from '../platform/settings';

/** The guided tour shown the first time the app opens, and on request. */

const [tourOpen, setTourOpen] = createSignal(false);
export { tourOpen };

export function openTour(): void {
  setTourOpen(true);
}

export function closeTour(): void {
  setTourOpen(false);
  writeSetting('tutorialSeen', '1');
}

/** Opens the tour unless it was already seen in this browser. */
export function openTourOnFirstVisit(): void {
  if (readSetting('tutorialSeen') !== '1') setTourOpen(true);
}
