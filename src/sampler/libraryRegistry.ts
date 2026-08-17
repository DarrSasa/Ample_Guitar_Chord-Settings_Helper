// Registrul librariilor: transforma lista de librarii (parsata + descriptor)
// in "alegeri" selectabile pentru UI (meniul de chitara / Settings), cu
// etichetele finale si variantele (Single Notes / Single Notes+Chords).
//
// Adaugare/stergere librarie = mutare/stergere folder in "guitar samples" —
// acest registru se reconstruieste automat la scanare, fara cod.

import type { GuitarLibraryInfo, LibraryVariant } from "./types";
import { libraryVariants } from "./parseLibrary.ts";

export interface LibraryChoice {
  // Id stabil pentru selectie: `<libraryId>::<variant>`.
  id: string;
  libraryId: string;
  variant: LibraryVariant;
  // Eticheta finala in meniu, ex. "RS - Acoustic Guitar 1 (Single Notes)".
  label: string;
  folderName: string;
  vendorPrefix: string;
  displayName: string;
  defaultFadeOut?: number;
  loop?: { enabled?: boolean; crossfade?: number };
}

export const VARIANT_SUFFIX: Record<LibraryVariant, string> = {
  single: "(Single Notes)",
  full: "(Single Notes+Chords)",
};

export function choiceLabel(lib: GuitarLibraryInfo, variant: LibraryVariant): string {
  return `${lib.folderName} ${VARIANT_SUFFIX[variant]}`;
}

// Construieste toate alegerile (librarie x varianta) disponibile, sortate.
export function buildLibraryChoices(libs: GuitarLibraryInfo[]): LibraryChoice[] {
  const out: LibraryChoice[] = [];
  for (const lib of libs) {
    for (const variant of libraryVariants(lib)) {
      out.push({
        id: `${lib.id}::${variant}`,
        libraryId: lib.id,
        variant,
        label: choiceLabel(lib, variant),
        folderName: lib.folderName,
        vendorPrefix: lib.vendorPrefix,
        displayName: lib.displayName,
        defaultFadeOut: lib.defaultFadeOut,
        loop: lib.loop,
      });
    }
  }
  out.sort((a, b) => {
    if (a.folderName !== b.folderName) {
      return a.folderName.localeCompare(b.folderName, undefined, { numeric: true });
    }
    return a.variant === b.variant ? 0 : a.variant === "single" ? -1 : 1;
  });
  return out;
}

// Rezolva un id de alegere inapoi in (librarie, varianta).
export function resolveLibraryChoice(
  libs: GuitarLibraryInfo[],
  id: string
): { lib: GuitarLibraryInfo; variant: LibraryVariant } | null {
  const sep = id.lastIndexOf("::");
  if (sep < 0) return null;
  const libraryId = id.slice(0, sep);
  const variant = id.slice(sep + 2) as LibraryVariant;
  if (variant !== "single" && variant !== "full") return null;
  const lib = libs.find((l) => l.id === libraryId);
  if (!lib) return null;
  return { lib, variant };
}
