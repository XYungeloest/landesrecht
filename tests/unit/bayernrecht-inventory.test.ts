/**
 * Strukturinventur des BayWü-Korpus (`inventory`).
 *
 * Die Inventur ist der Schritt, der entscheidet, ob ein Bulk-Lauf verantwortbar ist. Geprüft wird
 * deshalb nicht die Formulierung einzelner Meldungen, sondern das, worauf sich diese Entscheidung
 * stützt:
 *
 *   - **Jeder Ausgang kommt vor.** Acht Ausgänge sind benannt; jeder muss an einem echten
 *     Exportpaket erreichbar sein, sonst ist er eine Behauptung.
 *   - **Meldend, nicht abbrechend.** Ein Dokument, das scheitert, erzeugt einen Eintrag – keinen
 *     Abbruch des Laufs.
 *   - **Klassen statt Listen.** Zwei Dokumente mit demselben unbekannten Element an derselben
 *     Stelle stehen in **einer** Klasse; die Klasse zählt Dokumente, nicht Vorkommen.
 *   - **Textintegrität.** Leerraum, Typografie und Neuzusammensetzung sind erlaubt, Textverlust und
 *     Verdopplung nicht.
 *   - **Determinismus.** Zweimal derselbe Cache, zweimal dieselbe Datei – auch bei fortgesetztem
 *     Lauf über `--limit` und `--resume`.
 *   - **Kein Netz.** Ein fehlendes Paket ist `skipped-not-cached`, kein Fehler.
 *
 * Alle Prüfstücke stammen aus den echten Ausschnitten unter `tests/fixtures/bayernrecht/`. Wo ein
 * Ausgang eine Abweichung braucht, die im Beispielkorpus nicht vorkommt, ist sie am echten Ausschnitt
 * herbeigeführt – und zwar nach einem im Bestand belegten Muster (etwa der Fußnote in
 * `<titelangaben>`, die ARDStV und BayBadeGewV tragen).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { cacheKey } from '@landesrecht/importer-recht-nrw/common/fetcher.ts';
import { CACHE_DIR, type SourceArea } from '@landesrecht/importer-bayernrecht/common/constants.ts';
import { enumerationFingerprint, ENUMERATION_SCHEMA, type EnumerationFile, type EnumerationItem } from '@landesrecht/importer-bayernrecht/enumerate/enumeration.ts';
import { readXmlDocument } from '@landesrecht/importer-bayernrecht/parse/xml.ts';
import { assessTextIntegrity, inventoryDocument, notCachedEntry } from '@landesrecht/importer-bayernrecht/inventory/document.ts';
import { parseBayernRechtDocument } from '@landesrecht/importer-bayernrecht/parse/index.ts';
import { INVENTORY_OUTCOMES, TEXT_INTEGRITY_CLASSES, worstOutcome, type InventoryEntry, type InventoryOutcome } from '@landesrecht/importer-bayernrecht/inventory/model.ts';
import { clusterFindings, normalizeMessage } from '@landesrecht/importer-bayernrecht/inventory/signature.ts';
import { compareTextIntegrity } from '@landesrecht/importer-bayernrecht/inventory/text.ts';
import { inventoryClasses, inventoryJsonText, runInventory, writeInventory } from '@landesrecht/importer-bayernrecht/inventory/run.ts';
import { renderStructureReport, renderTextIntegrityReport } from '@landesrecht/importer-bayernrecht/inventory/report.ts';
import { buildZipArchive, fixture, imagePackage, vvPackage } from '../helpers/bayernrecht-parse.ts';
import { cleanupTempRoots, tempRoot } from '../helpers/bayernrecht-state.ts';

afterAll(cleanupTempRoots);

const NORM_XML = fixture('abmarkungsgesetz');
const NORM_MANIFEST = fixture('manifestAbmarkungsgesetz');

/** Exportpaket aus dem echten Ausschnitt; `xml` erlaubt die Abwandlung, die ein Ausgang braucht. */
function normArchive(xml: string = NORM_XML): Uint8Array {
  return buildZipArchive([
    { path: 'mimetype', content: 'bayportalnorm+zip' },
    { path: 'META-INF/manifest.xml', content: NORM_MANIFEST },
    { path: 'bayportalnorm/BayAbmG.xml', content: xml },
  ]);
}

function inventory(documentId: string, bytes: Uint8Array, sourceArea: SourceArea = 'landesrecht'): InventoryEntry {
  return inventoryDocument({
    documentId,
    sourceArea,
    title: `Titel ${documentId}`,
    url: `https://www.gesetze-bayern.de/Content/Zip/${documentId}`,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.byteLength,
  });
}

