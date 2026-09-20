// Sugestii de articulatii/FX pentru progresii (acorduri complexe) sau un singur
// acord experimental, provenite de la instrumente cu corzi din toata lumea
// (crawl_similar). Fiecare sugestie poarta numele instrumentului, un echivalent
// Ample ('≈') si contextul in care apare (progresii/melodie/bass/arp/ostinato).

import { SUGESTII_SIMILARE, type SugestieSimilara } from "./similarData";

// Toate sugestiile, ordonate dupa instrument.
export function toateSugestiile(): SugestieSimilara[] {
  return [...SUGESTII_SIMILARE];
}

// Sugestiile unui anumit instrument (ex. "Sitar", "Chitara flamenco").
export function sugestiiInstrument(instrument: string): SugestieSimilara[] {
  return SUGESTII_SIMILARE.filter((s) =>
    s.instrument.toLowerCase().includes(instrument.toLowerCase()));
}

// Sugestiile potrivite pentru un context: "progresii" | "melodie" | "bass" |
// "arp" | "ostinato" | "ritm".
export function sugestiiContext(context: string): SugestieSimilara[] {
  return SUGESTII_SIMILARE.filter((s) => s.context.includes(context));
}

// Sugestii pentru un echivalent Ample dat (ex. "Rasgueado", "Slide", "Vibrato").
export function sugestiiApropiate(ampleTerm: string): SugestieSimilara[] {
  const q = ampleTerm.toLowerCase();
  return SUGESTII_SIMILARE.filter((s) => s.similar.toLowerCase().includes(q));
}

// Nume scurt si clar pt. o sugestie (instrument + termen), folosit in UI.
export function numeSugestie(s: SugestieSimilara): string {
  return s.sugestie;
}

// Pentru un strat al unei progresii (melodie/arp/bass/ostinato), intoarce
// sugestiile ce pot fi aplicate ca "condimente" (articulatie/FX similara).
export function condimentePentruStrat(strat: "melodie" | "arp" | "bass" | "ostinato" | "progresii"):
  SugestieSimilara[] {
  const map: Record<string, string> = {
    melodie: "melodie", arp: "arp", bass: "bass",
    ostinato: "ostinato", progresii: "progresii",
  };
  return sugestiiContext(map[strat]);
}
