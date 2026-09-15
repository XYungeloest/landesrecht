import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isImportableLrgvType, normalizeVersionUrl, parseGermanDate, parseGermanLongDate, parseTaxonomyTermId, parseVersionUrl, stemIdentifier } from '@landesrecht/importer-recht-nrw/source-identity.ts';
import { parseVersionPage } from '@landesrecht/importer-recht-nrw/version-page.ts';
import { splitTitle, looksLikeAbbreviation } from '@landesrecht/importer-recht-nrw/normalize.ts';

const fixtures = join(process.cwd(), 'tests', 'fixtures', 'recht-nrw');
const fixture = (name: string): string => readFileSync(join(fixtures, name), 'utf8');

describe('Quellidentität', () => {
  it('zerlegt Fassungsadressen und normalisiert sie', () => {
    const address = parseVersionUrl('https://recht.nrw.de/lrgv/gesetz/16122023-gesetz-ueber-den-oeffentlichen-personennahverkehr-nordrhein-westfalen-oepnvg/?x=1');
    expect(address).toMatchObject({ section: 'lrgv', documentType: 'gesetz', pathDate: '2023-12-16', slug: 'gesetz-ueber-den-oeffentlichen-personennahverkehr-nordrhein-westfalen-oepnvg' });
    expect(address?.url).toBe('https://recht.nrw.de/lrgv/gesetz/16122023-gesetz-ueber-den-oeffentlichen-personennahverkehr-nordrhein-westfalen-oepnvg');
    expect(parseVersionUrl('/lrgv/rechtsverordnung/27072013-verordnung-x')?.documentType).toBe('rechtsverordnung');
    expect(parseVersionUrl('https://recht.nrw.de/lrmb/verwaltungsvorschrift/irgendwas')).toBeNull();
    expect(parseVersionUrl('https://example.org/lrgv/gesetz/01012020-x')).toBeNull();
    expect(normalizeVersionUrl('/lrgv/gesetz/01012020-x/')).toBe('https://recht.nrw.de/lrgv/gesetz/01012020-x');
  });

  it('nutzt die Taxonomie-Term-ID als stabile Stammnorm-Kennung', () => {
    expect(parseTaxonomyTermId('/taxonomy/term/28924')).toBe('28924');
    expect(parseTaxonomyTermId('/lrgv/gesetz/x')).toBeUndefined();
    expect(stemIdentifier('28924')).toEqual({ system: 'recht-nrw', value: 'term:28924', url: 'https://recht.nrw.de/taxonomy/term/28924' });
  });

  it('unterscheidet importierbare LRGV-Dokumentarten', () => {
    expect(isImportableLrgvType('gesetz')).toBe(true);
    expect(isImportableLrgvType('rechtsverordnung')).toBe(true);
    expect(isImportableLrgvType('verwaltungsvorschrift')).toBe(false);
    expect(isImportableLrgvType('bekanntmachung')).toBe(false);
  });

  it('parst deutsche Datumsangaben', () => {
    expect(parseGermanDate('19.12.2008')).toBe('2008-12-19');
    expect(parseGermanDate('31.02.2008')).toBeUndefined();
    expect(parseGermanLongDate('Vom 5. April 2005 (Fn 1)')).toBe('2005-04-05');
    expect(parseGermanLongDate('Vom 1. März 1995')).toBe('1995-03-01');
  });
});

