/// <reference types="astro/client" />
/// <reference types="@astrojs/cloudflare" />

// Die Cloudflare-Bindings (D1 je Jurisdiktion, R2-Quellenarchiv) werden im Worker über
// `import { env } from 'cloudflare:workers'` gelesen; die Namen stehen in
// packages/runtime/src/bindings.ts, der Zugriff in src/lib/runtime/context.ts.

declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
