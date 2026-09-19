/**
 * Bericht der Rückrechnung (`data/audits/bayernrecht/RECONSTRUCTION.md`) und Kurzfassung für die Konsole.
 * Deterministisch aus dem Lauf erzeugt; keine Uhrzeit, keine Zufallsreihenfolge.
 */
import type { ReconstructionState } from '../baseline/reconstruction.ts';
import type { FormulaId } from './formulas.ts';
import { GROUP_LABELS, GROUPS, type ReconstructionGroup } from './groups.ts';
import { isRecipeV2, recipeAmendments, type AnyReconstructionRecipe } from './recipe.ts';
import type { CheckName, ReconstructionRun } from './run.ts';

const STATE_LABELS: Readonly<Record<ReconstructionState, string>> = {
  'recipe-ready': 'sicher zurückgerechnet (Rezept, Forward-Replay exakt)',
  'partial-chain': 'Kette nicht vollständig belegt',
  'missing-base': 'Quelle fehlt',
  'non-invertible-amendment': 'Befehl nicht umkehrbar (Alttext fehlt)',
  'asset-missing': 'Anlage oder Abbildung ohne Alttext',
  contradictory: 'Belege widersprechen einander',
  'command-unreadable': 'Befehl nicht auffindbar oder nicht lesbar',
  'unsupported-formula': 'Formel nicht maschinell angewandt',
  'ambiguous-target': 'Ort oder Wortlaut nicht eindeutig',
  'effective-date-undetermined': 'Inkrafttreten nicht bestimmbar',
  'round-trip-failed': 'Rundlauf gescheitert',
};

const FORMULA_LABELS: Readonly<Record<FormulaId, string>> = {
  'replace-words': '„… wird die Angabe „X“ durch die Angabe „Y“ ersetzt“',
  'insert-words': '„… wird nach/vor der Angabe „X“ die Angabe „Y“ eingefügt“',
  'delete-words-anchored': '„… wird nach/vor der Angabe „X“ die Angabe „Y“ gestrichen“',
  'append-words': '„Der Überschrift wird die Angabe „Y“ angefügt“',
  'replace-final-punctuation': '„… wird der Punkt am Ende durch … ersetzt“',
  'replace-final-words': '„… wird die Angabe „X“ am Ende durch die Angabe „Y“ ersetzt“ (neu)',
  'delete-final-words': '„… wird das Wort „oder“ am Ende gestrichen“ (neu)',
  'insert-sentence': '„Folgender Satz 2 wird angefügt: „²…““ / „Nach Satz 1 wird folgender Satz 2 eingefügt“ (neu)',
  'insert-block': '„Nach Nr. 4 wird folgende Nr. 5 eingefügt: „5. …““ / „Folgender Abs. 3 wird angefügt“ (neu)',
  relabel: '„Der bisherige Abs. 3 wird Abs. 4.“ / „Die bisherigen Nrn. 5 bis 7 werden die Nrn. 6 bis 8.“ (neu)',
  'renumber-sentence': '„Der bisherige Satz 2 wird Satz 3.“ (neu)',
  'number-sentences': '„Der Wortlaut wird Satz 1.“ (neu)',
  'unnumber-sentences': '„In Satz 1 wird die Satznummerierung „¹“ gestrichen.“ (Lauf 7)',
  'unnumber-paragraph': '„In Abs. 1 wird die Absatzbezeichnung „(1)“ gestrichen.“ (Lauf 8)',
  'number-paragraph': '„Der Wortlaut wird Abs. 1.“ (Run 5)',
  'insert-title': '„In § 5 wird folgende Überschrift eingefügt: „…““ (neu)',
  'delete-words': '„… wird die Angabe „X“ gestrichen“ (ohne Anker)',
  recast: '„… wird wie folgt gefasst:“ / „erhält folgende Fassung“',
  'repeal-unit': '„… wird aufgehoben“ / „Satz 5 wird gestrichen“',
  'annex-recast': '„… erhalten die aus dem Anhang ersichtliche Fassung“',
  'insert-unit': 'Einfügung eines Glieds, die nicht eindeutig zuzuordnen ist',
  renumber: 'Umnummerierung, die nicht eindeutig lesbar ist',
  'replace-by-punctuation': '„… das Wort „oder“ durch ein Komma ersetzt“ (ohne „am Ende“)',
  container: '„Art. 5 wird wie folgt geändert:“ (Gliederung)',
  unrecognized: 'nicht erkannt',
};

