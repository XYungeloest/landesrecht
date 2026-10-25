#!/usr/bin/env node
/** Read-only checks against the locally rendered UI, complementing the responsive browser audit. */
import assert from 'node:assert/strict';
import { byTag, hasClass, parseHtml, queryAll, normalizedText, auditOutlineAnchors, auditAccessibility } from './lib/html-audit.ts';
import { getJurisdictionUrl, getNormUrl, getNormSubpageUrl, getNormVersionUrl, getProvisionUrl, getSubjectsUrl, getPublicationUrl, getPublicationsUrl, getSearchUrl, PORTAL_PATHS } from '@landesrecht/legal-core/lib/routes.ts';

const baseIndex = process.argv.indexOf('--base');
const base = (baseIndex >= 0 ? process.argv[baseIndex + 1] : undefined) ?? 'http://localhost:4321';
const load = async (path: string) => {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  return parseHtml(await response.text());
};
const classes = (document: ReturnType<typeof parseHtml>, name: string) => queryAll(document, (element) => hasClass(element, name));
const paths = [PORTAL_PATHS.home, getJurisdictionUrl('west'), PORTAL_PATHS.changes, getSearchUrl({ q: 'Schule', jurisdiction: 'west' }), getNormUrl('west', 'abgg-west'), getNormUrl('west', 'lnatschg-west'), getNormUrl('west', 'kjrg-west'), getNormUrl('west', 'schulg-west'), getNormVersionUrl('west', 'lnatschg-west', '2023-12-01'), getNormSubpageUrl('west', 'lnatschg-west', 'vergleich'), getNormSubpageUrl('west', 'lnatschg-west', 'historie'), getNormSubpageUrl('west', 'lnatschg-west', 'quellen'), getPublicationsUrl('west'), getPublicationUrl('west', 'gv-west-2024-1-20240223'), PORTAL_PATHS.about];
for (const path of paths) {
  const document = await load(path);
  assert.equal(byTag(document, 'h1').length, 1, path);
  if (classes(document, 'norm-document').length) assert.deepEqual(auditOutlineAnchors(document).missing, [], path);
  if (path === PORTAL_PATHS.home) assert(!normalizedText(document).includes('mit allen Änderungen der Simulation'));
  if (path === getNormSubpageUrl('west', 'lnatschg-west', 'vergleich')) {
    assert(byTag(document, 'del', 'ins').length > 0, 'Wortänderungen sichtbar');
    assert(classes(document, 'comparison-columns').length > 0);
  }
  console.log(`✓ ${path}`);
}
const listing = await load(getJurisdictionUrl('west'));
assert.equal(classes(listing, 'stand-tabs').length, 1);
assert.equal(classes(listing, 'letter-nav').length, 1);
for (const rel of ['next']) {
  const next = byTag(listing, 'a').find((link) => link.attrs.rel === rel);
  assert(next?.attrs.href, 'Seitennavigation');
  const document = await load(next.attrs.href);
  assert(byTag(document, 'a').some((link) => link.attrs.rel === 'prev'));
}
const letters = classes(listing, 'letter-nav')[0]!;
const letter = byTag(letters, 'a').find((link) => link.attrs.href?.includes('buchstabe='));
assert(letter?.attrs.href, 'A–Z');
assert(byTag(await load(letter.attrs.href), 'a').some((link) => link.attrs['aria-current'] === 'true' && link.attrs.href?.includes('buchstabe=')));
for (const stand of ['changed', 'new', 'unchanged']) {
  const document = await load(getSearchUrl({ stand }));
  assert(classes(document, 'hit').length > 0, `Filter ohne Suchbegriff: ${stand}`);
  assert(byTag(document, 'dialog').some((dialog) => dialog.attrs.id === 'filter-dialog'));
}
const norm = await load(getNormUrl('west', 'lnatschg-west'));
assert.equal(classes(norm, 'copy-action').length, 2);
console.log('UI-Smoke: 15 Seitentypen, A–Z, Pagination, Filter ohne Begriff, Vergleich und Anker erfolgreich.');

