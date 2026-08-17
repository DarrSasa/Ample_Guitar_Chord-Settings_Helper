// Test pentru parserul de librarii sampler (src/sampler/parseLibrary.ts).
// Rulat cu:  node --experimental-strip-types scripts/test-sampler-parser.mjs
// Construieste un listing sintetic care reproduce structura reala a librariei
// "RS - Acoustic Guitar 1" si verifica regulile de parsare.

import { parseLibrary, scanLibraries, libraryVariants, singleNoteMidiFromFolder, parseChordFolder, splitVendorName, layerIndexFromFileName } from "../src/sampler/parseLibrary.ts";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log("  ok  " + msg);
  } else {
    failed++;
    console.error("FAIL  " + msg);
  }
}

const LIB = "RS - Acoustic Guitar 1";

// Builder de intrari.
const entries = [];
function dir(name, path) { entries.push({ name, path, isDirectory: true, size: 0 }); }
function file(name, path, size = 1000) { entries.push({ name, path, isDirectory: false, size }); }

dir(LIB, LIB);
dir("Chords", `${LIB}/Chords`);
dir("Single Notes", `${LIB}/Single Notes`);

// Chords: A Major (8 layers), A Minor (8), E2 Major (voicing special), si un
// folder non-chord (User Guide) care trebuie ignorat.
dir("A Major", `${LIB}/Chords/A Major`);
for (let k = 1; k <= 8; k++) file(`${k}_AC.wav`, `${LIB}/Chords/A Major/${k}_AC.wav`);
dir("A Minor", `${LIB}/Chords/A Minor`);
for (let k = 1; k <= 8; k++) file(`${k}_AmC.wav`, `${LIB}/Chords/A Minor/${k}_AmC.wav`);
dir("E2 Major", `${LIB}/Chords/E2 Major`);
for (let k = 1; k <= 8; k++) file(`${k}_EC2.wav`, `${LIB}/Chords/E2 Major/${k}_EC2.wav`);
dir("User Guide", `${LIB}/Chords/User Guide`);
file("README.txt", `${LIB}/Chords/User Guide/README.txt`);

// Single Notes: 0 - E2 (32 layers), 10 - D2 (index 10 -> MIDI 50), 31 - B4.
dir("0 - E2", `${LIB}/Single Notes/0 - E2`);
for (let k = 1; k <= 32; k++) file(`${k}_E2.wav`, `${LIB}/Single Notes/0 - E2/${k}_E2.wav`);
dir("10 - D2", `${LIB}/Single Notes/10 - D2`);
for (let k = 1; k <= 32; k++) file(`${k}_D2.wav`, `${LIB}/Single Notes/10 - D2/${k}_D2.wav`);
dir("31 - B4", `${LIB}/Single Notes/31 - B4`);
for (let k = 1; k <= 32; k++) file(`${k}_B4.wav`, `${LIB}/Single Notes/31 - B4/${k}_B4.wav`);

// Fisiere de instrument la radacina librariei (NU audio) - trebuie ignorate.
file("Instrument.exs", `${LIB}/Instrument.exs`, 200000);
file("Instrument.gig", `${LIB}/Instrument.gig`, 5000000);
file("User Guide.pdf", `${LIB}/User Guide.pdf`, 2048);

// O a doua librarie (doar Chords) ca sa testam scanLibraries + variante.
const LIB2 = "SR - Bass Guitar";
dir(LIB2, LIB2);
dir("Chords", `${LIB2}/Chords`);
dir("A Major", `${LIB2}/Chords/A Major`);
for (let k = 1; k <= 8; k++) file(`${k}_AC.wav`, `${LIB2}/Chords/A Major/${k}_AC.wav`);

console.log("== Helpers ==");
assert(layerIndexFromFileName("1_E2.wav") === 1, "layerIndex '1_E2.wav' -> 1");
assert(layerIndexFromFileName("32_AC.wav") === 32, "layerIndex '32_AC.wav' -> 32");
assert(layerIndexFromFileName("README.txt") === 0, "layerIndex non-numeric -> 0");
assert(singleNoteMidiFromFolder("0 - E2") === 40, "'0 - E2' -> MIDI 40");
assert(singleNoteMidiFromFolder("10 - D2") === 50, "'10 - D2' -> MIDI 50");
assert(JSON.stringify(parseChordFolder("A Major")) === JSON.stringify({ root: "A", quality: "major" }), "parseChordFolder 'A Major'");
assert(JSON.stringify(parseChordFolder("G# Minor")) === JSON.stringify({ root: "G#", quality: "minor" }), "parseChordFolder 'G# Minor'");
assert(parseChordFolder("User Guide") === null, "parseChordFolder 'User Guide' -> null");
assert(JSON.stringify(splitVendorName("RS - Acoustic Guitar 1")) === JSON.stringify({ vendorPrefix: "RS", displayName: "Acoustic Guitar 1" }), "splitVendorName cu prefix");

console.log("== parseLibrary (RS) ==");
const lib = parseLibrary(LIB, entries);
assert(lib.vendorPrefix === "RS", "vendorPrefix = RS");
assert(lib.displayName === "Acoustic Guitar 1", "displayName corect");
assert(lib.hasSingleNotes === true, "hasSingleNotes true");
assert(lib.hasChords === true, "hasChords true");
assert(lib.singleNotes.length === 3, "3 grupuri single notes (" + lib.singleNotes.length + ")");
assert(lib.singleNotes[0].midi === 40, "primul note group MIDI 40");
assert(lib.singleNotes[1].midi === 50, "al doilea MIDI 50 (index 10)");
assert(lib.singleNotes[2].midi === 71, "al treilea MIDI 71 (index 31)");
assert(lib.singleNotes[0].layers.length === 32, "E2 are 32 layers (" + lib.singleNotes[0].layers.length + ")");
assert(lib.singleNotes[0].layers[0].endsWith("1_E2.wav"), "primul layer = 1_E2.wav");
assert(lib.singleNotes[0].layers[31].endsWith("32_E2.wav"), "ultimul layer = 32_E2.wav");
assert(lib.chords.length === 3, "3 chord groups (" + lib.chords.length + ")");
assert(lib.chords[0].root === "A" && lib.chords[0].quality === "major", "primul chord A major");
assert(lib.chords[0].layers.length === 8, "A Major are 8 layers");
assert(lib.chords.some((c) => c.root === "E2" && c.quality === "major"), "voicing E2 Major pastrat");

console.log("== scanLibraries + variante ==");
const libs = scanLibraries(entries);
assert(libs.length === 2, "2 librarii gasite (" + libs.length + ")");
const rs = libs.find((l) => l.id === LIB);
const sr = libs.find((l) => l.id === LIB2);
assert(JSON.stringify(libraryVariants(rs)) === JSON.stringify(["single", "full"]), "RS are ambele variante");
assert(JSON.stringify(libraryVariants(sr)) === JSON.stringify(["full"]), "SR (doar chords) are doar 'full'");
assert(sr.hasSingleNotes === false, "SR fara single notes");
assert(sr.hasChords === true, "SR cu chords");

console.log("");
console.log(`Rezultat: ${passed} ok, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