/* ------------------------------------------------------------------ Abwandlungen am echten Ausschnitt */

/** Unbekanntes Element an der Stelle von `<normzitat>`: die Quelle führt etwas, das das Modell nicht kennt. */
const UNKNOWN_ELEMENT_XML = NORM_XML.replace('<normzitat>', '<sonderregel>').replace('</normzitat>', '</sonderregel>');

/**
 * Fußnote in `<titelangaben>` nach dem Muster von ARDStV und BayBadeGewV: Der Ratifikations- bzw.
 * Umsetzungshinweis steht als `<fn.def>` im Titelblock.
 *
 * Der Parser verwarf ihn, solange er nur die Zeilen des Titelblocks weiterreichte; 179 Dokumente
 * meldeten dadurch Textverlust. Seit die Fußnote als Fußnotenblock im Körper steht, ist sie
 * erhalten – der Ausschnitt bleibt als Prüfstück genau dafür.
 */
const TITLE_FOOTNOTE_XML = NORM_XML.replace(
  'BayRS 219-2-F\n</titelangaben>',
  `BayRS 219-2-F<fn.call role="nichtamtlich"><fn.text /><fn.def><p>Das Gesetz wurde ratifiziert in: Baden-Württemberg: G v. 19.11.1991 (GBl. S. 745, ber. 1992 S. 188), Bayern: Bek. v. 18.12.1991 (GVBl. S. 451), Berlin: G v. 12.12.1991 (GVBl. S. 425).</p></fn.def></fn.call></titelangaben>`,
);

/**
 * Ein echtes Paket des Bestands, das Textverlust zeigt.
 *
 * Für diesen Ausgang gibt es bewusst **keinen** konstruierten Ausschnitt. Mehrere Versuche, einen zu
 * bauen, liefen ins Leere, weil der Parser den Text jeweils rettete – was für ihn spricht und gegen
 * das Prüfstück. Ein Ausgang, den man nur mit erfundenem XML erreicht, belegt nichts über den
 * Bestand. `BayAgrSchO` zeigt ihn an echten Daten (fehlende Wörter in
 * `<einzelnorm → jurAbsatz → absatz.text → p>`); fehlt das Paket, entfällt die Prüfung.
 */
