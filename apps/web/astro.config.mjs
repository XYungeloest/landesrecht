import { defineConfig, sessionDrivers } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

const DEFAULT_SITE_URL = 'https://landesrecht-online.de';

/**
 * Getrennte Vite-Caches für `astro dev` und alle anderen Befehle (build, sync, preview). `astro build` startet intern einen
 * Vite-Server (Content-Sync, Prerendering) mit anderem Plugin-Satz und schrieb bisher in denselben Optimizer-Cache
 * `node_modules/.vite/deps_ssr`. Beim nächsten `astro dev` passte der Config-Hash nicht mehr: Vite optimierte während der
 * ersten Anfrage neu, der workerd-Runner verlor die alten Chunks („The file does not exist … deps_ssr/…“) und der
 * Dev-Server brach ab; erst der zweite Start lief. Mit eigenem Cache je Befehl bleibt der Dev-Cache stabil.
 */
const separateViteCaches = {
  name: 'landesrecht:separate-vite-caches',
  hooks: {
    'astro:config:setup': ({ command, updateConfig }) => {
      updateConfig({ vite: { cacheDir: command === 'dev' ? 'node_modules/.vite' : `node_modules/.vite-${command}` } });
    },
  },
};

export default defineConfig({
  adapter: cloudflare({
    imageService: 'passthrough',
    // Statische Hüllseiten (Start, Hilfe, 404-Hülle) werden im Node-Build vorgerendert; Länder-,
    // Norm-, Fassungs-, Such- und API-Routen laufen mit `prerender = false` im Worker und lesen
    // die D1-Projektion je Jurisdiktion (src/lib/runtime/context.ts).
    prerenderEnvironment: 'node',
  }),
  integrations: [separateViteCaches],
  output: 'static',
  site: process.env.SITE_URL ?? DEFAULT_SITE_URL,
  vite: {
    // Bilddienst (`imageService: 'passthrough'`) und Konsolen-Logger werden erst beim Laden des Server-Einstiegs entdeckt. Ohne Vorab-
    // Optimierung bündelt Vite beim ersten Dev-Start nach und lädt neu, während der workerd-Runner noch die alten Chunks
    // anfordert (Abbruch „The file does not exist … deps_ssr/…“). Vorab eingeschlossen bleibt der erste Start stabil.
    environments: { ssr: { optimizeDeps: { include: ['astro/assets/services/noop', 'astro/logger/console'] } } },
    define: {
      'import.meta.env.PUBLIC_SITE_URL': JSON.stringify(process.env.SITE_URL ?? DEFAULT_SITE_URL),
    },
  },
  session: {
    driver: sessionDrivers.null(),
  },
});