// Einzelvorschriften behalten die Anker der gewählten Gesamtfassung und zeigen nur ihre Einheit.
for (const versionId of [undefined, '2023-12-01']) {
  const path = getProvisionUrl('west', 'lnatschg-west', 'paragraph-1', versionId);
  const document = await load(path);
  assert.equal(byTag(document, 'h1').length, 1);
  assert.deepEqual(auditAccessibility(document), [], 'Barrierefreiheit der Einzelansicht');
  const units = queryAll(document, (element) => 'data-norm-unit' in element.attrs);
  assert.equal(units.length, 1, 'nur eine Einzelvorschrift');
  assert.equal(units[0]!.attrs.id, 'paragraph-1');
  assert(normalizedText(document).includes('Zitat kopieren'));
  assert(byTag(document, 'a').some((link) => link.attrs.rel === 'next' && link.attrs.href?.endsWith('/paragraph-2/')));
  assert(byTag(document, 'a').some((link) => link.attrs.href?.endsWith('/#paragraph-1')));
  console.log(`✓ Einzelvorschrift ${path}`);
}
for (const anchor of ['paragraph-99999', 'zitat-paragraph-1']) {
  assert.equal((await fetch(new URL(getProvisionUrl('west', 'lnatschg-west', anchor), base))).status, 404);
}
const searchDocument = await load(getSearchUrl({ q: 'Schule', bereich: 'alle', jurisdiction: 'west' }));
assert.equal(queryAll(searchDocument, (element) => element.tag === 'select' && element.attrs.name === 'bereich').length, 1);
assert(byTag(searchDocument, 'option').some((option) => option.attrs.value === 'alle' && 'selected' in option.attrs));
console.log('Einzelvorschriften: aktuelle/historische Fassung, Navigation, Originalanker und 404; Suchumfang erfolgreich.');

for (const [jurisdiction, slug, anchor] of [
  ['nsh', 'gesetz-zum-abkommen-zwischen-der-freien-und-hansestadt-hamburg-und-dem-nsh', 'paragraph-1'],
  ['baywue', 'gesetz-ueber-die-gutachterstelle-fuer-die-freiwillige-kastration-und-baywue', 'artikel-1'],
] as const) {
  const document = await load(getProvisionUrl(jurisdiction, slug, anchor));
  assert(queryAll(document, (element) => element.attrs.id === anchor).length === 1);
  assert.deepEqual(auditAccessibility(document), []);
  console.log(`✓ ${jurisdiction}: Einzelansicht ${anchor}`);
}

const subjects = await load(getSubjectsUrl());
assert.equal(byTag(subjects, 'h1').length, 1);
assert(classes(subjects, 'subject-card').length > 0);
assert.deepEqual(auditAccessibility(subjects), []);
const subjectPath = getSubjectsUrl('bildung-kultur','nsh');
const subject = await load(subjectPath);
assert.deepEqual(auditAccessibility(subject), []);
assert.equal(classes(subject,'hit').length,50);
const subjectNext = byTag(subject,'a').find((link) => link.attrs.rel === 'next');
const nextSubjectUrl = subjectNext?.attrs.href;
assert(nextSubjectUrl, 'Sachgebiets-Pagination fehlt');
assert(nextSubjectUrl.includes('land=nsh') && nextSubjectUrl.includes('seite=2'));
const nextSubject = await load(nextSubjectUrl);
assert(classes(nextSubject,'hit').length > 0);
const subjectSearch = await load(getSearchUrl({ subject:'bildung-kultur',jurisdiction:'nsh',bereich:'alle',q:'Hochschule' }));
assert(queryAll(subjectSearch,(element) => element.tag === 'input' && element.attrs.name === 'subject' && element.attrs.value === 'bildung-kultur' && 'checked' in element.attrs).length === 1);
assert.equal((await fetch(new URL(getSubjectsUrl('unknown'),base))).status,404);
assert.equal((await fetch(new URL(getSubjectsUrl('bildung-kultur','west'),base),{redirect:'manual'})).status,303);
console.log('Sachgebiete: Übersicht, Länderwahl, Facetten, Pagination, Suchfilter, Accessibility und leere/ungültige Gruppen erfolgreich.');
