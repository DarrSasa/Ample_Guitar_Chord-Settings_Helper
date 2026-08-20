// Logica PURA pentru modul SLIDE (mutare prin press+drag in Builder).
// Separata de React ca sa poata fi testata in Node.
//
// Reguli (user explicit):
//   - Acordul tras isi pastreaza LUNGIMEA intacta (si vecinii la fel).
//   - Deplasare spre DREAPTA: cand intalneste un acord/grup la dreapta,
//     spatiile libere (gaps) dintre ele DISPAR — toate se lipesc edge-to-edge
//     si se deplaseaza impreuna cu cel tras (cascada push-dreapta).
//   - Deplasare spre STANGA: spatiile libere dispar cat timp trage spre stanga;
//     in momentul in care nu mai exista niciun gap la stanga, miscarea se
//     OPRESTE (ramane lipit de acordul din stanga) — vecinul din stanga NU se
//     muta si NU-si modifica lungimea.

export interface SlideChord {
  id: string;
  beats: number;
  startBeat: number;
}

const EPS = 1e-9;

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
    // ---- STANGA: clamp la acordul din stanga (stop, nu push) ----
    // Gasim membrul cel mai din stanga (dupa pozitia ORIGINALA).
    const members = base.filter((c) => groupSet.has(c.id));
    const leftmostMember = members.reduce((a, b) => (a.startBeat <= b.startBeat ? a : b));
    const leftmostStart = leftmostMember.startBeat;

    // Vecinul non-membru cel mai apropiat la STANGA = cel cu cel mai mare end
    // care e <= start-ul original al membrului stang.
    let leftBoundary = 0; // implicit: limita 0 (inceputul timeline-ului)
    for (const c of base) {
      if (groupSet.has(c.id)) continue;
      const cEnd = c.startBeat + c.beats;
      if (cEnd <= leftmostStart + EPS) {
        leftBoundary = Math.max(leftBoundary, cEnd);
      }
    }

    // Cat de mult poate cobora membrul stang fara sa treaca peste limita.
    const clampedStart = Math.max(leftmostMember.startBeat + deltaBeats, leftBoundary);
    const correction = clampedStart - (leftmostMember.startBeat + deltaBeats);
    if (correction > EPS) {
      // Aplicam aceeasi corectie la TOTI membrii (rigid), ca grupul sa ramana
      // lipit si sa NU impinga vecinii din stanga.
      for (const id of groupIds) {
        const c = movedById.get(id);
        if (c) c.startBeat += correction;
      }
    }
  }

  return moved;
}
