// Similar-instrument articulation/FX suggestions for progressions (complex
// chords) or a single experimental chord. Sourced from crawl_similar (world
// string instruments). Interface in English.

import { SIMILAR_SUGGESTIONS, type SimilarSuggestion } from "./similarData";

// All suggestions, ordered by instrument.
export function allSuggestions(): SimilarSuggestion[] {
  return [...SIMILAR_SUGGESTIONS];
}

// Suggestions for a given instrument (e.g. "Sitar", "Flamenco guitar").
export function suggestionsForInstrument(instrument: string): SimilarSuggestion[] {
  return SIMILAR_SUGGESTIONS.filter((s) =>
    s.instrument.toLowerCase().includes(instrument.toLowerCase()));
}

// Suggestions for a context: "progressions" | "melody" | "bass" | "arp" |
// "ostinato" | "rhythm".
export function suggestionsForContext(context: string): SimilarSuggestion[] {
  return SIMILAR_SUGGESTIONS.filter((s) => s.context.includes(context));
}

// Suggestions whose Ample equivalent matches a term (e.g. "Rasgueado", "Slide").
export function similarTo(ampleTerm: string): SimilarSuggestion[] {
  const q = ampleTerm.toLowerCase();
  return SIMILAR_SUGGESTIONS.filter((s) => s.similar.toLowerCase().includes(q));
}

// Short, clear display name for a suggestion (instrument + term).
export function suggestionName(s: SimilarSuggestion): string {
  return s.suggestion;
}

// "Seasonings" (similar articulation/FX) applicable to a progression layer.
export function seasoningsForLayer(
  layer: "melody" | "arp" | "bass" | "ostinato" | "progressions"
): SimilarSuggestion[] {
  return suggestionsForContext(layer);
}
