// Test pentru parsarea numelor DirectWave/FL Studio (nume plate
// "<prefix>_<NotaFL>_<velocity>.wav") + parsarea unei librarii AGM.
// Rulare: node --experimental-strip-types scripts/test-sampler-directwave.mjs

import {
  flNoteNameToMidi,
  parseDirectWaveFileName,
  parseLibrary,
} from "../src/sampler/parseLibrary.ts";
import { SamplerEngine } from "../src/sampler/SamplerEngine.ts";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log("  ok  " + msg); }
  else { failed++; console.error("FAIL  " + msg); }
}

console.log("== flNoteNameToMidi (FL: middle C = C5 = 60) ==");
assert(flNoteNameToMidi("C5") === 60, "C5 -> 60");
assert(flNoteNameToMidi("E3") === 40, "E3 -> 40");
assert(flNoteNameToMidi("F#3") === 42, "F#3 -> 42");
assert(flNoteNameToMidi("C7") === 84, "C7 -> 84");
assert(flNoteNameToMidi("B6") === 83, "B6 -> 83");
assert(flNoteNameToMidi("xyz") === null, "invalid -> null");

console.log("== parseDirectWaveFileName ==");
const p1 = parseDirectWaveFileName("Ample Guitar M_E3_15.wav");
assert(p1 && p1.midi === 40 && p1.velocity === 15, "E3_15 -> midi 40, vel 15");
const p2 = parseDirectWaveFileName("Ample Guitar M_C7_121.wav");
assert(p2 && p2.midi === 84 && p2.velocity === 121, "C7_121 -> midi 84, vel 121");
const p3 = parseDirectWaveFileName("Ample Guitar M_F#3_45.wav");
assert(p3 && p3.midi === 42 && p3.velocity === 45, "F#3_45 -> midi 42, vel 45");
assert(parseDirectWaveFileName("1_E2.wav") === null, "fisier conventie veche (1_E2) -> null");
assert(parseDirectWaveFileName("Ample Guitar M.dwp") === null, ".dwp -> null");
assert(parseDirectWaveFileName("Ample Guitar M_E3.wav") === null, "fara velocity -> null");

console.log("== parseLibrary pe o librarie DirectWave (flat) ==");
const LIB = "AGM - 4.1.0 (Pick)";
const entries = [];
const dir = (n, p) => entries.push({ name: n, path: p, isDirectory: true, size: 0 });
const file = (n, p) => entries.push({ name: n, path: p, isDirectory: false, size: 1000 });
dir(LIB, LIB);
dir("Ample Guitar M", `${LIB}/Ample Guitar M`);
file("Ample Guitar M.dwp", `${LIB}/Ample Guitar M.dwp`);
// 2 note complete (E3 si C7), 8 velocity layers fiecare (valorile reale DW).
for (const vel of [15, 30, 45, 60, 76, 91, 106, 121]) {
  file(`Ample Guitar M_E3_${vel}.wav`, `${LIB}/Ample Guitar M/Ample Guitar M_E3_${vel}.wav`);
  file(`Ample Guitar M_C7_${vel}.wav`, `${LIB}/Ample Guitar M/Ample Guitar M_C7_${vel}.wav`);
}
const lib = parseLibrary(LIB, entries);
assert(lib.vendorPrefix === "AGM", "vendorPrefix = AGM");
assert(lib.displayName === "4.1.0 (Pick)", "displayName = 4.1.0 (Pick)");
assert(lib.hasSingleNotes === true, "hasSingleNotes true");
assert(lib.hasChords === false, "hasChords false (pick nu are Chords)");
assert(lib.singleNotes.length === 2, "2 note (" + lib.singleNotes.length + ")");
assert(lib.singleNotes[0].midi === 40, "prima nota MIDI 40 (E3 FL)");
assert(lib.singleNotes[1].midi === 84, "a doua MIDI 84 (C7 FL)");
assert(lib.singleNotes[0].layers.length === 8, "8 layers");
assert(lib.singleNotes[0].layers[0].endsWith("_E3_15.wav"), "primul layer = cel mai moale (15)");
assert(lib.singleNotes[0].layers[7].endsWith("_E3_121.wav"), "ultimul layer = cel mai tare (121)");
assert(
  JSON.stringify(lib.singleNotes[0].layerVelocities) === JSON.stringify([15, 30, 45, 60, 76, 91, 106, 121]),
  "layerVelocities pastrate in ordine"
);

console.log("== motor: velocity -> cel mai apropiat strat real ==");
const eng = new SamplerEngine(async () => null);
const g = lib.singleNotes[0];
assert(eng.velocityToLayerIndex(15, 8, g.layerVelocities) === 0, "vel 15 -> strat 0");
assert(eng.velocityToLayerIndex(25, 8, g.layerVelocities) === 1, "vel 25 -> strat 1 (mai aproape de 30 decat de 15)");
assert(eng.velocityToLayerIndex(120, 8, g.layerVelocities) === 7, "vel 120 -> strat 7 (121)");
assert(eng.velocityToLayerIndex(108, 8, g.layerVelocities) === 6, "vel 108 -> strat 6 (106)");
assert(eng.velocityToLayerIndex(127, 8, g.layerVelocities) === 7, "vel 127 -> strat 7 (plafonat)");
// fara layerVelocities -> mapare uniforma (comportament vechi, neafectat)
assert(eng.velocityToLayerIndex(63, 32) === 15, "fara layerVelocities: 63 -> 15 (32 layers)");

console.log("");
console.log(`Rezultat: ${passed} ok, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
