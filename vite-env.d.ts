/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY: string
    readonly VITE_AI_STUDIO: string
    readonly VITE_GOOGLE_SHEETS_API_KEY: string
    // more env variables...
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
