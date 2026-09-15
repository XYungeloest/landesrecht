import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Findet das Repository-Root anhand von package.json, content/ und packages/legal-core. */
export function resolveRepositoryRoot(startDirectory = process.cwd()): string {
  let candidate = resolve(startDirectory);
  for (;;) {
    if (
      existsSync(join(candidate, 'package.json'))
      && existsSync(join(candidate, 'content'))
      && existsSync(join(candidate, 'packages', 'legal-core'))
    ) {
      return candidate;
    }
    const parent = dirname(candidate);
    if (parent === candidate) throw new Error(`Repository-Root aus ${startDirectory} nicht gefunden.`);
    candidate = parent;
  }
}
