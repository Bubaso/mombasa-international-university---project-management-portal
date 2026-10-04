import type { Language } from '../types';

const SQM_PER_ACRE = 4046.8564224;
/** Metric dönüm, the modern Turkish unit: exactly 1000 m². */
const SQM_PER_DONUM = 1000;

/**
 * The site is recorded in acres. Turkish readers were shown the same number
 * relabelled as dönüm — so 84 acres read as 84 dönüm, understating the site
 * by a factor of four. The project's own evaluation report gives 340 dönüm,
 * which is what 84 acres actually converts to.
 */
export function acresToDonum(acres: number): number {
  return (acres * SQM_PER_ACRE) / SQM_PER_DONUM;
}

export function acresToSqm(acres: number): number {
  return acres * SQM_PER_ACRE;
}

/**
 * Land area in the reader's own unit. Turkish gets dönüm, rounded to the
 * nearest ten because the underlying acre figures are themselves rounded.
 */
export function formatLandArea(acres: number, language: Language): string {
  if (language === 'tr') {
    const donum = Math.round(acresToDonum(acres) / 10) * 10;
    return `${donum.toLocaleString('tr-TR')} dönüm`;
  }
  return `${acres.toLocaleString('en-GB')} acres`;
}

/** Just the number, for use inside a sentence that supplies its own unit. */
export function donumFromAcres(acres: number): number {
  return Math.round(acresToDonum(acres) / 10) * 10;
}
