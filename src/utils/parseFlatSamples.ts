// Parsarea mostrelor audio dintr-un folder FLAT (fara subfoldere), ca cel nou
// al chitarei AGM: toate WAV-urile stau impreuna, numite
//   <Articulatie>_<Nota>_<Velocity>.wav   (ex. "Sustain_E3_60.wav",
//   "Palm Mute_D5_91.wav", "Scratch_F7_121.wav").
// Vezi documente/griff/secventa_v2/AGM/Samples_List_AGM - 4.1.0-Pick.txt si
// manifestul generat samples_AGM.json.

export interface FlatSample {
  articulation: string;
  note: string; // ex. "E3", "F#7"
  velocity: number;
}

const RX = /^(?<art>.+)_(?<note>[A-G]#?\d+)_(?<vel>\d+)\.wav$/i;

// Descompune un nume de fisier flat; null daca nu respecta sablonul.
export function parseFlatSampleName(name: string): FlatSample | null {
  const m = RX.exec(name);
  if (!m || !m.groups) return null;
  return {
    articulation: m.groups.art,
    note: m.groups.note,
    velocity: parseInt(m.groups.vel, 10),
  };
}

// Index pe articulatii: articulatie -> nota -> velocity[] (sortate).
export function buildFlatIndex(
  names: string[]
): Map<string, Map<string, number[]>> {
  const idx = new Map<string, Map<string, number[]>>();
  for (const n of names) {
    const p = parseFlatSampleName(n);
    if (!p) continue;
    let byNote = idx.get(p.articulation);
    if (!byNote) {
      byNote = new Map();
      idx.set(p.articulation, byNote);
    }
    const arr = byNote.get(p.note) ?? [];
    arr.push(p.velocity);
    byNote.set(p.note, arr);
  }
  for (const byNote of idx.values())
    for (const [k, v] of byNote) byNote.set(k, [...v].sort((a, b) => a - b));
  return idx;
}
