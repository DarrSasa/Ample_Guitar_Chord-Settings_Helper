// Logica PURA pentru clipboard (copy/cut/paste) din Builder.
// Separata de React ca sa poata fi testata in Node.
//
// Reguli (user explicit):
//   - copy+paste: acordurile din dreapta se muta mereu la DREAPTA (fac loc).
//   - cut+paste:  se inchide gap-ul lasat de taiere — tot ce e la DREAPTA
//     gap-ului se muta la STANGA cu exact latimea gap-ului; acordul tăiat
//     se insereaza la pozitia aleasa (cu push-right ca la copy, apoi gap-ul
//     se inchide).
//   - cut/delete NU misca vecinii (lasa gap pe loc).

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

// Aplica paste-ul peste `base` la `insertIndex` (0..base.length, in ordinea
// vizuala sortata). Returneaza noul array + id-urile clonelor inserate.
export function applyPaste(
  base: ClipChord[],
  clip: ClipboardData,
  insertIndex: number
): { next: ClipChord[]; cloneIds: string[] } {
  const sorted = sortByStart(base);
  const totalWidth = clip.chords.reduce((s, x) => s + x.beats, 0);
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

  if (clip.mode === "cut") {
    // Inchidem gap-ul: tot ce e la dreapta marginii gap-ului (cutStart +
    // gapWidth) se muta la stanga cu gapWidth.
    const edge = clip.cutStart + clip.gapWidth;
    next = next.map((c) =>
      c.startBeat >= edge - 1e-6 ? { ...c, startBeat: c.startBeat - clip.gapWidth } : c
    );
    // Siguranta: rezolva suprapunerile reziduale (cazuri de colt), pastrand
    // duratele intacte si ordinea vizuala (push dreapta).
    next = sortByStart(next);
    for (let i = 0; i < next.length - 1; i++) {
      const end = next[i].startBeat + next[i].beats;
      if (next[i + 1].startBeat < end - 1e-6) {
        next[i + 1] = { ...next[i + 1], startBeat: end };
      }
    }
  }

  return { next, cloneIds };
}
