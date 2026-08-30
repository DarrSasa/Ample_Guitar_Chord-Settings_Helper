// Teorie muzicala structurata (formule de acorduri, game/moduri, acordaje),
// organizata dupa informatia de tip JGuitar (chord/scale/tuning calculators).
// Continutul e reprezentare proprie a unor fapte muzicale standard (intervale),
// nu text copiat. Folosit pentru a genera acorduri/game in mod evolutiv.

export const NOTE_PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export interface Formula { name: string; iv: number[] }

// ---- ACORDURI (tip -> intervale fata de radacina) -------------------------
export const CHORD_FORMULAS: Record<string, Formula> = {
  major:    { name: "Major", iv: [0, 4, 7] },
  minor:    { name: "Minor", iv: [0, 3, 7] },
  dim:      { name: "Diminished", iv: [0, 3, 6] },
  aug:      { name: "Augmented", iv: [0, 4, 8] },
  sus2:     { name: "Suspended 2nd", iv: [0, 2, 7] },
  sus4:     { name: "Suspended 4th", iv: [0, 5, 7] },
  majb5:    { name: "Major Flat 5th", iv: [0, 4, 6] },
  minb5:    { name: "Minor Flat 5th", iv: [0, 3, 6] },
  "5":      { name: "5th (power)", iv: [0, 7] },
  "7":      { name: "7th", iv: [0, 4, 7, 10] },
  m7:       { name: "Minor 7th", iv: [0, 3, 7, 10] },
  maj7:     { name: "Major 7th", iv: [0, 4, 7, 11] },
  mM7:      { name: "Minor Major 7th", iv: [0, 3, 7, 11] },
  dim7:     { name: "Diminished 7th", iv: [0, 3, 6, 9] },
  aug7:     { name: "Augmented 7th", iv: [0, 4, 8, 10] },
  "7b5":    { name: "7th Flat 5th", iv: [0, 4, 6, 10] },
  maj7b5:   { name: "Major 7th Flat 5th", iv: [0, 4, 6, 11] },
  m7b5:     { name: "Minor 7th Flat 5th", iv: [0, 3, 6, 10] },
  "6":      { name: "6th", iv: [0, 4, 7, 9] },
  m6:       { name: "Minor 6th", iv: [0, 3, 7, 9] },
  add9:     { name: "6th Add 9th", iv: [0, 4, 7, 9, 14] },
  madd9:    { name: "Minor 6th Add 9th", iv: [0, 3, 7, 9, 14] },
  "9":      { name: "9th", iv: [0, 4, 7, 10, 14] },
  m9:       { name: "Minor 9th", iv: [0, 3, 7, 10, 14] },
  maj9:     { name: "Major 9th", iv: [0, 4, 7, 11, 14] },
  "7b9":    { name: "7th Flat 9th", iv: [0, 4, 7, 10, 13] },
  "7#9":    { name: "7th Sharp 9th", iv: [0, 4, 7, 10, 15] },
  "11":     { name: "11th", iv: [0, 4, 7, 10, 17] },
  m11:      { name: "Minor 11th", iv: [0, 3, 7, 10, 17] },
  maj7s11:  { name: "Major Sharp 11th", iv: [0, 4, 7, 11, 18] },
  "13":     { name: "13th", iv: [0, 4, 7, 10, 21] },
  m13:      { name: "Minor 13th", iv: [0, 3, 7, 10, 21] },
  "69":     { name: "6th Add 9th (6/9)", iv: [0, 4, 7, 9, 14] },
  "7sus4":  { name: "7th Suspended 4th", iv: [0, 5, 7, 10] },
  "7sus2":  { name: "7th Suspended 2nd", iv: [0, 2, 7, 10] },
  sus2sus4: { name: "Suspended 2nd Suspended 4th", iv: [0, 2, 5, 7] },
  add11:    { name: "Major Add 11th", iv: [0, 4, 7, 17] },
};