const CHECK_LABELS: Readonly<Record<CheckName, string>> = {
  sources: 'alle genannten Verkündungen verfügbar (Cache, HTML oder PDF-Textlayer)',
  chain: 'Kette belegt: Vollzitat, Verweise, Register, Verlauf, Fortführungsnachweis, übrige Verkündungen',
  effectiveDate: 'Inkrafttreten je Änderung bestimmt, in Kettenreihenfolge, jüngstes = inkraft',
  block: 'Befehlsblock und Orte lesbar',
  formulas: 'jede Klausel mit unterstützter, eindeutig umkehrbarer Formel',
  roundTrip: 'Orte aufgelöst, Wortlaut eindeutig, Vorwärtsprobe je Änderung exakt',
  baselineStart: 'Beginn der Stichtagsfassung (≤ Stichtag) mit Kalenderdatum belegt',
};

const cell = (value: string): string => value.replace(/\|/gu, '\\|').replace(/\s+/gu, ' ');

function formulasOf(recipe: AnyReconstructionRecipe): string {
  return [...new Set(recipeAmendments(recipe).flatMap((amendment) => amendment.steps.map((step) => step.formula)))].join(', ');
}

export function renderReconstructionReport(run: ReconstructionRun): string {
  const { queue, recipes } = run;
  const t = queue.totals;
  const lines: string[] = [];
  const push = (...values: string[]): void => {
    lines.push(...values);
  };
  push('# Rückrechnung von Änderungen – BayWü', '');
  push(`Stichtag **${queue.baselineDate}** · Auswertungsstichtag ${queue.evaluationDate} · erzeugt von \`npm run import:bayernrecht:reconstruction-queue -- --write\` (offline, nur Cache). Methode: \`docs/BAYWUE_RECONSTRUCTION.md\`. Schlange: \`data/imports/bayernrecht/reconstruction-queue.json\`. Rezepte: \`data/imports/bayernrecht/reconstruction/<documentId>.json\`. Quellenregister: \`data/imports/bayernrecht/reconstruction-sources.json\`. Audit: \`data/audits/bayernrecht/reconstruction-audit.json\`.`, '');

  push('## Kennzahl: vorher / nachher', '');
  push('| | vorher | nachher |', '| --- | ---: | ---: |');
  push(`| Normen \`changed-after-baseline\` | ${queue.before.recipeReady + queue.before.reconstructionRequired} | ${t.changedAfterBaseline} |`);
  push(`| sicher zurückgerechnet | ${queue.before.recipeReady} | **${t.recipeReady}** |`);
  push(`| davon einstufig (Rezept v1) | ${queue.before.recipeReady} | ${t.recipeReadySingle} |`);
  push(`| davon mehrstufig (Rezept v2) | 0 | ${t.recipeReadyMulti} |`);
  push(`| davon mit Alttext aus der Stammverkündung (\`restoration\`, \`forward-from-publication\`) | 0 | ${recipes.filter((recipe) => recipe.restoration).length} |`);
  push(`| \`reconstruction-required\` | ${queue.before.reconstructionRequired} | ${t.changedAfterBaseline - t.recipeReady} |`);
  push('', `„vorher“: ${queue.before.source}. Jede zurückgerechnete Norm hat in \`baseline.json\` Methode \`reverse-amendment\`, Status \`active-at-baseline\`, keine Blocker.`, '');

  if (t.byRestorationBase) {
    push('## Stammverkündung der offenen Normen (Lauf 7)', '');
    push('Alttext für Neufassung, Aufhebung und Streichung ohne Anker kommt aus der Stammverkündung, wenn sie digital und amtlich als HTML vorliegt und die Kette bis zu ihr reicht (`docs/BAYWUE_RECONSTRUCTION.md`, Abschnitt 19). Je offene Norm (`restorationBase` in der Schlange):', '');
    const labels: Record<string, string> = {
      available: 'verfügbar – die Norm scheitert an anderem (Grund in der Schlange)',
      'available-chain-incomplete': 'verfügbar, aber die Kette bis zur Stammfassung ist nicht lückenlos',
      'base-pdf-only': 'nur PDF-Ausgabe des GVBl. (ohne HTML-Detailseite)',
      'base-paper-only': 'nur auf Papier',
      'base-none': 'keine Stammverkündung (Neubekanntmachung, Fundstelle fehlt oder nicht lesbar)',
      'base-not-cached': 'nicht im Cache (nur abgerufen, wenn die Kette steht)',
      'base-unconvertible': 'HTML nicht sicher umsetzbar (`baseline-only/html.ts`)',
      'base-mismatch': 'Seite gehört nicht zur Norm',
      'not-reached': 'nicht erreicht (Paket fehlt oder unlesbar)',
    };
    push('| Stammverkündung | offene Normen |', '| --- | ---: |');
    for (const [state, count] of Object.entries(t.byRestorationBase)) push(`| ${labels[state] ?? state} (\`${state}\`) | ${count} |`);
    push('');
  }

  push('## Gruppen', '');
  push('Jede Norm hat **genau eine** Gruppe (Vorrang und Regeln: `src/reconstruction/groups.ts`), dazu beliebig viele Gründe (`reasons` in der Schlange). Die Gruppen 1–3 sind die Fälle, deren Befehle grundsätzlich exakt umkehrbar sind; die übrigen sind nach der schwersten zutreffenden Lage eingeordnet.', '');
  push('| # | Gruppe | Normen | zurückgerechnet | offen | häufigste offene Gründe |', '| ---: | --- | ---: | ---: | ---: | --- |');
  GROUPS.forEach((group, index) => {
    const all = queue.entries.filter((entry) => entry.group === group);
    const ready = all.filter((entry) => entry.state === 'recipe-ready').length;
    const reasons = Object.entries(t.byGroupReason[group] ?? {}).slice(0, 4).map(([reason, count]) => `\`${reason}\` ${count}`).join(', ');
    push(`| ${index + 1} | ${GROUP_LABELS[group]} (\`${group}\`) | ${all.length} | ${ready} | ${all.length - ready} | ${reasons || '–'} |`);
  });
  push('');

  push('## Wo die Normen scheitern', '');
  push('Jede Prüfung zählt nur Normen, die sie erreicht haben; „nicht erreicht“ heißt, eine frühere Prüfung hat die Norm bereits ausgeschlossen.', '');
  push('| Prüfung | bestanden | nicht bestanden | nicht erreicht |', '| --- | ---: | ---: | ---: |');
  for (const check of Object.keys(CHECK_LABELS) as CheckName[]) {
    const counts = t.checks[check]!;
    push(`| ${CHECK_LABELS[check]} | ${counts.passed} | ${counts.failed} | ${counts.notReached} |`);
  }
  push('');

  push('## Zustände', '');
  push('| Zustand | Normen | Bedeutung |', '| --- | ---: | --- |');
  for (const [state, value] of Object.entries(t.byState)) push(`| \`${state}\` | ${value} | ${STATE_LABELS[state as ReconstructionState] ?? ''} |`);
  push('');
  push('## Maßgebliche Gründe', '');
  push('Je Norm zählt der schwerste Befund (Widerspruch → Quelle fehlt → Befehl unlesbar → Anlage → nicht umkehrbar → Kette → Inkrafttreten → Formel → Mehrdeutigkeit → Rundlauf). Die Kette wird zuerst geprüft; scheitert sie, werden die Befehle nicht mehr angewandt, ihre Formeln aber für Gruppe und Statistik erhoben.', '');
  push('| Zustand / Grund | Normen |', '| --- | ---: |');
  for (const [reason, value] of Object.entries(t.byReason)) push(`| \`${reason}\` | ${value} |`);
  push('');

  push('## Änderungsformeln', '');
  push('Erhoben aus allen Befehlsblöcken der Ketten und des Registers; „Klauseln“ zählt jede Formel je Befehl. Eine Norm fällt, sobald **eine** ihrer Klauseln nicht unterstützt ist. Neu unterstützt (je an echten, gekürzten Verkündungsausschnitten unter `tests/fixtures/bayernrecht/` belegt): Satz einfügen/anfügen, Glied einfügen/anfügen, Umnummerierung von Gliedern und Sätzen, „Der Wortlaut wird Satz 1“, Überschrift einfügen, Wort/Angabe am Ende ersetzen oder streichen.', '');
  push('| Formel | Wortlaut (Beispiel) | Klauseln | Normen | bestimmt Alttext | angewandt |', '| --- | --- | ---: | ---: | :---: | :---: |');
  for (const [formula, stat] of Object.entries(t.formulas).sort((left, right) => right[1].clauses - left[1].clauses)) {
    push(`| \`${formula}\` | ${FORMULA_LABELS[formula as FormulaId] ?? ''} | ${stat.clauses} | ${stat.norms} | ${stat.invertible ? 'ja' : 'nein'} | ${stat.supported ? 'ja' : 'nein'} |`);
  }
  push('');

  push('## Quellen', '');
  const register = run.sources.totals;
  push(`Das Quellenregister führt **${register.sources}** Verkündungen (${register.html} HTML-Detailseiten, ${register.pdf} PDF-Ausgaben), davon ${register.decisive} für ein Rezept entscheidend; Amtlichkeit: ${Object.entries(register.byAuthority).map(([authority, value]) => `\`${authority}\` ${value}`).join(', ')}. Je Quelle: Adresse, Fundstelle, Verkündungs- und Ausfertigungsdatum, Amtlichkeit, SHA-256, Rolle je Fall, Abschnitt und Wortlaut der Inkrafttretensvorschrift.`, '');
  if (run.fetch) {
    push(`Gezielter Abruf (\`reconstruction-queue --fetch\`, Prüfpunkt \`data/imports/bayernrecht/reconstruction-fetch.json\`): **${run.fetch.networkRequests}** Netzabrufe (${run.fetch.fetched} Seiten bzw. PDF abgerufen, ${run.fetch.notFound} belegt nicht vorhanden – 404, ${run.fetch.errors} Fehler), sequenziell über den Adapter-Fetcher mit Cache und identifizierendem User-Agent. Ein Wiederholungslauf mit \`--offline\` braucht kein Netz.`, '');
  }

  push('## Zurückgerechnete Normen', '');
  if (recipes.length === 0) push('Keine.', '');
  else {
    push('| Norm | Rezept | Änderungen (jüngste zuerst) | in Kraft | Beginn Stichtagsfassung | Schritte | Formeln | Stichtagskörper |', '| --- | --- | --- | --- | --- | ---: | --- | --- |');
    for (const recipe of recipes) {
      const amendments = recipeAmendments(recipe);
      push(`| \`${recipe.documentId}\` | ${isRecipeV2(recipe) ? 'v2' : 'v1'} | ${amendments.map((amendment) => amendment.citation).join(' ← ')} | ${amendments.map((amendment) => amendment.effectiveDate).join(' ← ')} | ${recipe.baselineTextInForce.date} | ${amendments.reduce((sum, amendment) => sum + amendment.steps.length, 0)} | ${formulasOf(recipe)} | \`${recipe.expected.baselineFingerprint.slice(0, 16)}\` |`);
    }
    push('');
    for (const recipe of recipes) {
      push(`### ${recipe.documentId}`, '');
      for (const amendment of recipeAmendments(recipe)) {
        push(`- Änderung ${amendment.citation} (${amendment.url}, SHA-256 \`${amendment.sha256.slice(0, 16)}…\`), verkündet ${amendment.eventDate}, in Kraft ${amendment.effectiveDate} („${cell(amendment.effectiveDateEvidence.join(' '))}“)`);
        for (const step of amendment.steps) {
          push(`  - ${step.id} \`${step.formula}\` in ${cell(step.location)}: „${cell(step.command).slice(0, 300)}“`);
          push(`    - Stichtag: „${cell(step.evidence.baseline)}“ · heute: „${cell(step.evidence.current)}“`);
        }
      }
      push(`- Beginn der Stichtagsfassung: ${recipe.baselineTextInForce.date} – ${cell(recipe.baselineTextInForce.evidence.slice(1).join(' · '))}`, '');
    }
  }

  push('## Befehle und Rundlauf bestanden, Beginn der Stichtagsfassung nicht belegt', '');
  const pending = queue.entries.filter((entry) => entry.roundTripVerified);
  if (pending.length === 0) push('Keine.', '');
  else {
    push('| Norm | Kette | vorangehende Änderung laut Befehl | Grund |', '| --- | --- | --- | --- |');
    for (const entry of pending) push(`| \`${entry.documentId}\` | ${cell((entry.chain ?? []).join(' ← '))} | ${cell(entry.priorAmendment ?? '– (Stammfassung)')} | ${cell(entry.detail).slice(0, 220)} |`);
    push('');
  }

  push('## Unbestimmte Geltungsfälle, neu geprüft', '');
  push('Geprüft mit dem Ereignisregister und allen Detailseiten nach dem Stichtag: gesucht war eine Verkündung, die die Norm **stark** zitiert (zwei unabhängige Merkmale, eines davon Ausfertigungsdatum oder BayRS-Nummer) und einen Änderungs- oder Aufhebungsbefehl an sie richtet. Eine solche Verkündung setzt die Geltung der Norm an ihrem Tag voraus; gilt der heutige Text laut Paket seit einem Tag vor dem Stichtag und nennt die Verkündung keine Änderung dazwischen, galt die Norm am Stichtag. Nur die Geltung wird so entschieden; hat die Verkündung den Text geändert, bleibt die Methode unbestimmt.', '');
  const changed = run.undetermined.filter((result) => result.changed).length;
  push(`Ergebnis: **${run.undetermined.length}** Fälle geprüft, **${changed}** neu entschieden, ${run.undetermined.length - changed} bleiben unbestimmt.`, '');
  push('| Norm | vorher | nachher | Befund |', '| --- | --- | --- | --- |');
  for (const result of run.undetermined) push(`| \`${result.documentId}\` | ${result.before.status} / ${result.before.method} (${result.before.reason}) | ${result.after.status} / ${result.after.method} (${result.after.reason}) | ${cell(result.finding).slice(0, 400)} |`);
  push('');

  const offen = queue.entries.filter((entry) => entry.state !== 'recipe-ready');
  push('## Offene Fälle je Gruppe', '');
  for (const group of GROUPS) {
    const list = offen.filter((entry) => entry.group === group);
    if (list.length === 0) continue;
    push(`### ${GROUP_LABELS[group as ReconstructionGroup]} (${list.length})`, '');
    push('| Norm | Änderungen | Zustand / Grund | Befund | weitere Gründe |', '| --- | ---: | --- | --- | --- |');
    for (const entry of list) push(`| \`${entry.documentId}\` | ${entry.amendments} | \`${entry.state}/${entry.reason}\` | ${cell(entry.detail).slice(0, 200)} | ${entry.reasons.slice(1).map((reason) => `\`${reason.reason}\``).join(', ')} |`);
    push('');
  }
  return `${lines.join('\n')}\n`;
}

export function reconstructionSummary(run: ReconstructionRun): string[] {
  const t = run.queue.totals;
  const pad = (value: number | string, width = 5): string => String(value).padStart(width);
  return [
    `Rückrechnung BayWü, Stichtag ${run.queue.baselineDate}: ${t.changedAfterBaseline} geänderte Normen, ${t.recipeReady} sicher zurückgerechnet (${t.recipeReadySingle} einstufig, ${t.recipeReadyMulti} mehrstufig; vorher ${run.queue.before.recipeReady})`,
    '  Gruppen:',
    ...GROUPS.map((group) => `  ${pad(t.byGroup[group] ?? 0)}  ${group}`),
    '  Zustände:',
    ...Object.entries(t.byState).map(([state, count]) => `  ${pad(count)}  ${state}`),
    `  Unbestimmte Geltungsfälle: ${run.undetermined.length} geprüft, ${run.undetermined.filter((result) => result.changed).length} neu entschieden`,
    `  Quellen: ${run.sources.totals.sources} im Register (${run.sources.totals.pdf} PDF); Audit: ${run.audit.totals.forwardCheckPassed}/${run.audit.totals.recipes} Forward-Checks bestanden${run.audit.totals.restored ? `, ${run.audit.totals.restorationCheckPassed}/${run.audit.totals.restored} Wiederherstellungen aus der Stammverkündung nachgerechnet` : ''}`,
  ];
}
