// Parsarea librariilor de chitara din structura de foldere/fisiere.
//
// NU citeste .exs/.gig (unele sunt binare GigaStudio), ci deduce mapping-ul
// nota/velocity direct din numele folderelor si ale fisierelor, conform
// inventarului din docs/sampler/INVENTAR.md:
//
//   <Librarie>/
//     ├── Chords/<Root> <Major|Minor>/1_XX.wav ... K_XX.wav   (velocity 1..K)
//     └── Single Notes/<N> - <Nota>/1_<Nota>.wav ... 32_<Nota>.wav
//
// Reguli:
//   - Single Notes: MIDI = 40 + N  (N = indexul numeric al folderului;
//     0 = E2 = MIDI 40). Numele notei din folder NU e de incredere
//     (vendorul are octave inconsecvente), asa ca folosim indexul.
//   - Prefixul numeric al fisierului = layer de velocity (1-based).
//   - Chords: folderul da radacina + Major/Minor.
//
// Functiile de aici sunt PURE (fara I/O) ca sa poata fi testate in Node.

import type { ChordGroup, DirEntry, GuitarLibraryInfo, SingleNoteGroup } from "./types";

// Extensii audio pe care le poate decoda Web Audio (decodeAudioData).
const AUDIO_EXTS = new Set([".wav", ".wave", ".aif", ".aiff", ".flac", ".mp3", ".ogg"]);

