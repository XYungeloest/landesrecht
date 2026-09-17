/**
 * Laufzeit-Fehlermodus: Ein Konfigurationsfehler (fehlende D1-Bindings, src/lib/runtime/configuration.ts) wird
 * als klare 500-Antwort mit interner Meldung beantwortet und im Worker-Log vermerkt. Alle anderen Fehler laufen
 * unverändert in Astros Standardbehandlung (ebenfalls 500, ohne stille leere Seite).
 */
import { defineMiddleware } from 'astro:middleware';

import { configurationErrorResponse, isRuntimeConfigurationError } from './lib/runtime/configuration.ts';

export const onRequest = defineMiddleware(async (context, next) => {
  try {
    return await next();
  } catch (error) {
    if (!isRuntimeConfigurationError(error)) throw error;
    console.error(`[landesrecht] Konfigurationsfehler bei ${context.url.pathname}: ${error.message}`);
    return configurationErrorResponse(error);
  }
});