const LOST_TEXT_DOCUMENT = 'BayAgrSchO';
const lostTextPackage = (): Uint8Array | undefined => {
  const file = join(CACHE_DIR, `${cacheKey(`https://www.gesetze-bayern.de/Content/Zip/${LOST_TEXT_DOCUMENT}`)}.bin`);
  try {
    return new Uint8Array(readFileSync(file));
  } catch {
    return undefined;
  }
};

/** Tabelle, deren zweite Zeile eine Spalte weniger trägt: das Zielschema verlangt ein volles Raster. */
const RAGGED_TABLE_XML = NORM_XML.replace(
  '</rumpf>',
  '<gliederung gliederungsid="G_9" version="p"><gliederung.titel><p>Gebührenverzeichnis</p></gliederung.titel><gliederung.text><table><colgroup><col /><col /></colgroup><tr><td><p>Nr.</p></td><td><p>Gegenstand</p></td></tr><tr><td><p>1</p></td></tr></table></gliederung.text></gliederung></rumpf>',
);

/** Bereits doppelt gebildeter Zielname im Quelltext: die Prüfung nach der Überleitung schlägt an. */
const DOUBLED_NAME_XML = NORM_XML.replace('Die Abmarkung', 'Die Abmarkung in Bayern-Württemberg-Württemberg');

/** Paket, dessen XML eine Bilddatei aufruft, die im Manifest nicht steht. */
function missingAssetArchive(): Uint8Array {
  const manifest = fixture('manifestBodenfischerei');
  const images = [...manifest.matchAll(/full-path="\/(img\/[^"]+)"/gu)].map((match) => match[1]!);
  return buildZipArchive([
    { path: 'mimetype', content: 'bayportalnorm+zip' },
    { path: 'META-INF/manifest.xml', content: manifest },
    { path: 'bayportalnorm/BayBoFiV.xml', content: fixture('bodenfischerei').replace('BayBoFiV_BayBoFiV-A2-N1.gif', 'BayBoFiV_BayBoFiV-A2-N9.gif') },
    ...images.map((path) => ({ path, content: `GIF89a ${path}` })),
  ]);
}

describe('Jeder Ausgang kommt an einem echten Exportpaket vor', () => {
  const outcomes = new Map<InventoryOutcome, InventoryEntry>();
  const record = (entry: InventoryEntry): InventoryEntry => {
    outcomes.set(entry.outcome, entry);
    return entry;
  };

  it('parsed: Gesetz ohne Befund läuft bis zur geprüften Zielnorm', () => {
    const entry = record(inventory('BayAbmG', normArchive()));
    expect(entry.outcome).toBe('parsed');
    expect(entry.phase).toBe('validate');
    expect(entry.dialect).toBe('byrecht-norm');
    expect(entry.slug).toBe('abmg-baywue');
    expect(entry.findings.every((finding) => finding.severity === 'info')).toBe(true);
  });

  it('parsed-with-warnings: Verwaltungsvorschrift läuft durch und meldet Hinweise', () => {
    const entry = record(inventory('BayVwV312180', vvPackage(), 'vwv'));
    expect(entry.outcome).toBe('parsed-with-warnings');
    expect(entry.dialect).toBe('byrecht-vv');
    expect(entry.findings.some((finding) => finding.severity === 'warning')).toBe(true);
  });

  it('unknown-structure: unbekanntes Element bricht den Lauf nicht ab, sondern wird benannt', () => {
    const entry = record(inventory('BayAbmG-unbekannt', normArchive(UNKNOWN_ELEMENT_XML)));
    expect(entry.outcome).toBe('unknown-structure');
    expect(entry.phase).toBe('parse');
    const finding = entry.findings.find((candidate) => candidate.code === 'unknown-element');
    expect(finding?.element).toBe('sonderregel');
    expect(finding?.parentPath).toBe('<rumpf>');
    expect(finding?.signature).toBe('unknown-element:<sonderregel> in <rumpf>');
    // Der Ausschnitt ist die Quellzeile, nicht die Meldung – sonst wäre er keine Fundstelle.
    expect(finding?.excerpt).toContain('sonderregel');
    expect(finding?.line).toBeGreaterThan(0);
  });

  const lostText = lostTextPackage();
  it.skipIf(!lostText)('früherer Textverlust an einem echten Paket ist behoben (Überschriftenumbruch als Wortgrenze)', () => {
    // BayAgrSchO meldete 28 fehlende Wörter und „StundentafelTechnikerschule“: `<br/>` in Überschriften wurde
    // ohne Leerraum zusammengezogen. Dass `mismatch` erkannt wird, belegt „Eine Integritätsprüfung für Inventur
    // und Bulk“ unten an einem gezielt beschädigten Körper.
    const entry = record(inventory(LOST_TEXT_DOCUMENT, lostText!));
    expect(entry.outcome).not.toBe('integrity-mismatch');
    expect(entry.textIntegrity?.class).not.toBe('mismatch');
    expect(entry.textIntegrity?.missing).toBe(0);
  });

  it('die Fußnote des Titelblocks bleibt erhalten und ist kein Textverlust mehr', () => {
    // Sie trägt bei Staatsverträgen die Ratifikationsliste aller Länder. Solange der Parser nur die
    // Zeilen des Titelblocks weiterreichte, ging sie verloren – 179 Dokumente meldeten Textverlust.
    const entry = record(inventory('BayAbmG-fussnote', normArchive(TITLE_FOOTNOTE_XML)));
    expect(entry.outcome).not.toBe('integrity-mismatch');
    expect(entry.textIntegrity?.class).not.toBe('mismatch');
  });

  it('eine kurze Tabellenzeile wird aufgefüllt statt die Norm zu verwerfen', () => {
    // Die Quelle führt kurze Zeilen wirklich (`<td colspan="1">nachrichtlich</td>` in einer
    // zweispaltigen Tabelle). Zuvor wurde nichts ergänzt, `validateNormRecord` lehnte ab, und die
    // **ganze** Norm fiel aus dem Bestand – zwölf Vorschriften mitsamt ihrem Text, wegen einer
    // leeren Zelle. Eine leere Zelle zu ergänzen verliert nichts und erfindet nichts.
    const entry = record(inventory('BayAbmG-tabelle', normArchive(RAGGED_TABLE_XML)));
    expect(entry.outcome).not.toBe('schema-failed');
    expect(entry.findings.some((finding) => finding.code === 'table-ragged')).toBe(true);
  });

  it('transform-failed: Doppelbildung des Zielnamens lässt die Prüfung nach der Überleitung scheitern', () => {
    const entry = record(inventory('BayAbmG-doppelt', normArchive(DOUBLED_NAME_XML)));
    expect(entry.outcome).toBe('transform-failed');
    expect(entry.phase).toBe('transform');
    expect(entry.findings.some((finding) => finding.code === 'post-transform-audit')).toBe(true);
  });

  it('missing-assets: im XML aufgerufene Datei fehlt im Paket', () => {
    const entry = record(inventory('BayBoFiV-fehlend', missingAssetArchive()));
    expect(entry.outcome).toBe('missing-assets');
    expect(entry.findings.some((finding) => finding.signature === 'referenced-file-missing:.gif')).toBe(true);
    expect(entry.attachments?.image).toBeGreaterThan(0);
  });

  it('source-corrupt: was kein ZIP ist, wird als beschädigte Quelle geführt', () => {
    const entry = record(inventory('BayAbmG-kaputt', new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04])));
    expect(entry.outcome).toBe('source-corrupt');
    expect(entry.phase).toBe('package');
    expect(entry.findings[0]?.code).toBe('package-unreadable');
    // Ohne Paket gibt es keine Textintegrität – und keine erfundene.
    expect(entry.textIntegrity).toBeUndefined();
  });

  it('skipped-not-cached: ein fehlendes Paket ist kein Fehler', () => {
    const entry = record(notCachedEntry('BayFehlt', 'landesrecht', 'Titel BayFehlt'));
    expect(entry.outcome).toBe('skipped-not-cached');
    expect(entry.findings).toEqual([]);
    expect(entry.sha256).toBe('');
  });

  it('kennt keinen weiteren Ausgang als die benannten', () => {
    // Geprüft wird, dass kein Ausgang **außerhalb** der benannten entsteht. Die Umkehrung – jeder
    // benannte Ausgang muss vorkommen – ist keine sinnvolle Zusage: `schema-failed` erreicht der
    // Bestand seit dem Rasterausgleich nicht mehr, und ihn mit erfundenem XML herbeizuführen
    // belegte nichts. Ein Ausgang, den niemand mehr auslöst, ist ein gutes Zeichen.
    for (const outcome of outcomes.keys()) expect(INVENTORY_OUTCOMES).toContain(outcome);
    expect(outcomes.size).toBeGreaterThanOrEqual(INVENTORY_OUTCOMES.length - 2);
  });

  it('gibt je Dokument genau einen Ausgang – der schwerste gewinnt', () => {
    expect(worstOutcome(['parsed-with-warnings', 'unknown-structure', 'missing-assets'])).toBe('unknown-structure');
    expect(worstOutcome(['parsed-with-warnings', 'integrity-mismatch'])).toBe('integrity-mismatch');
    expect(worstOutcome([])).toBe('parsed');
  });
});