// ---- GAME / MODURI (tip -> intervale) -------------------------------------
export const SCALE_FORMULAS: Record<string, Formula> = {
  ionian:      { name: "Ionian (Major)", iv: [0, 2, 4, 5, 7, 9, 11] },
  dorian:      { name: "Dorian", iv: [0, 2, 3, 5, 7, 9, 10] },
  phrygian:    { name: "Phrygian", iv: [0, 1, 3, 5, 7, 8, 10] },
  lydian:      { name: "Lydian", iv: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian:  { name: "Mixolydian", iv: [0, 2, 4, 5, 7, 9, 10] },
  aeolian:     { name: "Aeolian (Minor)", iv: [0, 2, 3, 5, 7, 8, 10] },
  locrian:     { name: "Locrian", iv: [0, 1, 3, 5, 6, 8, 10] },
  melMinor:    { name: "Melodic Minor", iv: [0, 2, 3, 5, 7, 9, 11] },
  phryg6:      { name: "Phrygian #6", iv: [0, 1, 3, 5, 7, 9, 10] },
  lydianAug:   { name: "Lydian Augmented", iv: [0, 2, 4, 6, 8, 9, 11] },
  lydianDom:   { name: "Lydian Dominant", iv: [0, 2, 4, 6, 7, 9, 10] },
  mixb6:       { name: "Mixolydian b6", iv: [0, 2, 4, 5, 7, 8, 10] },
  locrian2:    { name: "Locrian #2", iv: [0, 2, 3, 5, 6, 8, 10] },
  altered:     { name: "Altered", iv: [0, 1, 3, 4, 6, 8, 10] },
  wholeTone:   { name: "Whole Tone", iv: [0, 2, 4, 6, 8, 10] },
  dimWH:       { name: "Diminished Whole-Half", iv: [0, 1, 3, 4, 6, 7, 9, 10] },
  dimHW:       { name: "Diminished Half-Whole", iv: [0, 2, 3, 5, 6, 8, 9, 11] },
  majPent:     { name: "Major Pentatonic", iv: [0, 2, 4, 7, 9] },
  minPent:     { name: "Minor Pentatonic", iv: [0, 3, 5, 7, 10] },
  susPent:     { name: "Suspended Pentatonic", iv: [0, 2, 5, 7, 10] },
  domPent:     { name: "Dominant Pentatonic", iv: [0, 4, 7, 10, 14] },
  insen:       { name: "Japanese In Sen", iv: [0, 1, 5, 7, 10] },
  blues:       { name: "Blues", iv: [0, 3, 5, 6, 7, 10] },
  bebopMaj:    { name: "Bebop Major", iv: [0, 2, 4, 5, 7, 8, 9, 11] },
  bebopDom:    { name: "Bebop Dominant", iv: [0, 2, 4, 5, 7, 9, 10, 11] },
  bebopMin:    { name: "Bebop Minor", iv: [0, 2, 3, 5, 7, 9, 10, 11] },
  harmMaj:     { name: "Harmonic Major", iv: [0, 2, 4, 5, 8, 9, 11] },
  harmMin:     { name: "Harmonic Minor", iv: [0, 2, 3, 5, 7, 8, 11] },
  dblHarm:     { name: "Double Harmonic Major", iv: [0, 1, 4, 5, 7, 8, 11] },
  hungGypsy:   { name: "Hungarian Gypsy", iv: [0, 2, 3, 6, 7, 8, 11] },
  phrygDom:    { name: "Phrygian Dominant (Spanish)", iv: [0, 1, 4, 5, 7, 8, 10] },
  chromatic:   { name: "Chromatic", iv: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

// ---- ACORDAJE (instrument -> MIDI corzi, jos->sus) ------------------------
export const TUNINGS: Record<string, number[]> = {
  guitarStd: [40, 45, 50, 55, 59, 64],
  dropD:     [38, 45, 50, 55, 59, 64],
  dadgad:    [38, 45, 50, 55, 57, 62],
  openG:     [38, 47, 50, 55, 59, 62],
  halfDown:  [39, 44, 49, 54, 58, 63],
  bass4:     [28, 33, 38, 43],
  bass5:     [28, 33, 38, 43, 48],
  twelve:    [40, 45, 50, 55, 59, 64], // 6 cursuri (dublate la redare)
  ukulele:   [67, 60, 64, 69],
};

// Construieste notele MIDI ale unui acord dintr-o formula, cu extensiile
// (9/11/13) urcand in octave superioare (voicing tertian realist).
export function buildNotes(rootPc: number, iv: number[], baseMidi = 36): number[] {
  return iv.map((i) => baseMidi + rootPc + i);
}

// Notele MIDI "compacte" (toate in aceeasi octava pornind de la baseMidi).
export function buildNotesCompact(rootPc: number, iv: number[], baseMidi = 48): number[] {
  return iv.map((i) => baseMidi + ((rootPc + i) % 12));
}

export function degreeNotes(rootPc: number, scaleIv: number[], degree: number, baseMidi = 48): number {
  const iv = scaleIv[((degree - 1) % 7 + 7) % 7];
  return baseMidi + ((rootPc + iv) % 12);
}
