// Logica PURA pentru clipboard (copy/cut/paste) din Builder.
// Separata de React ca sa poata fi testata in Node.
//
// Reguli (user explicit):
//   - copy+paste: acordurile din dreapta se muta mereu la DREAPTA (fac loc).
//   - cut+paste:  se inchide gap-ul lasat de taiere — tot ce e la DREAPTA
//     gap-ului se muta la STANGA cu exact latimea gap-ului.
//   - cut/delete NU misca vecinii (lasa gap pe loc).
//   - PASTE IN GAP (valabil si pentru copy, si pentru cut): cand lipesti un
//     SINGUR acord intr-un spatiu liber, acordul se potriveste in gap:
//       1.1 daca e mai LUNG decat gap-ul -> se micsoreaza exact la gap.
//       1.2 daca e mai SCURT -> se aliniaza la bara ritmica din stanga
//           cursorului; daca nu incape pana la acordul din dreapta, se
//           micsoreaza sa se potriveasca. Vecinii raman FIXI (nu se misca,
//           nu-si modifica lungimea).

export interface ClipChord {
  id: string;
  label: string;
  beats: number;
  startBeat: number;
}

export interface ClipboardData {
  chords: ClipChord[];
  mode: "copy" | "cut";
  cutStart: number; // valid doar pt cut (start-ul gap-ului)
  gapWidth: number; // valid doar pt cut (latimea gap-ului = suma beats)
}

export interface PasteResult {
  next: ClipChord[];
  cloneIds: string[];
}

const MIN_CHORD_BEATS = 1 / 8;
const EPS = 1e-9;

export function sortByStart<T extends ClipChord>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.startBeat - b.startBeat);
}

export function progressionEndBeat(chords: ClipChord[]): number {
  return chords.reduce((m, c) => Math.max(m, c.startBeat + c.beats), 0);
}

// Construieste clipboard-ul pentru o taiere (cut). `target` = acordurile
// selectate (sau acordul de sub cursor), sortate dupa startBeat.
export function makeCutClipboard(target: ClipChord[]): ClipboardData {
  const sorted = sortByStart(target);
  const gapWidth = sorted.reduce((s, c) => s + c.beats, 0);
  const cutStart = sorted.length > 0 ? sorted[0].startBeat : 0;
  return { chords: sorted.map((c) => ({ ...c })), mode: "cut", cutStart, gapWidth };
}

export function makeCopyClipboard(target: ClipChord[]): ClipboardData {
  return {
    chords: sortByStart(target).map((c) => ({ ...c })),
    mode: "copy",
    cutStart: 0,
    gapWidth: 0,
  };
}

// Rezolva suprapunerile reziduale (push la dreapta, pastrand duratele).
function resolveOverlaps(arr: ClipChord[]): ClipChord[] {
  const next = sortByStart(arr);
  for (let i = 0; i < next.length - 1; i++) {
    const end = next[i].startBeat + next[i].beats;
    if (next[i + 1].startBeat < end - EPS) {
      next[i + 1] = { ...next[i + 1], startBeat: end };
    }
  }
  return next;
}

// Inchide gap-ul lasat de "cut": tot ce e la dreapta marginii gap-ului
// (cutStart + gapWidth) se muta la stanga cu gapWidth.
//
// NU inchidem gap-ul daca taietura e la INCEPUTUL progresiei (nu exista niciun
// acord la stanga gaurii) — altfel, dupa paste, TOATA progresia s-ar muta la
// stanga (user explicit: nu trebuie sa existe nicio miscare a progresiei cand
// tai primul acord si lipesti inapoi intr-un gap).
function closeCutGap(
  arr: ClipChord[],
  clip: ClipboardData,
  baseSorted: ClipChord[]
): ClipChord[] {
  const hasLeft = baseSorted.some((c) => c.startBeat + c.beats <= clip.cutStart + EPS);
  if (!hasLeft) return arr;
  const edge = clip.cutStart + clip.gapWidth;
  return arr.map((c) =>
    c.startBeat >= edge - EPS ? { ...c, startBeat: c.startBeat - clip.gapWidth } : c
  );
}