describe('Klassen statt Listen', () => {
  it('fasst zwei Dokumente mit derselben Signatur zu einer Klasse zusammen', () => {
    const entries = [
      inventory('BayAbmG-a', normArchive(UNKNOWN_ELEMENT_XML)),
      inventory('BayAbmG-b', normArchive(UNKNOWN_ELEMENT_XML)),
    ];
    const classes = clusterFindings(entries);
    const cluster = classes.find((entry) => entry.signature === 'unknown-element:<sonderregel> in <rumpf>');
    expect(cluster?.documents).toBe(2);
    expect(cluster?.examples.map((example) => example.documentId)).toEqual(['BayAbmG-a', 'BayAbmG-b']);
    expect(cluster?.element).toBe('sonderregel');
  });

  it('trennt dieselbe Abweichung an verschiedenen Stellen in verschiedene Klassen', () => {
    const elsewhere = NORM_XML.replace('<aenderungsverlauf>', '<aenderungsverlauf><sonderregel>x</sonderregel>');
    const classes = clusterFindings([inventory('a', normArchive(UNKNOWN_ELEMENT_XML)), inventory('b', normArchive(elsewhere))]);
    const signatures = classes.filter((entry) => entry.code === 'unknown-element').map((entry) => entry.signature);
    expect(signatures).toHaveLength(2);
    expect(new Set(signatures).size).toBe(2);
  });

  it('nennt je Klasse höchstens fünf Beispiele und zählt die übrigen mit', () => {
    const entries = Array.from({ length: 7 }, (_, index) => inventory(`Dok${index}`, normArchive(UNKNOWN_ELEMENT_XML)));
    const cluster = clusterFindings(entries).find((entry) => entry.code === 'unknown-element');
    expect(cluster?.documents).toBe(7);
    expect(cluster?.examples).toHaveLength(5);
  });

  it('ordnet nach Zahl der betroffenen Dokumente absteigend, bei Gleichstand nach Signatur', () => {
    const classes = clusterFindings([
      inventory('a', normArchive(UNKNOWN_ELEMENT_XML)),
      inventory('b', normArchive(UNKNOWN_ELEMENT_XML)),
      inventory('c', normArchive()),
    ]);
    for (let index = 1; index < classes.length; index += 1) {
      const previous = classes[index - 1]!;
      const current = classes[index]!;
      expect(previous.documents > current.documents || (previous.documents === current.documents && previous.signature <= current.signature)).toBe(true);
    }
  });

  it('lässt aus der Signatur alles Veränderliche heraus: Zeile, Zahl, Dokument-ID, Zitatinhalt', () => {
    expect(normalizeMessage('BayAbmG: 12 Fußnoten in BayAbmG (Zeile 47)', 'BayAbmG')).toBe('# Fußnoten in <dok>');
    expect(normalizeMessage('Gliederungsüberschrift „Erster Teil“ ohne Gliederungswort', 'X')).toBe('Gliederungsüberschrift „…“ ohne Gliederungswort');
  });

  it('weist Slugkollisionen als eigene Klasse aus – sie hängen an zwei Dokumenten zugleich', () => {
    const classes = inventoryClasses([inventory('erste', normArchive()), inventory('zweite', normArchive())]);
    const collision = classes.find((entry) => entry.signature === 'slug-collision');
    expect(collision?.documents).toBe(2);
    expect(collision?.examples[0]?.excerpt).toContain('abmg-baywue');
  });
});

