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
// repo sub-path (GitHub Pages) — we opt in through an env var so the default
// stays root and nothing else breaks.
const base = process.env.PUBLIC_BASE_PATH || "/";

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), ...(isElectronBuild ? [viteSingleFile()] : [])],
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
