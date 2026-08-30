// "Real Guitar String Filter" — reduce un acord la notele care POT fi cantate
// fizic pe instrumentul selectat, eliminand notele suplimentare din voicing-urile
// "pianistice". Fiecare nota pastra primeste o COARDA/CURS DISTINCT cu tasta in
// [0..maxFret], iar intinderea mainii (diferenta maxima dintre taste) e limitata
// la maxSpan. Configuratia depinde de chitara aleasa (6 corzi, 12 corzi, bas...).
//
// Abordare standard pt. playability: o nota e cantabila daca exista o coarda cu
// fret-ul in interval; un acord e cantabil daca notele lui distincte pot fi
// alocate unor corzi DISTINCTE simultan. Cautam submultimea maxima (backtracking).
//
// Pentru 12 corzi (6 cursuri): fiecare curs suna de 2 ori (unison/octava), deci
// aceeasi nota poate aparea de 2 ori fara sa consume un curs suplimentar
// (allowDuplicates=true).

import { familyFromName } from "./ampleExtensions";

export interface StringFilterConfig {
  strings: number[]; // corzile/cursurile (MIDI coarda libera), id implicit jos->sus
  maxFret: number;
  maxSpan: number;
  allowDuplicates: boolean; // 12 corzi: cursurile dubleaza fiecare nota
  maxVoices: number; // cate voci maxime pastram intr-un acord (voicing de chitara)
  label: string;
}

export const SIX_STRING: StringFilterConfig = {
  strings: [40, 45, 50, 55, 59, 64], // E2 A2 D3 G3 B3 E4
  maxFret: 22, maxSpan: 6, allowDuplicates: false, maxVoices: 4, label: "6 corzi",
};
export const TWELVE_STRING: StringFilterConfig = {
  strings: [40, 45, 50, 55, 59, 64], // 6 cursuri (fiecare dublat)
  maxFret: 22, maxSpan: 7, allowDuplicates: true, maxVoices: 4, label: "12 corzi (6 cursuri)",
};
export const BASS_FOUR: StringFilterConfig = {
  strings: [28, 33, 38, 43], // E1 A1 D2 G2
  maxFret: 22, maxSpan: 6, allowDuplicates: false, maxVoices: 4, label: "bas 4 corzi",
};

// Reduce un acord "pianistic" la o voce de chitara (max `maxVoices`), renuntand
// intai la octavile dublate, apoi la quinta justa, apoi la nota cea mai inalta.
// (Regula standard de voicing: pastram radacina, terta si septima/extensia.)
function reduceVoicing(notes: number[], maxVoices: number): number[] {
  const arr = [...notes];
  while (arr.length > maxVoices) {
    const pcCount = new Map<number, number>();
    for (const n of arr) pcCount.set(n % 12, (pcCount.get(n % 12) ?? 0) + 1);
    const dup = arr.filter((n) => (pcCount.get(n % 12) ?? 0) > 1).sort((a, b) => b - a);
    if (dup.length) { arr.splice(arr.indexOf(dup[0]), 1); continue; }
    const bass = Math.min(...arr);
    const fifths = arr.filter((n) => (n - bass) % 12 === 7).sort((a, b) => b - a);
    if (fifths.length) { arr.splice(arr.indexOf(fifths[0]), 1); continue; }
    arr.splice(arr.indexOf(Math.max(...arr)), 1);
  }
  return arr.sort((a, b) => a - b);
}

// Regula de voicing pe 6 corzi: extensiile (9, 4/11, 6/13) nu stau in aceeasi
// octava cu basul (ar ciocni cu radacina), ci SUNT RIDICATE o octava, deasupra
// radacinii. Astfel un "G sus4 7" nu pastreaza C3 jos (nota gri in plugin) ci
// il urca spre C4, ca in voicing-urile reale de chitara.
function voiceExtensions(notes: number[]): number[] {
  if (notes.length === 0) return notes;
  const bass = Math.min(...notes);
  return notes
    .map((n) => {
      if (n === bass) return n;
      const iv = (n - bass) % 12;
      if ((iv === 2 || iv === 5 || iv === 9) && n < bass + 12) return n + 12;
      return n;
    })
    .sort((a, b) => a - b);
}

// Filtrul SPECIFIC instrumentului selectat — se aplica automat la schimbarea
// chitarei. Extensibil: adauga aici alte modele (ex. 7 corzi, bariton...).
export function filterConfigForInstrument(name?: string | null): StringFilterConfig {
  const n = (name ?? "").toLowerCase();
  if (/12|twelve|doisprezece/.test(n)) return TWELVE_STRING;
  if (familyFromName(name) === "bas") return BASS_FOUR;
  return SIX_STRING;
}

export function filterChordToGuitar(
  notes: number[],
  cfg: StringFilterConfig = SIX_STRING
): number[] {
  // 0) reduce acordul la o voce de chitara (max `maxVoices`) inainte de alocare.
  const reduced = voiceExtensions(reduceVoicing(notes, cfg.maxVoices));
  const cap = cfg.allowDuplicates ? 2 : 1;
  const counts = new Map<number, number>();
  for (const n of reduced) counts.set(n, (counts.get(n) ?? 0) + 1);
  const distinct = Array.from(counts.keys()).sort((a, b) => a - b);

  const used = new Array(cfg.strings.length).fill(false);
  const cur: number[] = [];
  let best: number[] = [];
  let mn = Infinity, mx = -Infinity;

  const dfs = (i: number) => {
    if (cur.length > best.length) best = [...cur];
    if (i >= distinct.length) return;
    const m = distinct[i];
    for (let s = 0; s < cfg.strings.length; s++) {
      if (used[s]) continue;
      const f = m - cfg.strings[s];
      if (f < 0 || f > cfg.maxFret) continue;
      const nmn = Math.min(mn === Infinity ? f : mn, f);
      const nmx = Math.max(mx === -Infinity ? f : mx, f);
      if (nmx - nmn > cfg.maxSpan) continue;
      const pMn = mn, pMx = mx;
      used[s] = true; cur.push(m); mn = nmn; mx = nmx;
      dfs(i + 1);
      used[s] = false; cur.pop(); mn = pMn; mx = pMx;
    }
    dfs(i + 1); // sari nota
  };
  dfs(0);

  const kept = new Set(best);
  const emitted = new Map<number, number>();
  const out: number[] = [];
  for (const n of reduced) {
    if (!kept.has(n)) continue;
    const already = emitted.get(n) ?? 0;
    const limit = Math.min(counts.get(n) ?? 1, cap);
    if (already < limit) {
      out.push(n);
      emitted.set(n, already + 1);
    }
  }
  return out;
}
