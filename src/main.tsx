import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fontul ales de user (Bebas Neue) — ingobat local, merge offline in EXE.
import "@fontsource/bebas-neue/latin-400.css";
import "@fontsource/bebas-neue/latin-ext-400.css";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