describe('Textintegrität: sichtbarer Quelltext gegen kanonischen Text', () => {
  /** Rumpf einer Verwaltungsvorschrift – die kürzeste echte Form beider Modelle. */
  const vvRoot = (body: string) => readXmlDocument(`<byrecht-vv><textdaten><vv1.0><rumpf>${body}</rumpf></vv1.0></textdaten></byrecht-vv>`).root;
  const compare = (body: string, canonical: string, explained?: Array<{ reason: string; text: string }>) =>
    compareTextIntegrity({ dialect: 'byrecht-vv', root: vvRoot(body), canonicalParts: [canonical], ...(explained ? { explained } : {}) });

  const SENTENCE = 'Diese Richtlinien sind maßgeblich für die Formulierung der Gesetze, Verordnungen und Satzungen des Landes.';

  it('exact: dieselbe Wortfolge, es musste nichts normalisiert werden', () => {
    expect(compare(`<p>${SENTENCE}</p>`, SENTENCE).class).toBe('exact');
    // Leerraum und Zeichensetzung unterscheiden nicht: Verglichen werden Wörter, nicht Zeichen.
    expect(compare('<p>Die „Redaktionsrichtlinien“ – kurz RedR – gelten.</p>', 'Die "Redaktionsrichtlinien" - kurz RedR - gelten.').class).toBe('exact');
  });

  it('normalized-equivalent: Typografie im Wort und Neuzusammensetzung ohne Verlust', () => {
    // Satznummer als Element in der Quelle, als Unicode-Hochzahl im Zielmodell.
    expect(compare(`<p><sup>1</sup>${SENTENCE}</p>`, `¹${SENTENCE}`).class).toBe('normalized-equivalent');
    // Strukturelle Neuzusammensetzung: zwei Quellabsätze in umgekehrter Reihenfolge, kein Verlust.
    expect(compare('<p>Geltungsbereich</p><p>Aufbau</p>', 'Aufbau Geltungsbereich').class).toBe('normalized-equivalent');
  });

  it('explained-difference: der Unterschied ist durch einen benannten Befund gedeckt', () => {
    const result = compare(`<p>${SENTENCE}</p>`, `103-S ${SENTENCE}`, [{ reason: 'division-number-before-title', text: '103-S' }]);
    expect(result.class).toBe('explained-difference');
    expect(result.explanations).toEqual(['division-number-before-title']);
    expect(result.missing).toBe(0);
    expect(result.extra).toBe(0);
  });

  it('review: wenige unerklärte Wörter bleiben ein Einzelfall', () => {
    const result = compare(`<p>${SENTENCE}</p>`, SENTENCE.replace(' des Landes.', '.'));
    expect(result.class).toBe('review');
    expect(result.missing).toBe(2);
  });

  it('mismatch: ein verlorener Satz ist ein Importhindernis', () => {
    const result = compare(`<p>${SENTENCE}</p><p>Für veröffentlichte Verwaltungsvorschriften gilt Nummer acht entsprechend.</p>`, SENTENCE);
    expect(result.class).toBe('mismatch');
    expect(result.lostExcerpt).toContain('Verwaltungsvorschriften');
  });

  it('mismatch: eine Verdopplung ist ebenso ein Importhindernis', () => {
    const result = compare(`<p>${SENTENCE}</p>`, `${SENTENCE} ${SENTENCE}`);
    expect(result.class).toBe('mismatch');
    expect(result.extra).toBeGreaterThan(3);
    expect(result.duplicatedExcerpt).toBeTruthy();
  });

  it('kennt genau die fünf benannten Klassen', () => {
    expect([...TEXT_INTEGRITY_CLASSES]).toEqual(['exact', 'normalized-equivalent', 'explained-difference', 'review', 'mismatch']);
  });

  it('hält Abbildungen aus der Integrität heraus: <graphic> trägt keinen sichtbaren Text, die Beschreibung ist kein Normtext', () => {
    const entry = inventory('BayBoFiV', imagePackage());
    expect(entry.codes).toContain('figures-transferred');
    expect(entry.codes).not.toContain('graphic-not-transferred');
    expect(entry.textIntegrity?.class === 'mismatch').toBe(false);
  });
});

