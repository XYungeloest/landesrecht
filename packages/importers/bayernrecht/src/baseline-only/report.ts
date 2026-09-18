/**
 * Bericht `data/audits/bayernrecht/BASELINE_ONLY.md` – deterministisch: kein Tagesdatum, keine Laufzeit, keine
 * Netzstatistik (die hängt vom Cache ab, nicht vom Bestand).
 */
import { MISSING_LINKS, OUTCOMES, type Outcome } from './model.ts';
import type { BaselineOnlyRun } from './run.ts';

const OUTCOME_LABELS: Readonly<Record<Outcome, string>> = {
  safe: 'sicher wiederhergestellt (Rezept)',
  'missing-base': 'Ausgangsfassung fehlt (Papier, nicht verkündet, nur PDF, Anlage nur als PDF, Bild)',
  'incomplete-chain': 'Änderungsfolge unvollständig oder nicht anwendbar',
  contradictory: 'widersprüchliche Belege',
  undetermined: 'unbestimmt (Identität, Beginn, Ende, Weitergeltung, Umfang)',
  'not-at-baseline': 'belegt: galt am Stichtag nicht',
  'out-of-scope': 'belegt: keine Vorschrift des Landesrechts',
  pending: 'offen: Quelle in diesem Lauf nicht erreichbar',
};

const escape = (value: string): string => value.replace(/\|/gu, '\\|').replace(/\s+/gu, ' ').trim();

