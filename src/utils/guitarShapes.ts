// Forme REALE de acord pe 6 corzi, din baza de date deschisa chords-db
// (tombatossals/chords-db, MIT, 828 acorduri / 3283 pozitii, cu array `midi`
// precalculat per pozitie). Folosita de filtrul de corzi pentru a inlocui
// voicing-ul "pianistic" cu o forma pe care o poate canta o chitara reala —
// astfel exportul/redarea corespund cu ce ar canta un chitarist (si cu ce
// accepta pluginul Ample fara note "gri").
//
// Surse alternative consultate: all-guitar-chords.com, oolimo.com,
// chordpic.com, pauldavidsguitar.com (aceeasi conventie de forme standard).

import db from "../../documente/baze/chords-db/guitar.json";

interface ParsedLike {
  root: string;
  type: string;
  extension: string;
  alteration: string;
  bass?: string;
}
interface Position { frets: number[]; baseFret?: number; midi?: number[] }

const CH = (db as { chords: Record<string, Position[][] | Position[]> }).chords;

// radacinile noastre (cu diezi) -> cheile bazei de date
const ROOT_DB: Record<string, string> = {
  C: "C", "C#": "Csharp", D: "D", "D#": "Eb", E: "E", F: "F",
  "F#": "Fsharp", G: "G", "G#": "Ab", A: "A", "A#": "Bb", B: "B",
};
const BASS_PC: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

// (tip, extensie, alteratie) -> sufixul folosit in chords-db
function suffixFor(t: string, e: string, a: string): string {
  if (t === "min") return e === "7" ? "m7" : e === "6" ? "m6" : e === "add9" ? "madd9" : "minor";
  if (t === "sus2") return "sus2";
  if (t === "sus4") return e === "7" ? "7sus4" : "sus4";
  if (t === "aug") return e === "7" ? "aug7" : "aug";
  if (t === "5") return "5";
  if (e === "7") return "7";
  if (e === "Maj7") return "maj7";
  if (e === "6") return "6";
  if (e === "add9") return "add9";
  if (a === "add11") return "add11";
  return "major";
}

function entriesFor(rootDb: string): { suffix: string; positions: Position[] }[] {
  const raw = CH[rootDb];
  if (!raw) return [];
  if (Array.isArray(raw) && raw.length && "suffix" in (raw[0] as object))
    return raw as { suffix: string; positions: Position[] }[];
  return [];
}

// Intoarce notele MIDI ale unei forme reale de chitara pt. acordul parsat,
// sau null daca acordul nu e in baza (caz in care se foloseste filtrul generic).
export function shapeMidiForChord(p: ParsedLike): number[] | null {
  const rootDb = ROOT_DB[p.root];
  if (!rootDb) return null;
  const suffix = suffixFor(p.type, p.extension, p.alteration);
  const entry = entriesFor(rootDb).find((e) => e.suffix === suffix);
  if (!entry || !entry.positions.length) return null;

  let pos = entry.positions[0];
  if (p.bass && BASS_PC[p.bass] !== undefined) {
    const want = BASS_PC[p.bass];
    const withBass = entry.positions.find(
      (pp) => pp.midi && pp.midi.length && pp.midi[0] % 12 === want
    );
    if (withBass) pos = withBass;
  }
  if (!pos.midi || pos.midi.length === 0) return null;
  return [...pos.midi].sort((a, b) => a - b);
}
