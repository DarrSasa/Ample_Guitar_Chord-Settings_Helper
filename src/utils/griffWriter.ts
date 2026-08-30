// Serializer .griff / .briff / .uriff (formatul Riffer de la Ample Sound).
// Schema descifrata din fisierele reale urcate in documente/griff/exporturi/
// (AGM.griff etc.): root <Riff> cu atribute (Inst, Ver 2.1, PPQBase 480, Tempo,
// Measures, Key, Time-Signature, ccName-*), copii <String ID="n"> fiecare cu
// <Note Velocity Off-Velocity Begin End Articulation Fret NoteID Legato Muted/>.
//
// Acesta e o prima trecere (note + timing + velocity); articulatiile/FX vin
// ulterior. Valideaza prin drop in Riffer.

export interface GriffNote {
  midi: number;
  velocity: number;
}
export interface GriffChord {
  startBeats: number;
  beats: number;
  notes: GriffNote[];
}

export type GriffStrings = "guitar" | "bass" | "ukulele";

// Corzile (id + coarda libera MIDI). ID 1 = coarda cea mai subtire.
const TUNINGS: Record<GriffStrings, { id: number; o: number }[]> = {
  guitar: [
    { id: 6, o: 40 }, { id: 5, o: 45 }, { id: 4, o: 50 },
    { id: 3, o: 55 }, { id: 2, o: 59 }, { id: 1, o: 64 },
  ],
  bass: [
    { id: 4, o: 28 }, { id: 3, o: 33 }, { id: 2, o: 38 }, { id: 1, o: 43 },
  ],
  ukulele: [
    { id: 4, o: 60 }, { id: 3, o: 64 }, { id: 2, o: 67 }, { id: 1, o: 69 },
  ],
};

function alegeCoarda(midi: number, t: { id: number; o: number }[]) {
  let best: { id: number; fret: number } | null = null;
  for (const s of t) {
    const fret = midi - s.o;
    if (fret >= 0 && fret <= 24 && (!best || fret < best.fret))
      best = { id: s.id, fret };
  }
  if (best) return best;
  // in afara intervalului: pune pe coarda cea mai apropiata
  const low = t[t.length - 1];
  const high = t[0];
  if (midi < low.o) return { id: low.id, fret: Math.max(0, midi - low.o) };
  return { id: high.id, fret: midi - high.o };
}

export function createGriffFile(
  chords: GriffChord[],
  opts: { bpm: number; inst: string; strings: GriffStrings; key?: string }
): Uint8Array {
  const ppq = 480;
  const tuning = TUNINGS[opts.strings];
  const sorted = [...chords].sort((a, b) => a.startBeats - b.startBeats);

  // group note events per string id
  const byString = new Map<number, string[]>();
  let maxEndBeats = 0;

  for (const c of sorted) {
    const begin = Math.round(c.startBeats * ppq);
    const end = begin + Math.round(c.beats * ppq);
    maxEndBeats = Math.max(maxEndBeats, c.startBeats + c.beats);
    for (const n of c.notes) {
      const { id, fret } = alegeCoarda(n.midi, tuning);
      const vel = Math.max(1, Math.min(126, Math.round(n.velocity)));
      const line =
        `    <Note Velocity="${vel}" Off-Velocity="0" Begin="${begin}" ` +
        `End="${end}" Articulation="Sus" Fret="${fret}" NoteID="${n.midi}" ` +
        `Legato="No Legato" Muted="False"/>`;
      byString.set(id, [...(byString.get(id) ?? []), line]);
    }
  }

  const measures = Math.max(1, Math.ceil(maxEndBeats / 4));
  const numStr = tuning.length;

  const cc = opts.strings === "bass" ? "ABJ" : opts.inst;
  const head =
    `<?xml version="1.0" encoding="UTF-8"?>\n\n` +
    `<Riff Author="" Category="Rock" Measures="${measures}" Time-Signature="4/4"\n` +
    `      Quantize="1/4" Tempo="${Math.round(opts.bpm)}" Type="Riff" Rating="0" ` +
    `numStr="${numStr}" Inst="${cc}"\n` +
    `      Ver="2.1" PPQBase="${ppq}" loopMode="false" loopStart="0" loopEnd="0"\n` +
    `      Key="${opts.key ?? "C"}" ccName-0="Bend" ccVisibility-0="1" ` +
    `ccName-1="1.Mod" ccVisibility-1="1"\n` +
    `      ccName-3="64.Hold" ccVisibility-3="1" ccName-4="7.Volume" ` +
    `ccVisibility-4="1"\n      ccAtTop="">\n`;

  let body = "";
  // ordine corzi: de la id mare la mic (ca in fisierul de referinta)
  const ids = [...byString.keys()].sort((a, b) => b - a);
  for (const id of ids) {
    body += `  <String ID="${id}">\n` + byString.get(id)!.join("\n") + `\n  </String>\n`;
  }

  const tail =
    `  <cc-7.Volume>\n    <p tick="0" value="100" curveType="stair"/>\n  </cc-7.Volume>\n` +
    `  <cc-10.Pan>\n    <p tick="0" value="64" curveType="stair"/>\n  </cc-10.Pan>\n` +
    `  <cc-64.Hold>\n    <p tick="0" value="0" curveType="stair"/>\n  </cc-64.Hold>\n` +
    `  <cc-91.ExtEff1Depth>\n    <p tick="0" value="48" curveType="stair"/>\n  </cc-91.ExtEff1Depth>\n` +
    `  <cc-121.ResetCtrl>\n    <p tick="0" value="0" curveType="stair"/>\n  </cc-121.ResetCtrl>\n` +
    `</Riff>\n`;

  const text = head + body + tail;
  return new TextEncoder().encode(text);
}
