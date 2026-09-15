import { defineConfig, sessionDrivers } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

const DEFAULT_SITE_URL = 'https://landesrecht.example';

export default defineConfig({
  adapter: cloudflare({
    imageService: 'passthrough',
    // Statische Hüllseiten (Start, Hilfe, 404-Hülle) werden im Node-Build vorgerendert; Länder-,
    // Norm-, Fassungs-, Such- und API-Routen laufen mit `prerender = false` im Worker und lesen
    // die D1-Projektion je Jurisdiktion (src/lib/runtime/context.ts).
    prerenderEnvironment: 'node',
  }),
  output: 'static',
  site: process.env.SITE_URL ?? DEFAULT_SITE_URL,
  vite: {
    define: {
      'import.meta.env.PUBLIC_SITE_URL': JSON.stringify(process.env.SITE_URL ?? DEFAULT_SITE_URL),
    },
  },
  session: {
    driver: sessionDrivers.null(),
  },
});
