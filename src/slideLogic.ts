// Logica PURA pentru modul SLIDE (mutare prin press+drag in Builder).
// Separata de React ca sa poata fi testata in Node.
//
// Reguli (user explicit):
//   - Acordul tras isi pastreaza LUNGIMEA intacta (si vecinii la fel).
//   - Deplasare spre DREAPTA: cand intalneste un acord/grup la dreapta,
//     spatiile libere (gaps) dintre ele DISPAR — toate se lipesc edge-to-edge
//     si se deplaseaza impreuna cu cel tras (cascada push-dreapta).
//   - Deplasare spre STANGA: simetric cu dreapta — acordul/grupul se misca la
//     stanga consumand gaps-urile din stanga (le impinge la stanga). Se
//     OPRESTE doar cand nu mai exista niciun gap (totul e lipit si cel mai din
//     stanga a ajuns la beat 0). Lungimile raman intacte.

export interface SlideChord {
  id: string;
  beats: number;
  startBeat: number;
}

function sortByStart<T extends SlideChord>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.startBeat - b.startBeat);
}

export function applySlideMove<T extends SlideChord>(
  base: T[],
  groupIds: string[],
  deltaBeats: number
): T[] {
  if (deltaBeats === 0) return base.map((c) => ({ ...c }));
  const groupSet = new Set(groupIds);

  // Pasul 1: aplica delta pe membri (doar ei se misca initial).
  const moved: T[] = base.map((c) =>
    groupSet.has(c.id) ? { ...c, startBeat: c.startBeat + deltaBeats } : { ...c }
  );
  const movedById = new Map<string, T>();
  moved.forEach((c) => movedById.set(c.id, c));

  // Ordinea vizuala ORIGINALA (dupa startBeat din `base`).
  const originalOrder = sortByStart(base).map((c) => c.id);

  if (deltaBeats > 0) {
    // ---- DREAPTA: cascada push-dreapta (gaps dispar) ----
    let frontier = Number.NEGATIVE_INFINITY;
    for (const id of originalOrder) {
      const c = movedById.get(id)!;
      if (c.startBeat < frontier) {
        c.startBeat = frontier;
      }
      frontier = c.startBeat + c.beats;
    }
  } else {
    // ---- STANGA: cascada push-stanga (simetric cu dreapta) ----
    // Sweep de la dreapta la stanga: orice acord care s-ar suprapune peste
    // vecinul din stanga e impins la stanga. Cand cel mai din stanga ajunge
    // la 0, ne oprim (clamp) si reparam suprapunerile printr-un al doilea
    // pass care impinge spre dreapta (pastrand ordinea vizuala).
    let frontier = Number.POSITIVE_INFINITY;
    let anyClamped = false;
    for (let i = originalOrder.length - 1; i >= 0; i--) {
      const c = movedById.get(originalOrder[i])!;
      const cEnd = c.startBeat + c.beats;
      if (cEnd > frontier) {
        c.startBeat = frontier - c.beats;
      }
      if (c.startBeat < 0) {
        c.startBeat = 0;
        anyClamped = true;
      }
      frontier = c.startBeat;
    }
    if (anyClamped) {
      let leftFrontier = 0;
      for (const id of originalOrder) {
        const c = movedById.get(id)!;
        if (c.startBeat < leftFrontier) {
          c.startBeat = leftFrontier;
        }
        leftFrontier = c.startBeat + c.beats;
      }
    }
  }

  return moved;
}