/* ------------------------------------------------------------------ Lauf über den Bestand */

function enumerationItem(documentId: string): EnumerationItem {
  return {
    key: documentId,
    sourceIdentity: documentId,
    documentId,
    title: `Titel ${documentId}`,
    titleSource: 'fortfuehrungsnachweis',
    normType: 'ges',
    normTypeSource: 'facet-hitlist',
    sourceUrl: `https://www.gesetze-bayern.de/Content/Document/${documentId}`,
    zipUrl: `https://www.gesetze-bayern.de/Content/Zip/${documentId}`,
    listingUrl: 'https://www.gesetze-bayern.de/Content/Document/ffn',
    sourceSha256: 'b'.repeat(64),
    retrievedAt: '2026-09-17T07:48:50.997Z',
    listings: [{ kind: 'fortfuehrungsnachweis', url: 'https://www.gesetze-bayern.de/Content/Document/ffn', sha256: 'b'.repeat(64), retrievedAt: '2026-09-17T07:48:50.997Z' }],
    status: 'pending',
    signals: { fortfuehrungsnachweis: true, facet: true, manifest: false },
    attempts: 0,
  };
}

function enumerationFixture(area: SourceArea, items: EnumerationItem[]): EnumerationFile {
  const file: EnumerationFile = {
    schemaVersion: ENUMERATION_SCHEMA,
    sourceArea: area,
    baselineDate: '2023-12-01',
    generatedAt: '2026-09-17T09:38:02.482Z',
    contentFingerprint: '',
    sources: {
      fortfuehrungsnachweis: { url: 'https://www.gesetze-bayern.de/Content/Document/ffn', sha256: 'b'.repeat(64), retrievedAt: '2026-09-17T07:48:50.997Z', byteLength: 1000, entries: items.length, sections: 1, unlinkedRows: 0 },
      facets: { normTypes: ['ges'], pages: 1, documents: items.length, total: items.length, complete: true, inventoryPath: 'data/audits/bayernrecht/facet-inventory.json', inventoryFingerprint: 'c'.repeat(64) },
    },
    crosscheck: {
      fortfuehrungsnachweisEntries: items.length,
      fortfuehrungsnachweisUnlinkedRows: 0,
      facetDocuments: items.length,
      facetTotal: items.length,
      inBoth: items.length,
      onlyFortfuehrungsnachweis: 0,
      onlyFacet: 0,
      onlyFortfuehrungsnachweisIds: [],
      onlyFacetIds: [],
      items: items.length,
      withNormType: items.length,
      withBayRsNumber: 0,
      carriedFromManifest: 0,
      duplicateIds: 0,
      ok: true,
      problems: [],
      notes: [],
    },
    items,
  };
  return { ...file, contentFingerprint: enumerationFingerprint(file) };
}

