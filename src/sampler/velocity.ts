// Strategiile "Auto Vel" — reguli de velocity bazate pe teoria muzicala a
// chitarei (strumming / voice-leading), deterministe (nimic la intamplare).
//
// Principii din care derivam regulile:
//   - Downstroke (DS): pana loveste corzile GRAVE primele -> basul iese mai
//     tare, sunet plin; natural pe bataile tari.
//   - Upstroke (US): pana loveste ACUTELE primele -> acutele ies mai
//     proeminente, sunet mai usor; natural pe contratimp.
//   - Backbeat (BB): accentele cad pe bataile 2 si 4 (limbajul comun cu toba).
//   - Voice-leading: in acord, nota cea mai de sus (melodia) e scoasa in
//     evidenta; basul (radacina) da fundatia; notele interioare stau in spate.
//
// Rezultatul: pentru fiecare nota a unui acord, un velocity MIDI 0..127.
// Motorul sampler mapeaza velocity -> layer (32 de straturi la Single Notes,
// 8 la Chords). Deci strategia alege indirect stratul de atac real.

export type AutoVelStrategyId = "DS" | "US" | "DSU" | "BB" | "MT" | "BR" | "SW" | "PL";

export interface AutoVelStrategy {
  id: AutoVelStrategyId;
  code: string;
  name: string;
  desc: string;
}

export const AUTO_VEL_STRATEGIES: AutoVelStrategy[] = [
  { id: "DS", code: "DS", name: "Downstroke", desc: "accent pe bas, sunet plin (sweep descendent)" },
  { id: "US", code: "US", name: "Upstroke", desc: "accent pe acute, mai discret (sweep ascendent)" },
  { id: "DSU", code: "DSU", name: "Down/Up alternat", desc: "DS pe acorduri impare, US pe acorduri pare" },
  { id: "BB", code: "BB", name: "Backbeat", desc: "accent pe bătăile 2 și 4 ale măsurii" },
  { id: "MT", code: "MT", name: "Melody Top", desc: "vocea de sus (nota cea mai înaltă) scoasă în evidență" },
  { id: "BR", code: "BR", name: "Bass Root", desc: "rădăcina (basul) accentuată, restul mai încet" },
  { id: "SW", code: "SW", name: "Swell", desc: "crescendo treptat de la primul la ultimul acord" },
  { id: "PL", code: "PL", name: "Pulse", desc: "accent pe bătaia 1 a fiecărei măsuri" },
];

export interface AutoVelContext {
  // Indexul acordului in progresia SORTATA (0 = primul).
  chordIndex: number;
  // Pozitia absoluta pe timeline, in batai.
  startBeat: number;
  // Numarul total de acorduri din progresie (pentru swell).
  totalChords: number;
  // Batai pe masura (4/4).
  beatsPerBar: number;
}

const clamp = (v: number, lo = 30, hi = 127) => Math.min(hi, Math.max(lo, Math.round(v)));

// Velocity per nota pentru DS: basul (nota cea mai joasa) cel mai tare,
// fiecare semiton in sus reduce din intensitate.
function dsVelocities(notes: number[]): number[] {
  const min = Math.min(...notes);
  return notes.map((n) => clamp(114 - 5 * (n - min)));
}

// US: simetric — acutele (notele cele mai inalte) cel mai tare.
function usVelocities(notes: number[]): number[] {
  const min = Math.min(...notes);
  return notes.map((n) => clamp(86 + 5 * (n - min)));
}

// MT (Melody Top): nota cea mai inalta in evidenta, basul mediu, restul in spate.
function mtVelocities(notes: number[]): number[] {
  const min = Math.min(...notes);
  const max = Math.max(...notes);
  return notes.map((n) => (n === max ? 118 : n === min ? 82 : 66));
}

// BR (Bass Root): basul accentuat, restul mai incet.
function brVelocities(notes: number[]): number[] {
  const min = Math.min(...notes);
  return notes.map((n) => (n === min ? 118 : 76));
}

// Uniform: toate notele au acelasi velocity.
function uniform(notes: number[], v: number): number[] {
  return notes.map(() => clamp(v));
}

// Aplica strategia de velocity pe notele unui acord. `notes` sunt note MIDI
// (in ordine crescatoare, asa cum le produce chordNotes). Returneaza un
// velocity (0..127) PER NOTA, in aceeasi ordine.
export function applyAutoVel(
  notes: number[],
  strategy: AutoVelStrategyId,
  ctx: AutoVelContext
): number[] {
  if (notes.length === 0) return [];

  const beatInBar = Math.floor(ctx.startBeat) % Math.max(1, ctx.beatsPerBar);

  switch (strategy) {
    case "DS":
      return dsVelocities(notes);
    case "US":
      return usVelocities(notes);
    case "DSU":
      // DS pe acordurile 1,3,5... (index par), US pe 2,4,6... (index impar).
      return ctx.chordIndex % 2 === 0 ? dsVelocities(notes) : usVelocities(notes);
    case "BB":
      // Backbeat: accent pe bataile 2 si 4 (beatInBar 1 si 3, 0-based).
      return uniform(notes, beatInBar === 1 || beatInBar === 3 ? 114 : 84);
    case "MT":
      return mtVelocities(notes);
    case "BR":
      return brVelocities(notes);
    case "SW": {
      // Crescendo: velocity urca de la 72 (primul acord) la 118 (ultimul).
      if (ctx.totalChords <= 1) return uniform(notes, 100);
      const frac = ctx.chordIndex / (ctx.totalChords - 1);
      return uniform(notes, 72 + Math.round(frac * 46));
    }
    case "PL":
      // Pulse: accent pe bataia 1 a fiecarei masuri (beatInBar === 0).
      return uniform(notes, beatInBar === 0 ? 116 : 80);
    default:
      return uniform(notes, 100);
  }
}

// Velocity default (cand Auto Vel e dezactivat): 100 peste tot.
export function defaultVelocities(notes: number[]): number[] {
  return notes.map(() => 100);
}
