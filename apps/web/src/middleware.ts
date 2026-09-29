/**
 * Umleitung stillgelegter Norm-Slugs (`lib/norm-redirects.ts`) vor jeder Seite.
 *
 * Laufzeit-Fehlermodus: Ein Konfigurationsfehler (fehlende D1-Bindings, src/lib/runtime/configuration.ts) wird
 * als klare 500-Antwort mit interner Meldung beantwortet und im Worker-Log vermerkt. Alle anderen Fehler laufen
 * unverändert in Astros Standardbehandlung (ebenfalls 500, ohne stille leere Seite). Nur im Entwicklungsbetrieb
 * (`astro dev`) antwortet eine Anfrage an eine lokal nicht verfügbare Jurisdiktion (Ost ohne lokale OstRecht-D1) mit 503;
 * die übrigen Jurisdiktionen bleiben nutzbar. Im gebauten Worker ist dieser Zweig nicht erreichbar.
 */
import { defineMiddleware } from 'astro:middleware';

import { isJurisdictionUnavailableError } from '@landesrecht/runtime/registry.ts';

import { normRedirectLocation, normRedirectResponse } from './lib/norm-redirects.ts';
import { configurationErrorResponse, currentRuntimeMode, isRuntimeConfigurationError, requestedJurisdictions, unavailableJurisdictionResponse } from './lib/runtime/configuration.ts';
import { getStoreRegistry } from './lib/runtime/context.ts';

export const onRequest = defineMiddleware(async (context, next) => {
  // Stillgelegte Norm-Slugs: permanente Umleitung auf den Nachfolger, bevor eine Seite gerendert wird.
  const redirect = normRedirectLocation(context.url);
  if (redirect) return normRedirectResponse(redirect);
  try {
    if (currentRuntimeMode() === 'development') {
      const targets = requestedJurisdictions(context.url);
      if (targets.length > 0) {
        const registry = await getStoreRegistry();
        for (const jurisdiction of targets) {
          const availability = registry.availability(jurisdiction);
          if (availability.state === 'unavailable-local') return unavailableJurisdictionResponse(jurisdiction, availability, context.url.pathname.startsWith('/api/'));
        }
      }
    }
    return await next();
  } catch (error) {
    // Nur Entwicklung: Anfrage an eine lokal nicht verfügbare Jurisdiktion (Ost ohne lokale OstRecht-D1) → 503.
    if (isJurisdictionUnavailableError(error)) return unavailableJurisdictionResponse(error.jurisdiction, error.availability, context.url.pathname.startsWith('/api/'));
    if (!isRuntimeConfigurationError(error)) throw error;
    console.error(`[landesrecht] Konfigurationsfehler bei ${context.url.pathname}: ${error.message}`);
    return configurationErrorResponse(error);
  }
});
