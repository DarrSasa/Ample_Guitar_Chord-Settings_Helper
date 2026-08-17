// Tipuri pentru noul motor sampler (guitar samples: .exs/.gig + WAV-uri).
// Aceste tipuri descriu librariile multi-sample parsat din structura de
// foldere, NU preseturile GM (soundfonts), care raman separate.

// O intrare dintr-un listing recursiv de directoare (venit prin IPC de la
// procesul principal Electron). `path` e RELATIV la radacina "guitar samples"
// si foloseste "/" ca separator, indiferent de sistem.
export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

// Un grup de note individuale: o nota MIDI cu N straturi de velocity.
// `layers` = cai relative (catre fisiere audio) sortate crescator dupa
// indexul de velocity (1..N).
export interface SingleNoteGroup {
  midi: number;
  folderName: string; // ex. "0 - E2"
  folderPath: string; // ex. "RS - Acoustic Guitar 1/Single Notes/0 - E2"
  layers: string[];   // cai relative catre fisiere audio
}

// Un acord preinregistrat (folder Chords): radacina + calitate + straturi.
export interface ChordGroup {
  root: string;               // "A", "A#", "B", ... (sau "E2" la voicing-uri speciale)
  quality: "major" | "minor";
  folderName: string;         // ex. "A Major"
  folderPath: string;         // ex. "RS - Acoustic Guitar 1/Chords/A Major"
  layers: string[];           // cai relative, sortate dupa velocity
}

// O librarie de chitara completa, asa cum o vede samplerul.
export interface GuitarLibraryInfo {
  id: string;              // numele folderului (unic in "guitar samples")
  folderName: string;      // ex. "RS - Acoustic Guitar 1"
  vendorPrefix: string;    // ex. "RS" (din "RS - Acoustic Guitar 1")
  displayName: string;     // ex. "Acoustic Guitar 1"
  hasSingleNotes: boolean;
  hasChords: boolean;
  singleNotes: SingleNoteGroup[];
  chords: ChordGroup[];
}

// Variantele in care apare o librarie in meniul de chitare / Settings:
//   "single" -> (Single Notes)
//   "full"   -> (Single Notes+Chords) — apare doar daca libraria are Chords.
export type LibraryVariant = "single" | "full";