// Aplica paste-ul peste `base`.
//   - `insertIndex`: pozitia in ordinea vizuala (folosita cand NU suntem in gap).
//   - `dropBeat`: pozitia cursorului in batai (folosita pt. regulile de gap).
//   - `snapBeats`: pasul de grid ritmic (pt. alinierea la bara din stanga).
export function applyPaste(
  base: ClipChord[],
  clip: ClipboardData,
  insertIndex: number,
  dropBeat?: number,
  snapBeats?: number
): PasteResult {
  const sorted = sortByStart(base);
  const totalWidth = clip.chords.reduce((s, x) => s + (x.beats > 0 ? x.beats : 4), 0);

  // --- PASTE IN GAP (un singur acord) ---
  if (
    clip.chords.length === 1 &&
    dropBeat !== undefined &&
    snapBeats !== undefined &&
    snapBeats > 0
  ) {
    const L = clip.chords[0].beats > 0 ? clip.chords[0].beats : 4;

    // Gasim gap-ul care contine dropBeat.
    let prev: ClipChord | null = null;
    let next: ClipChord | null = null;
    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i];
      if (c.startBeat + c.beats <= dropBeat + EPS) prev = c;
      else { next = c; break; }
    }
    const gapStart = prev ? prev.startBeat + prev.beats : 0;
    const gapEnd = next ? next.startBeat : Number.POSITIVE_INFINITY;
    const inRealGap = gapEnd - gapStart > EPS;

    if (inRealGap) {
      const gapW = gapEnd - gapStart;
      let start: number;
      let beats: number;

      if (L >= gapW - EPS) {
        // 1.1: acord mai lung decat gap-ul -> micsorat exact la gap.
        start = gapStart;
        beats = gapW;
      } else {
        // 1.2: acord mai scurt -> aliniere la bara ritmica din stanga.
        let firstStart = Math.floor(dropBeat / snapBeats) * snapBeats;
        // Caz A: bara e "acoperita" de acordul din stanga -> lipeste de el.
        if (firstStart < gapStart) firstStart = gapStart;
        beats = L;
        // Caz C: nu incape pana la acordul din dreapta -> micsorat.
        if (firstStart + beats > gapEnd - EPS) {
          beats = Math.max(MIN_CHORD_BEATS, gapEnd - firstStart);
        }
        start = firstStart;
      }

      const cloneId = crypto.randomUUID();
      const clone: ClipChord = { id: cloneId, label: clip.chords[0].label, beats, startBeat: start };

      // Vecinii raman FIXI (nu se misca, nu se modifica). Daca e cut, se
      // inchide totusi gap-ul taietii (regula cut+paste), DAR doar daca nu e
      // taietura de la inceputul progresiei (closeCutGap face verificarea).
      let nextArr: ClipChord[] = [...sorted, clone];
      if (clip.mode === "cut") nextArr = closeCutGap(nextArr, clip, sorted);
      return { next: resolveOverlaps(nextArr), cloneIds: [cloneId] };
    }
  }

  // --- Paste normal (nu in gap): push-dreapta ---
  const safeIndex = Math.max(0, Math.min(insertIndex, sorted.length));
  let cursor: number;
  let shiftedTail: ClipChord[];
  if (safeIndex >= sorted.length) {
    cursor = progressionEndBeat(sorted);
    shiftedTail = [];
  } else {
    cursor = sorted[safeIndex].startBeat;
    shiftedTail = sorted.slice(safeIndex).map((c) => ({ ...c, startBeat: c.startBeat + totalWidth }));
  }

  const cloneIds: string[] = [];
  const clones: ClipChord[] = clip.chords.map((x) => {
    const beats = x.beats > 0 ? x.beats : 4;
    const c = { id: crypto.randomUUID(), label: x.label, beats, startBeat: cursor };
    cursor += beats;
    cloneIds.push(c.id);
    return c;
  });

  let next: ClipChord[] = [...sorted.slice(0, safeIndex), ...clones, ...shiftedTail];
  if (clip.mode === "cut") next = closeCutGap(next, clip, sorted);
  return { next: resolveOverlaps(next), cloneIds };
}
