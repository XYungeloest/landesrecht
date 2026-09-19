/**
 * Einzelfassungen eines Rahmendokuments laden: Kennungen aus der (gecachten) Sitemap, PDFs über den
 * öffentlichen Ausgabeweg („genau dieses Dokument“, ohne `docPart`).
 */
import { SITEMAP_INDEX_URL } from '../access/policy.ts';
import { decodeHtml, type JurisShFetcher } from '../common/fetcher.ts';
import { parseSitemapLocations, unitIdsByFrame } from '../enumerate/sitemap.ts';
import { pdfExportUrl, type ExportClient } from '../export/client.ts';
import { readUnit, unitNumber, type UnitVersion } from './historical.ts';

/** Einheiten je Rahmendokument aus der Sitemap (aus dem Cache; ohne Cache ein Abruf von Index und Teil-Sitemaps). */
export async function sitemapUnits(fetcher: JurisShFetcher): Promise<Map<string, string[]>> {
  const index = parseSitemapLocations(decodeHtml(await fetcher.fetch(SITEMAP_INDEX_URL)), 'sitemapindex');
  const lists: string[][] = [];
  for (const url of index) lists.push(parseSitemapLocations(decodeHtml(await fetcher.fetch(url)), 'urlset'));
  return unitIdsByFrame(lists);
}

export async function loadUnits(client: ExportClient, unitIds: readonly string[]): Promise<UnitVersion[]> {
  const units: UnitVersion[] = [];
  for (const id of [...unitIds].sort((left, right) => unitNumber(left) - unitNumber(right))) {
    const pdf = await client.pdf(id, 'dokument');
    units.push(readUnit(pdf.bytes, id, { url: pdfExportUrl(id, 'dokument'), sha256: pdf.sha256, byteLength: pdf.bytes.byteLength, retrievedAt: pdf.retrievedAt }));
  }
  return units;
}
