// "Real Guitar String Filter" — reduce un acord la notele care POT fi cantate
// fizic pe chitara (AGM, acordaj standard), eliminand notele suplimentare din
// voicing-urile "pianistice" (mai multe note decat corzi, sau note in afara
// grifului). Fiecare nota pastra primeste o COARDA DISTINCTA si o tasta in
// [0..maxFret], iar intinderea mainii (diferenta maxima dintre taste) e
// limitata la maxSpan. Notele care nu incap sunt eliminate.
//
// Abordare (standard pt. playability/voicing pe chitara): o nota e cantabila
// daca exista o coarda pe care fret-ul ei cade in interval; un acord e
// cantabil daca notele lui pot fi alocate unor corzi DISTINTE simultan.
// Cautam, prin backtracking, submultimea maxima de note alocabila.

export const GUITAR_STRINGS_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4

export interface StringFilterOptions {
  maxFret?: number; // tasta maxima acceptata (default 22)
  maxSpan?: number; // intinderea maxima a mainii in taste (default 6)
}

interface Assignment {
  kept: number[]; // notele pastrate (MIDI), ordine crescatoare
  span: number;
}

export function filterChordToGuitar(
  notes: number[],
  opts: StringFilterOptions = {}
): number[] {
  const maxFret = opts.maxFret ?? 22;
  const maxSpan = opts.maxSpan ?? 6;

  // elimina duplicatele exacte (o coarda nu suna de doua ori simultan) si
  // sorteaza crescator; pastreaza ordinea originala la final.
  const uniq = Array.from(new Set(notes)).sort((a, b) => a - b);

  let best: Assignment = { kept: [], span: 0 };

  const used = new Array(GUITAR_STRINGS_MIDI.length).fill(false);
  const current: number[] = [];
  let minFret = Infinity;
  let maxF = -Infinity;

  const fretOn = (midi: number, s: number) => midi - GUITAR_STRINGS_MIDI[s];

  const consider = (midi: number, s: number) => {
    const f = fretOn(midi, s);
    if (f < 0 || f > maxFret) return null;
    const nMin = Math.min(minFret === Infinity ? f : minFret, f);
    const nMax = Math.max(maxF === -Infinity ? f : maxF, f);
    if (nMax - nMin > maxSpan) return null;
    return { f, nMin, nMax };
  };

  const dfs = (i: number) => {
    // actualizeaza best: preferam mai multe note, apoi span mai mic
    if (current.length > best.kept.length ||
        (current.length === best.kept.length && current.length > 0 &&
         (maxF - minFret) < best.span)) {
      best = { kept: [...current], span: maxF - minFret };
    }
    if (i >= uniq.length) return;
    const midi = uniq[i];

    // optiunea 1: incearca sa o pui pe o coarda libera fezabila
    for (let s = 0; s < GUITAR_STRINGS_MIDI.length; s++) {
      if (used[s]) continue;
      const c = consider(midi, s);
      if (!c) continue;
      const pMin = minFret, pMax = maxF;
      used[s] = true; current.push(midi); minFret = c.nMin; maxF = c.nMax;
      dfs(i + 1);
      used[s] = false; current.pop(); minFret = pMin; maxF = pMax;
    }
    // optiunea 2: sari nota (nu e cantabila simultan cu restul)
    dfs(i + 1);
  };

  dfs(0);

  // pastreaza ordinea originala a notelor pastrate; elimina duplicatele
  // (aceeasi nota nu poate suna de doua ori simultan pe o singura chitara)
  const keptSet = new Set(best.kept);
  return notes.filter((n, i) => keptSet.has(n) && notes.indexOf(n) === i);
}