describe('Fassungsseite (Legacy-Format)', () => {
  const page = parseVersionPage(fixture('version-page-legacy.html'), 'https://recht.nrw.de/lrgv/gesetz/01012020-testgesetz-nordrhein-westfalen-testg-nrw');

  it('liest Titel, Gültigkeit, Stammnorm und Textformat', () => {
    expect(page.title).toBe('Testgesetz für das Land Nordrhein-Westfalen (Testgesetz NRW – TestG NRW)');
    expect(page.validFrom).toBe('2020-01-01');
    expect(page.validTo).toBe('2023-12-15');
    expect(page.stemTermId).toBe('424242');
    expect(page.content).toEqual({ format: 'legacy-file', fileUrl: 'https://recht.nrw.de/system/files/BH/9999-1.htm' });
    expect(page.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('liest die Fassungsliste mit aktueller Seite und nicht darstellbaren Fassungen', () => {
    expect(page.versions.map((entry) => [entry.validFrom, entry.isCurrentPage, entry.notRenderable, Boolean(entry.url)])).toEqual([
      ['2023-12-16', false, false, true],
      ['2020-01-01', true, false, false],
      ['2005-01-06', false, true, false],
      ['2000-01-01', false, false, true],
    ]);
  });
});

describe('Fassungsseite (natives Format)', () => {
  const page = parseVersionPage(fixture('version-page-native.html'), 'https://recht.nrw.de/lrgv/rechtsverordnung/30032018-testverordnung-nordrhein-westfalen-testvo-nrw');

  it('liest Ausfertigungsdatum, Fundstelle, Vollzitat, Änderungshistorie, Anlagen und PDF', () => {
    expect(page.issuedOn).toBe('2006-11-16');
    expect(page.promulgation).toBe('GV. NRW. 2006 S. 516');
    expect(page.fullCitation).toMatch(/^Testverordnung vom 16\. November 2006/u);
    expect(page.changeHistory).toMatch(/in Kraft getreten am 30\. März 2018/u);
    expect(page.validTo).toBeUndefined();
    expect(page.attachments).toEqual([
      { label: 'Anlage (HTM)', url: 'https://recht.nrw.de/system/files/BA/4242-1-anlage.htm', mediaType: 'text/html', accessible: true },
      { label: 'Anlage 2 (PDF)', url: 'https://recht.nrw.de/system/files/BA/4242-2-anlage.pdf', mediaType: 'application/pdf', accessible: false },
    ]);
    expect(page.pdfUrl).toBe('https://recht.nrw.de/system/files/pdf/state-law-and-regulations/2006/11/17/8b126d/2018-03-30-testverordnung.pdf');
    expect(page.content.format).toBe('native');
    expect(page.findings.map((finding) => finding.code)).toContain('unknown-info-field');
  });

  it('meldet ein Gültigkeitsende vor dem Beginn als Fehler', () => {
    const html = fixture('version-page-native.html').replace('<div class="field__label">Gültig ab</div><div class="field__item"> 30.03.2018 </div></div>', '<div class="field__label">Gültig ab</div><div class="field__item"> 30.03.2018 </div></div><div class="info-box-item"><div class="field__label">Gültig bis</div><div class="field__item"> 29.03.2018 </div></div>');
    const broken = parseVersionPage(html, 'https://recht.nrw.de/lrgv/rechtsverordnung/30032018-testverordnung-nordrhein-westfalen-testvo-nrw');
    expect(broken.findings.some((finding) => finding.code === 'invalid-validity-interval' && finding.severity === 'error')).toBe(true);
  });
});

describe('Titelzerlegung', () => {
  it('trennt Langtitel, Kurzbezeichnung und Abkürzung nach den RECHT.NRW-Mustern', () => {
    expect(splitTitle('Verwaltungsverfahrensgesetz für das Land Nordrhein-Westfalen (Verwaltungsverfahrensgesetz NRW – VwVfG NRW)')).toEqual({ title: 'Verwaltungsverfahrensgesetz für das Land Nordrhein-Westfalen', shortTitle: 'Verwaltungsverfahrensgesetz NRW', abbr: 'VwVfG NRW' });
    expect(splitTitle('Abgeordnetengesetz des Landes Nordrhein-Westfalen – AbgG NRW –')).toEqual({ title: 'Abgeordnetengesetz des Landes Nordrhein-Westfalen', abbr: 'AbgG NRW' });
    expect(splitTitle('Gemeindeordnung für das Land Nordrhein-Westfalen (GO NRW), Bekanntmachung der Neufassung')).toEqual({ title: 'Gemeindeordnung für das Land Nordrhein-Westfalen, Bekanntmachung der Neufassung', abbr: 'GO NRW' });
    expect(splitTitle('Gesetz zur Ausführung des Betreuungsgesetzes (Landesbetreuungsgesetz - LBtG)')).toEqual({ title: 'Gesetz zur Ausführung des Betreuungsgesetzes', shortTitle: 'Landesbetreuungsgesetz', abbr: 'LBtG' });
    expect(splitTitle('Verfassung für das Land Nordrhein-Westfalen')).toEqual({ title: 'Verfassung für das Land Nordrhein-Westfalen' });
    expect(looksLikeAbbreviation('ÖPNVG NRW')).toBe(true);
    expect(looksLikeAbbreviation('Bekanntmachung der Neufassung')).toBe(false);
  });
});