/** Cacheeintrag genau in der Form, die der gemeinsame Fetcher schreibt. */
async function seedCache(root: string, documentId: string, bytes: Uint8Array): Promise<void> {
  const url = `https://www.gesetze-bayern.de/Content/Zip/${documentId}`;
  const directory = join(root, CACHE_DIR);
  await mkdir(directory, { recursive: true });
  const key = cacheKey(url);
  await writeFile(join(directory, `${key}.bin`), bytes);
  await writeFile(
    join(directory, `${key}.json`),
    `${JSON.stringify({ url, finalUrl: url, status: 200, contentType: 'application/zip', retrievedAt: '2026-09-18T00:26:51.116Z', sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength }, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Temporäres Root mit Scope, Enumeration und Cache – der echte Bestand wird nie angefasst.
 * `cached` sind Kandidaten mit Paket, `absent` solche ohne, `excluded` fällt schon im Scope heraus.
 */
async function fixtureRoot(cached: Record<string, Uint8Array>, absent: string[] = [], excluded: string[] = []): Promise<string> {
  const root = await tempRoot('landesrecht-bayernrecht-inventory-');
  await mkdir(join(root, 'data/imports/bayernrecht'), { recursive: true });
  const ids = [...Object.keys(cached), ...absent, ...excluded].sort();
  await writeFile(
    join(root, 'data/imports/bayernrecht/enumeration-landesrecht.json'),
    JSON.stringify(enumerationFixture('landesrecht', ids.map((id) => enumerationItem(id))), null, 2),
    'utf8',
  );
  await writeFile(
    join(root, 'data/imports/bayernrecht/scope.json'),
    JSON.stringify({
      schemaVersion: 'bayernrecht-scope/1',
      baselineDate: '2023-12-01',
      generatedAt: '2026-09-18',
      totals: { documents: ids.length, byDecision: { include: ids.length - excluded.length, exclude: excluded.length, review: 0 }, byReason: {}, byArea: {} },
      entries: ids.map((documentId) => ({
        documentId,
        sourceArea: 'landesrecht',
        normType: 'ges',
        title: `Titel ${documentId}`,
        decision: excluded.includes(documentId) ? 'exclude' : 'include',
        reason: excluded.includes(documentId) ? 'collective-agreement-out-of-landesrecht-scope' : 'state-law-in-scope',
        evidence: ['enumeration:facet-hitlist'],
      })),
    }, null, 2),
    'utf8',
  );
  for (const [documentId, bytes] of Object.entries(cached)) await seedCache(root, documentId, bytes);
  return root;
}

describe('Lauf über den Bestand: Cache, Budget, Wiederaufnahme', () => {
  it('prüft nur include-Kandidaten und führt ein fehlendes Paket als skipped-not-cached', async () => {
    const root = await fixtureRoot({ BayAbmG: normArchive(), BayVwV312180: vvPackage() }, ['BayFehlt'], ['ATV']);
    const { file } = await runInventory({ root });
    expect(file.totals.candidates).toBe(3);
    expect(file.totals.checked).toBe(2);
    expect(file.totals.notCached).toBe(1);
    expect(file.entries.map((entry) => entry.documentId)).toEqual(['BayAbmG', 'BayFehlt', 'BayVwV312180']);
    expect(file.entries.find((entry) => entry.documentId === 'BayFehlt')?.outcome).toBe('skipped-not-cached');
    // Der ausgeschlossene Eintrag ist kein Kandidat – er taucht gar nicht auf.
    expect(file.entries.some((entry) => entry.documentId === 'ATV')).toBe(false);
  });

  it('schreibt über denselben Cache zweimal dieselbe Datei', async () => {
    const root = await fixtureRoot({ BayAbmG: normArchive(), BayBoFiV: imagePackage(), BayVwV312180: vvPackage() }, ['BayFehlt']);
    const first = await runInventory({ root });
    const second = await runInventory({ root });
    expect(inventoryJsonText(second.file)).toBe(inventoryJsonText(first.file));
    // Kein Tagesdatum, keine Laufzeit: Die Datei nennt nur den Auswertungsstichtag.
    expect(first.file.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(inventoryJsonText(first.file)).not.toMatch(/durationMs|"retrievedAt"|builddate="\d/u);
  });

  it('kommt in Abschnitten zum selben Ergebnis wie in einem Lauf (--limit und --resume)', async () => {
    const packages = { BayAbmG: normArchive(), BayBoFiV: imagePackage(), BayVwV312180: vvPackage() };
    const whole = await runInventory({ root: await fixtureRoot(packages) });

    const root = await fixtureRoot(packages);
    const first = await runInventory({ root, limit: 2 });
    expect(first.processed).toBe(2);
    expect(first.stoppedAtLimit).toBe(true);
    expect(first.file.totals.pending).toBe(1);
    await writeInventory(root, first.file);

    const second = await runInventory({ root, resume: true });
    expect(second.reused).toBe(2);
    expect(second.processed).toBe(1);
    expect(second.file.totals.pending).toBe(0);
    expect(inventoryJsonText(second.file)).toBe(inventoryJsonText(whole.file));
  });

  it('beendet den Lauf nicht, wenn ein Dokument scheitert', async () => {
    const root = await fixtureRoot({ BayAbmG: normArchive(), BayKaputt: new Uint8Array([0, 1, 2, 3]), BayVwV312180: vvPackage() });
    const { file } = await runInventory({ root });
    expect(file.totals.checked).toBe(3);
    expect(file.totals.byOutcome['source-corrupt']).toBe(1);
    expect(file.entries.filter((entry) => entry.outcome === 'parsed' || entry.outcome === 'parsed-with-warnings')).toHaveLength(2);
  });

  it('zählt die Kennzahlen, nach denen die Bereitschaftsfrage gestellt ist', async () => {
    const root = await fixtureRoot({ BayAbmG: normArchive(), BayBoFiV: imagePackage(), BayVwV312180: vvPackage() });
    const { file } = await runInventory({ root });
    expect(Object.keys(file.totals.byDialect).sort()).toEqual(['byrecht-norm', 'byrecht-vv']);
    expect(file.totals.byNormType['gesetz']).toBeTruthy();
    expect(file.totals.signals.imageAttachments.documents).toBe(1);
    expect(file.totals.signals.imageAttachments.withFigures).toBe(1);
    expect(file.totals.signals.imageAttachments.withGraphicFinding).toBe(0);
    expect(file.totals.signals.imageAttachments.withoutGraphicFinding).toBe(1);
  });

  it('berichtet die Klassen nach Zahl der Dokumente und die Integritätsklassen mit Beleg', async () => {
    const root = await fixtureRoot({ BayAbmG: normArchive(), BayFussnote: normArchive(TITLE_FOOTNOTE_XML), BayVwV312180: vvPackage() });
    const { file } = await runInventory({ root });
    const structure = renderStructureReport(file);
    expect(structure).toContain('Strukturinventur des BayWü-Korpus');
    expect(structure).toContain('Strukturklassen');
    expect(structure).toContain('BayFussnote');
    const integrity = renderTextIntegrityReport(file);
    expect(integrity).toContain('Importhindernis');
    expect(integrity).toContain('`mismatch`');
    // Zweimal derselbe Bestand, zweimal derselbe Bericht.
    expect(renderStructureReport(file)).toBe(structure);
  });
});

describe('Eine Integritätsprüfung für Inventur und Bulk', () => {
  // Früher prüfte nur die Inventur; der Bulk übernahm Normen, die sie als `mismatch` meldete. Beide rufen jetzt
  // `assessTextIntegrity` – hier der Nachweis, dass sie Textverlust erkennt und Titelfußnoten erklärt.
  const xml = fixture('abmarkungsgesetz');
  const parsed = () => parseBayernRechtDocument({ portal: 'bayernrecht', url: 'https://www.gesetze-bayern.de/Content/Zip/BayAbmG', retrievedAt: '2026-09-18', mediaType: 'application/zip', sha256: 'a'.repeat(64) }, xml);

  it('meldet einen verlorenen Absatz als mismatch', () => {
    const document = parsed();
    expect(['exact', 'normalized-equivalent', 'explained-difference']).toContain(assessTextIntegrity(document, xml).class);
    const dropLongest = (blocks: typeof document.law.body): typeof document.law.body => blocks.map((block) => ({ ...block, ...(block.text && block.text.length > 200 ? { text: '' } : {}), ...(block.children ? { children: dropLongest(block.children) } : {}) }));
    const damaged = { ...document, law: { ...document.law, body: dropLongest(document.law.body) } };
    expect(assessTextIntegrity(damaged, xml).class).toBe('mismatch');
  });

  it('erklärt Zeichen und Ersatzmarken von Titelfußnoten, die der Parser im Körper führt', () => {
    const withTitleFootnotes = xml.replace(/<titelangaben>([\s\S]*?)<\/titelangaben>/u, (_match, inner: string) => `<titelangaben>${inner}<fn.call><fn.text>1)</fn.text><fn.def><p>Amtlicher Hinweis zur Umsetzung einer Richtlinie.</p></fn.def></fn.call><fn.call><fn.text /><fn.def><p>Ratifiziert in allen Ländern.</p></fn.def></fn.call></titelangaben>`);
    const document = parseBayernRechtDocument({ portal: 'bayernrecht', url: 'https://www.gesetze-bayern.de/Content/Zip/BayAbmG', retrievedAt: '2026-09-18', mediaType: 'application/zip', sha256: 'a'.repeat(64) }, withTitleFootnotes);
    expect(['exact', 'normalized-equivalent', 'explained-difference']).toContain(assessTextIntegrity(document, withTitleFootnotes).class);
  });
});
