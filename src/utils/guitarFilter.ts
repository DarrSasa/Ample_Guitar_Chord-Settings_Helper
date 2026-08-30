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
  label: string;
}

export const SIX_STRING: StringFilterConfig = {
  strings: [40, 45, 50, 55, 59, 64], // E2 A2 D3 G3 B3 E4
  maxFret: 22, maxSpan: 6, allowDuplicates: false, label: "6 corzi",
};
export const TWELVE_STRING: StringFilterConfig = {
  strings: [40, 45, 50, 55, 59, 64], // 6 cursuri (fiecare dublat)
  maxFret: 22, maxSpan: 7, allowDuplicates: true, label: "12 corzi (6 cursuri)",
};
export const BASS_FOUR: StringFilterConfig = {
  strings: [28, 33, 38, 43], // E1 A1 D2 G2
  maxFret: 22, maxSpan: 6, allowDuplicates: false, label: "bas 4 corzi",
};

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
  const cap = cfg.allowDuplicates ? 2 : 1;
  const counts = new Map<number, number>();
  for (const n of notes) counts.set(n, (counts.get(n) ?? 0) + 1);
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
  for (const n of notes) {
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
