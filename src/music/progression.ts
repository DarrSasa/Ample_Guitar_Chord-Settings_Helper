// Generator EVOLUTIV de progresii, pe straturi (ca cei 12 folderi de carti):
//   acorduri (1-4) -> ritm/strum (9) -> arpeggio (6) -> bass (5) -> ostinato (7)
//   -> melodie (8) -> game/moduri (10) -> aranjament/articulatii (11-12).
// Fiecare strat e optional si se adauga peste cele anterioare, astfel incat o
// progresie simpla poate "evolua" pas cu pas spre un aranjament complet.

import {
  SCALE_FORMULAS, type Formula, NOTE_PC,
} from "./theory";

export interface Ev { beat: number; dur: number; midis: number[]; vel?: number }
export interface Layers {
  chords: Ev[]; rhythm: Ev[]; arpeggio: Ev[];
  melody: Ev[]; bass: Ev[]; ostinato: Ev[];
}
export interface ProgressionSpec {
  rootPc: number;
  scale?: keyof typeof SCALE_FORMULAS;
  degrees: number[];        // grade diatonice (1..7), una per masura
  seventh?: boolean;        // adauga septima diatonica in acorduri
  bpm?: number;
  style?: "rock" | "pop" | "funk" | "blues" | "jazz";
  layers?: Array<keyof Layers>; // straturile activate (evolutiv)
}

// nota diatonica pt. indexul de grad (1-based, continuu peste octava)
function degNote(rootPc: number, sc: Formula, idx: number, base = 36): number {
  const i = idx - 1;
  return base + rootPc + sc.iv[i % 7] + 12 * Math.floor(i / 7);
}

function chordFor(rootPc: number, sc: Formula, degree: number, seventh: boolean): number[] {
  const n = [degNote(rootPc, sc, degree), degNote(rootPc, sc, degree + 2), degNote(rootPc, sc, degree + 4)];
  if (seventh) n.push(degNote(rootPc, sc, degree + 6));
  return n;
}

// preseturi de ritm/ostinato per stil (pozitii in timpi de 4/4)
const STRUM: Record<string, Array<[number, number]>> = {
  rock: [[0, 1], [2, 1], [2.5, 0.5], [3, 1]],
  pop: [[0, 2], [2, 2]],
  funk: [[0, 0.5], [0.75, 0.25], [1.5, 0.5], [2.5, 0.5], [3.25, 0.25], [3.5, 0.5]],
  blues: [[0, 1], [1, 1], [2, 1], [3, 1]],
  jazz: [[0, 1.5], [1.5, 0.5], [2, 1.5], [3.5, 0.5]],
};
const BASSPAT: Record<string, number[]> = { rock: [0, 0, 4, 0], pop: [0, 0, 4, 4], funk: [0, 0, 3, 0, 4, 0], blues: [0, 2, 4, 6], jazz: [0, 2, 4, 5] };

export function buildProgression(spec: ProgressionSpec): Layers {
  const sc = SCALE_FORMULAS[spec.scale ?? "ionian"];
  const seventh = spec.seventh ?? false;
  const style = spec.style ?? "pop";
  const want = spec.layers ?? ["chords"];
  const bars = spec.degrees.length;

  const L: Layers = { chords: [], rhythm: [], arpeggio: [], melody: [], bass: [], ostinato: [] };

  for (let b = 0; b < bars; b++) {
    const start = b * 4;
    const d = spec.degrees[b];
    const notes = chordFor(spec.rootPc, sc, d, seventh);

    if (want.includes("chords")) L.chords.push({ beat: start, dur: 4, midis: notes });

    if (want.includes("rhythm"))
      for (const [t, dur] of STRUM[style]) L.rhythm.push({ beat: start + t, dur, midis: notes, vel: t === 0 ? 100 : 80 });

    if (want.includes("arpeggio"))
      for (let e = 0; e < 8; e++)
        L.arpeggio.push({ beat: start + e * 0.5, dur: 0.5, midis: [notes[e % notes.length] + (e >= notes.length ? 12 : 0)], vel: 70 });

    if (want.includes("bass")) {
      const root = notes[0] - 24; // doua octave sub radacina acordului
      const pat = BASSPAT[style] ?? BASSPAT.pop;
      pat.forEach((semi, i) => L.bass.push({ beat: start + i, dur: 1, midis: [root + semi], vel: 90 }));
    }

    if (want.includes("ostinato"))
      for (let e = 0; e < 8; e++) {
        const root = notes[0] - 12;
        const riff = [0, 0, 10, 0, 7, 0, 10, 12][e % 8];
        L.ostinato.push({ beat: start + e * 0.5, dur: 0.5, midis: [root + riff], vel: e % 2 ? 60 : 85 });
      }

    if (want.includes("melody")) {
      const phrase = [0, 2, 4, 2]; // contur simplu intrebare/raspuns
      phrase.forEach((k, i) =>
        L.melody.push({ beat: start + i, dur: 1, midis: [degNote(spec.rootPc, sc, d + k, 60)], vel: 85 }));
    }
  }
  return L;
}

export const PROGRESSION_PRESETS: Record<string, number[]> = {
  popAxis: [1, 5, 6, 4],
  dooWop: [1, 6, 4, 5],
  blues12: [1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5],
  jazz251: [2, 5, 1, 1],
  andalus: [1, 7, 6, 5],
};

export { NOTE_PC };
