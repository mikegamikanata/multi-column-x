/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  readonly VITE_UPDATER_MOCK?: string;
  readonly VITE_UPDATER_RELEASE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
