/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Explicit backend URL override (e.g. https://localhost:44379). */
  readonly VITE_ORCHESTRATOR_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
