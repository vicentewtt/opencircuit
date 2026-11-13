/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** App version injected at build time from package.json. */
declare const __APP_VERSION__: string;
/** True in the single-file build (one .html opened from disk, without the Arduino compiler). */
declare const __SINGLE_FILE__: boolean;