function hasAudioExt(name: string): boolean {
  const lower = name.toLowerCase();
  for (const ext of AUDIO_EXTS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

// "1_E2.wav" -> 1 ; "32_AC.wav" -> 32 ; fara prefix numeric -> 0 (invalid).
export function layerIndexFromFileName(name: string): number {
  const m = name.match(/^(\d+)_/);
  return m ? parseInt(m[1], 10) : 0;
}

// "0 - E2" -> 40 ; "10 - D2" -> 50 ; altfel null.
export function singleNoteMidiFromFolder(folderName: string): number | null {
  const m = folderName.match(/^(\d+)\s*-\s*/);
  if (!m) return null;
  return 40 + parseInt(m[1], 10);
}

// ---------------------------------------------------------------------------
// DirectWave / FL Studio (nume plate: "<prefix>_<NotaFL>_<velocity>.wav")
// ---------------------------------------------------------------------------

const NOTE_CLASS: Record<string, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
};
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// "E3" in notatia FL Studio (middle C = C5 = MIDI 60) -> MIDI 40.
// Formula: midi = octava * 12 + pitchClass. (C5 = 5*12+0 = 60 ✓, E3 = 3*12+4 = 40 ✓)
export function flNoteNameToMidi(note: string): number | null {
  const m = note.match(/^([A-G])(#?)(-?\d+)$/i);
  if (!m) return null;
  const pc = NOTE_CLASS[(m[1].toUpperCase() + m[2])];
  if (pc === undefined) return null;
  const oct = parseInt(m[3], 10);
  return oct * 12 + pc;
}

// midi 40 -> "E2" (notatia stiintifica, middle C = C4 = 60).
function midiToNoteLabel(midi: number): string {
  const oct = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[((midi % 12) + 12) % 12] + oct;
}

// "Ample Guitar M_E3_15.wav" -> { midi: 40, velocity: 15 } ; altfel null.
export function parseDirectWaveFileName(
  name: string
): { midi: number; velocity: number } | null {
  const m = name.match(/^.+_([A-G]#?[0-9]+)_(\d+)\.(?:wav|wave|aif|aiff)$/i);
  if (!m) return null;
  const midi = flNoteNameToMidi(m[1]);
  if (midi === null || midi < 0 || midi > 127) return null;
  const velocity = parseInt(m[2], 10);
  if (!Number.isFinite(velocity) || velocity < 0 || velocity > 127) return null;
  return { midi, velocity };
}

// "A Major" -> { root: "A", quality: "major" } ; altfel null.
export function parseChordFolder(
  folderName: string
): { root: string; quality: "major" | "minor" } | null {
  const m = folderName.match(/^(.+?)\s+(Major|Minor)$/i);
  if (!m) return null;
  return {
    root: m[1].trim(),
    quality: m[2].toLowerCase() === "major" ? "major" : "minor",
  };
}

// Desparte "RS - Acoustic Guitar 1" in prefix vendor "RS" + nume afisat.
export function splitVendorName(folderName: string): {
  vendorPrefix: string;
  displayName: string;
} {
  const idx = folderName.indexOf(" - ");
  if (idx > 0) {
    return {
      vendorPrefix: folderName.slice(0, idx).trim(),
      displayName: folderName.slice(idx + 3).trim(),
    };
  }
  return { vendorPrefix: "", displayName: folderName };
}

function segs(p: string): string[] {
  return p.split("/").filter((s) => s.length > 0);
}

// Colecteaza fisierele audio dintr-un folder (pe baza listing-ului), sortate
// crescator dupa layer-ul de velocity. Ignora fisierele fara prefix numeric
// si fisierele non-audio.
function collectLayers(folderPath: string, entries: DirEntry[]): string[] {
  const prefix = folderPath + "/";
  return entries
    .filter((e) => !e.isDirectory && e.path.startsWith(prefix) && hasAudioExt(e.name))
    .map((e) => ({ path: e.path, layer: layerIndexFromFileName(e.name) }))
    .filter((x) => x.layer >= 1)
    .sort((a, b) => a.layer - b.layer)
    .map((x) => x.path);
}

// Parseaza O librarie (un folder de nivel 1 in "guitar samples").
export function parseLibrary(folderName: string, entries: DirEntry[]): GuitarLibraryInfo {
  const base = folderName + "/";
  const libEntries = entries.filter((e) => e.path === folderName || e.path.startsWith(base));

  // Subfoldere directe sub librarie (Chords, Single Notes, ...).
  const directDirs = libEntries.filter((e) => e.isDirectory && segs(e.path).length === 2);

  const chordsDir = directDirs.find((d) => d.name.toLowerCase() === "chords");
  const notesDir = directDirs.find((d) => d.name.toLowerCase() === "single notes");

  // --- Single Notes ---
  const singleNotes: SingleNoteGroup[] = [];
  if (notesDir) {
    const noteGroups = libEntries.filter(
      (e) => e.isDirectory && e.path.startsWith(notesDir.path + "/") && segs(e.path).length === 3
    );
    for (const g of noteGroups) {
      const midi = singleNoteMidiFromFolder(g.name);
      if (midi === null || midi < 0 || midi > 127) continue;
      const layers = collectLayers(g.path, entries);
      if (layers.length === 0) continue;
      singleNotes.push({ midi, folderName: g.name, folderPath: g.path, layers });
    }
    singleNotes.sort((a, b) => a.midi - b.midi);
  }

  // --- Chords ---
  const chords: ChordGroup[] = [];
  if (chordsDir) {
    const chordGroups = libEntries.filter(
      (e) => e.isDirectory && e.path.startsWith(chordsDir.path + "/") && segs(e.path).length === 3
    );
    for (const g of chordGroups) {
      const parsed = parseChordFolder(g.name);
      if (!parsed) continue;
      const layers = collectLayers(g.path, entries);
      if (layers.length === 0) continue;
      chords.push({ ...parsed, folderName: g.name, folderPath: g.path, layers });
    }
    // Sortare: major/minor, apoi alfabetic dupa radacina.
    chords.sort((a, b) => {
      if (a.quality !== b.quality) return a.quality === "major" ? -1 : 1;
      return a.root.localeCompare(b.root);
    });
  }

  // --- Single Notes "plate" (DirectWave / FL Studio) ---
  // DirectWave salveaza toate notele intr-un singur folder cu nume de forma
  // "<prefix>_<NotaFL>_<velocity>.wav" (ex. "Ample Guitar M_E3_15.wav").
  // Le citim direct ca note individuale, fara a mai cere structura
  // "Single Notes/<N> - <Nota>/". (AGM 4.1.0 exportat din FL Studio.)
  const dwByMidi = new Map<number, Array<{ path: string; velocity: number }>>();
  for (const e of libEntries) {
    if (e.isDirectory) continue;
    const parsed = parseDirectWaveFileName(e.name);
    if (!parsed) continue;
    const arr = dwByMidi.get(parsed.midi) ?? [];
    arr.push({ path: e.path, velocity: parsed.velocity });
    dwByMidi.set(parsed.midi, arr);
  }
  for (const [midi, arr] of dwByMidi) {
    arr.sort((a, b) => a.velocity - b.velocity);
    const dirOfFirst = arr[0].path.slice(0, arr[0].path.lastIndexOf("/"));
    singleNotes.push({
      midi,
      folderName: `${midi - 40} - ${midiToNoteLabel(midi)}`,
      folderPath: dirOfFirst,
      layers: arr.map((x) => x.path),
      layerVelocities: arr.map((x) => x.velocity),
    });
  }
  if (dwByMidi.size > 0) {
    singleNotes.sort((a, b) => a.midi - b.midi);
  }

  const { vendorPrefix, displayName } = splitVendorName(folderName);

  return {
    id: folderName,
    folderName,
    vendorPrefix,
    displayName,
    hasSingleNotes: singleNotes.length > 0,
    hasChords: chords.length > 0,
    singleNotes,
    chords,
  };
}

// Parseaza TOATE librariile din listing (folderele de nivel 1).
export function scanLibraries(entries: DirEntry[]): GuitarLibraryInfo[] {
  const topDirs = entries.filter((e) => e.isDirectory && segs(e.path).length === 1);
  return topDirs
    .map((d) => parseLibrary(d.name, entries))
    .filter((l) => l.hasSingleNotes || l.hasChords);
}

// Variantele disponibile pentru o librarie (pentru meniu/Settings):
//   mereu "single"; plus "full" daca exista acorduri preinregistrate.
export function libraryVariants(lib: GuitarLibraryInfo): Array<"single" | "full"> {
  const out: Array<"single" | "full"> = [];
  if (lib.hasSingleNotes) out.push("single");
  if (lib.hasChords) out.push("full");
  return out;
}
