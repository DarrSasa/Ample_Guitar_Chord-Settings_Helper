import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Bundle everything into a single index.html only when building for the
// Electron desktop app (main.cjs loads dist/index.html via file://). For web
// hosts (StackBlitz, Vercel, GitHub Pages) we want normal Vite output so the
// dev server has HMR and the production build is properly split & cached.
const isElectronBuild = process.env.BUILD_TARGET === "electron";

// GitHub Pages serves the app from /<repo-name>/ instead of /. Setting a base
// path here lets the same build work at both / (StackBlitz/Vercel) and the
// repo sub-path (GitHub Pages) - we opt in through an env var so the default
// stays root and nothing else breaks.
//
// IMPORTANT: for the Electron build we MUST use a relative base ("./") because
// Electron loads dist/index.html via the file:// protocol. Absolute paths like
// "/assets/index.js" would resolve to the filesystem root, not the app folder,
// leaving the user with a blank grey window. Relative paths always resolve
// next to index.html regardless of how the app is packaged or relocated.
let base;
if (isElectronBuild) {
  base = "./";
} else {
  base = process.env.PUBLIC_BASE_PATH || "/";
}

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), ...(isElectronBuild ? [viteSingleFile()] : [])],
  build: isElectronBuild
    ? {
        // Pentru build-ul Electron TOT trebuie sa fie intr-un singur fisier
        // (index.html). Fara aceasta setare, Vite pastreaza SVG-urile si
        // imaginile ca fisiere separate in dist/assets/, dar viteSingleFile
        // nu le inlineaza - iar Electron le-ar cauta pe disc si ar afisa
        // asset-uri lipsa (butonul grafic Delete raman ca fallback HTML).
        //
        // Setam assetsInlineLimit la Infinity => ORICE asset devine data URI
        // in bundle. Combinat cu viteSingleFile care inlineaza JS + CSS,
        // rezultatul e un singur .html complet self-contained.
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      }
    : undefined,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Accept every host so the app works inside StackBlitz/e2b/Codespaces
    // preview iframes without needing to hard-code hostnames.
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
});
