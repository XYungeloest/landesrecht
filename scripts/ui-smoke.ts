#!/usr/bin/env node
/** Read-only checks against the locally rendered UI, complementing the responsive browser audit. */
import assert from 'node:assert/strict';
import { byTag, hasClass, parseHtml, queryAll, normalizedText, auditOutlineAnchors } from './lib/html-audit.ts';
import { getJurisdictionUrl, getNormUrl, getNormSubpageUrl, getNormVersionUrl, getPublicationUrl, getPublicationsUrl, getSearchUrl, PORTAL_PATHS } from '@landesrecht/legal-core/lib/routes.ts';

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
