import { describe, expect, it } from 'vitest';

import { EDITORIAL_REFERENCE_DATE } from '@landesrecht/legal-core/config/editorial.ts';
import {
  getJurisdictionByPathSegment,
  getJurisdictionByShortName,
  JURISDICTION_IDS,
  JURISDICTION_LIST,
  JURISDICTIONS,
  SIMULATION_BASELINE_DATE,
  formatBaselineDate,
} from '@landesrecht/legal-core/config/jurisdictions.ts';
import { getJurisdictionUrl, getNormUrl, getNormVersionUrl, getNormSubpageUrl, resolveJurisdictionSegment } from '@landesrecht/legal-core/lib/routes.ts';

describe('Jurisdiktionsregister', () => {
  it('definiert genau die vier Länder mit exakten Bezeichnungen', () => {
    expect([...JURISDICTION_IDS]).toEqual(['west', 'nsh', 'ost', 'baywue']);
    expect(JURISDICTIONS.west.name).toBe('Land Westdeutschland');
    expect(JURISDICTIONS.nsh.name).toBe('Land Niedersachsen-Holstein');
    expect(JURISDICTIONS.ost.name).toBe('Freistaat Ostdeutschland');
    expect(JURISDICTIONS.baywue.name).toBe('Freistaat Bayern-Württemberg');
    expect(JURISDICTION_LIST.map((jurisdiction) => jurisdiction.shortName)).toEqual(['West', 'NSH', 'Ost', 'BayWü']);
  });

  it('friert den Ausgangsrechtsstand 2023-12-01 für alle Länder zentral ein', () => {
    expect(SIMULATION_BASELINE_DATE).toBe('2023-12-01');
    for (const jurisdiction of JURISDICTION_LIST) expect(jurisdiction.baselineDate).toBe(SIMULATION_BASELINE_DATE);
    expect(formatBaselineDate()).toBe('1. Dezember 2023');
    expect(EDITORIAL_REFERENCE_DATE >= SIMULATION_BASELINE_DATE).toBe(true);
  });

  it('nutzt bayern-wuerttemberg als öffentliches URL-Segment, nicht baywue', () => {
    expect(JURISDICTIONS.baywue.pathSegment).toBe('bayern-wuerttemberg');
    expect(getJurisdictionUrl('baywue')).toBe('/bayern-wuerttemberg/');
    expect(getNormUrl('baywue', 'gemeindeordnung-baywue')).toBe('/bayern-wuerttemberg/norm/gemeindeordnung-baywue/');
    expect(getNormVersionUrl('west', 'schulgesetz-west', '2023-12-01')).toBe('/west/norm/schulgesetz-west/version/2023-12-01/');
    expect(getNormSubpageUrl('nsh', 'x', 'historie')).toBe('/nsh/norm/x/historie/');
    expect(getNormSubpageUrl('ost', 'x', 'daten', '2024-01-11')).toBe('/ost/norm/x/version/2024-01-11/daten/');
  });

  it('löst Segmente und Kurzbezeichnungen auf', () => {
    expect(resolveJurisdictionSegment('bayern-wuerttemberg')).toBe('baywue');
    expect(resolveJurisdictionSegment('baywue')).toBeUndefined();
    expect(getJurisdictionByPathSegment('west')?.id).toBe('west');
    expect(getJurisdictionByShortName('baywü')?.id).toBe('baywue');
    expect(getJurisdictionByShortName('NSH')?.id).toBe('nsh');
  });

  it('kennt OstRecht als externe Source of Truth nur für Ost', () => {
    expect(JURISDICTIONS.ost.externalSourceOfTruth?.system).toBe('ostrecht');
    for (const id of ['west', 'nsh', 'baywue'] as const) expect(JURISDICTIONS[id].externalSourceOfTruth).toBeUndefined();
  });
});