export function renderReport(run: BaselineOnlyRun, options: { baselineDate: string; evaluationDate: string }): string {
  const m = run.metrics;
  const lines: string[] = [
    '# Heute fehlende Stichtagsnormen (baseline-only) – BayWü',
    '',
    `Erzeugt von \`npm run import:bayernrecht:restore-baseline-only -- --write\`. Stichtag **${options.baselineDate}**, Auswertungsstichtag ${options.evaluationDate}.`,
    'Methode und Grenzen: `docs/BAYWUE_BASELINE_ONLY.md`. Rezepte: `data/imports/bayernrecht/baseline-only/<id>.json`, alle Kandidaten mit Ergebnis: `candidates.json`.',
    '',
    '## 1 Kennzahlen',
    '',
    '| Kennzahl | Anzahl |',
    '| --- | ---: |',
    `| Kandidaten (\`isBaselineOnlyCandidate\`) | ${m.candidates} |`,
    `| starke Identität (Registerzuordnung stark, Zitat in der Aufhebung genau belegt, Ende lesbar) | ${m.strongIdentity} |`,
    `| Ausgangsverkündung gefunden und als dieselbe Norm belegt | ${m.baseFound} |`,
    `| Kette vollständig (Gegenprobe, Änderungen angewandt, Beginn und Ende belegt) | ${m.fullChain} |`,
    `| sicher wiederhergestellt | ${m.safelyReconstructed} (${m.safeNorms} Normen) |`,
    `| Doppelerfassungen im Register (Ereignis ohne Zitat, mit dem zitierten Ereignis derselben Aufhebung verbunden; übernimmt dessen Ergebnis) | ${m.duplicates ?? 0} |`,
    `| missing-base | ${m.byOutcome['missing-base']} |`,
    `| incomplete-chain | ${m.byOutcome['incomplete-chain']} |`,
    `| contradictory | ${m.byOutcome.contradictory} |`,
    `| undetermined | ${m.byOutcome.undetermined} |`,
    `| not-at-baseline (belegt) | ${m.byOutcome['not-at-baseline']} |`,
    `| out-of-scope (belegt) | ${m.byOutcome['out-of-scope']} |`,
    `| pending (Quelle nicht erreichbar) | ${m.byOutcome.pending} |`,
    '',
    '## 2 Ergebnis je fehlendem Glied',
    '',
    '| Ergebnis | fehlendes Glied | Kandidaten |',
    '| --- | --- | ---: |',
    ...Object.entries(m.byMissingLink)
      .sort(([left], [right]) => {
        const a = OUTCOMES.indexOf(MISSING_LINKS[left as keyof typeof MISSING_LINKS]);
        const b = OUTCOMES.indexOf(MISSING_LINKS[right as keyof typeof MISSING_LINKS]);
        return a - b || (left < right ? -1 : 1);
      })
      .map(([code, count]) => `| ${MISSING_LINKS[code as keyof typeof MISSING_LINKS]} | \`${code}\` | ${count} |`),
    '',
    OUTCOMES.map((outcome) => `- \`${outcome}\`: ${OUTCOME_LABELS[outcome]}`).join('\n'),
    '',
    '## 3 Sicher wiederhergestellte Normen',
    '',
  ];
  if (run.recipes.length === 0) lines.push('Keine.', '');
  else {
    lines.push('| Kennung | Titel | Fundstelle | Änderungen | Quellgeltung | Ende durch |', '| --- | --- | --- | ---: | --- | --- |');
    for (const recipe of run.recipes) {
      const to = recipe.textValidTo && recipe.textValidTo.date < recipe.end.lastDay ? recipe.textValidTo.date : recipe.end.lastDay;
      lines.push(`| \`${recipe.id}\` | ${escape(recipe.norm.title).slice(0, 110)} | ${recipe.norm.fundstelle} | ${recipe.amendments.length} | ${recipe.begin.date} bis ${to} | ${recipe.end.repeal.citation} |`);
    }
    lines.push('');
  }
  lines.push('## 4 Review-Fälle (Auswahl je fehlendem Glied)', '');
  const byCode = new Map<string, typeof run.candidates>();
  for (const candidate of run.candidates) {
    if (!candidate.missing) continue;
    const list = byCode.get(candidate.missing.code) ?? [];
    list.push(candidate);
    byCode.set(candidate.missing.code, list);
  }
  for (const [code, list] of [...byCode.entries()].sort(([left], [right]) => (left < right ? -1 : 1))) {
    lines.push(`### \`${code}\` (${MISSING_LINKS[code as keyof typeof MISSING_LINKS]}, ${list.length})`, '');
    for (const candidate of list.slice(0, 3)) {
      lines.push(`- ${escape(candidate.registerTitle).slice(0, 140)} – ${candidate.repeal.citation}${candidate.normId ? ` (\`${candidate.normId}\`)` : ''}: ${escape(candidate.missing!.detail).slice(0, 420)}`);
    }
    if (list.length > 3) lines.push(`- … ${list.length - 3} weitere in \`candidates.json\``);
    lines.push('');
  }
  lines.push('## 5 Grenzen', '');
  lines.push(
    '- Ausgangsfassungen vor 2009 (Amtsblätter nur gedruckt), nicht verkündete Schreiben und Blätter außerhalb der Verkündungsplattform bleiben `missing-base`; es gibt keine OCR und keinen Text aus Sekundärquellen.',
    '- Verwaltungsvorschriften, die bis 31. Dezember 2015 erlassen wurden, gelten nach der VwVWBek nur fort, wenn sie in der Positivliste stehen (Textlayer vollständig zerlegt, kein OCR). Nicht gelistet heißt: galt am Stichtag nicht (`vwvwbek-not-listed`); vor 2016 geändert (Fassungsdatum ≠ Erlassdatum) bleibt `vwvwbek-amended-before-2016`.',
    '- Die Kette wird im BayMBl. per Volltextsuche nach Ausfertigungsdatum und Fundstelle gegengeprüft (Gliederungsnummern allein übersehen Sammeländerungen, belegt an BayMBl. 2022 Nr. 766); die Amtsblätter 2009–2018 haben keine Volltextsuche – dort wird jede Veröffentlichung des Zeitraums gelesen, höchstens 200 Ausgaben je Norm – Verwaltungsvorschriften, die vor Herbst 2015 verkündet wurden, bleiben deshalb `chain-amtsblatt-unsearchable`.',
    '- Änderungen werden nur mit den Wortlautformeln der Rückrechnung angewandt (`reconstruction/formulas.ts`); Neufassungen, Aufhebungen einzelner Glieder, Einfügungen ganzer Glieder und Berichtigungen bleiben `incomplete-chain`.',
    '- Fingerabdrücke gelten dem Quelltext vor der Überleitung; eine Änderung der Überleitung macht kein Rezept ungültig.',
    '',
  );
  return lines.join('\n');
}
