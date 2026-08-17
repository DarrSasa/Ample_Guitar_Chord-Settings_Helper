// Test pentru descriptor + registru (src/sampler/descriptor.ts si
// src/sampler/libraryRegistry.ts). Rulare:
//   node --experimental-strip-types scripts/test-sampler-registry.mjs

import { parseLibrary, libraryVariants } from "../src/sampler/parseLibrary.ts";
import { applyDescriptor } from "../src/sampler/descriptor.ts";
import { buildLibraryChoices, resolveLibraryChoice, choiceLabel } from "../src/sampler/libraryRegistry.ts";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log("  ok  " + msg); }
  else { failed++; console.error("FAIL  " + msg); }
}

const LIB = "RS - Acoustic Guitar 1";
const entries = [];
const dir = (name, p) => entries.push({ name, path: p, isDirectory: true, size: 0 });
const file = (name, p) => entries.push({ name, path: p, isDirectory: false, size: 1000 });

dir(LIB, LIB);
dir("Single Notes", `${LIB}/Single Notes`);
dir("Chords", `${LIB}/Chords`);
dir("0 - E2", `${LIB}/Single Notes/0 - E2`);
for (let k = 1; k <= 32; k++) file(`${k}_E2.wav`, `${LIB}/Single Notes/0 - E2/${k}_E2.wav`);
dir("A Major", `${LIB}/Chords/A Major`);
for (let k = 1; k <= 8; k++) file(`${k}_AC.wav`, `${LIB}/Chords/A Major/${k}_AC.wav`);

const lib = parseLibrary(LIB, entries);

console.log("== descriptor: fara descriptor (default) ==");
const d0 = applyDescriptor(lib, null);
assert(d0.vendorPrefix === "RS", "vendorPrefix dedus = RS");
assert(d0.displayName === "Acoustic Guitar 1", "displayName dedus");
assert(d0.defaultFadeOut === undefined, "defaultFadeOut absent");

console.log("== descriptor: suprascriere ==");
const d1 = applyDescriptor(lib, {
  vendorPrefix: "X",
  displayName: "Custom Name",
  defaultFadeOut: 0.08,
  loop: { enabled: true, crossfade: 0.01 },
});
assert(d1.vendorPrefix === "X", "vendorPrefix suprascris");
assert(d1.displayName === "Custom Name", "displayName suprascris");
assert(d1.defaultFadeOut === 0.08, "defaultFadeOut suprascris");
assert(d1.loop && d1.loop.enabled === true, "loop.enabled suprascris");
assert(d1.singleNotes.length === lib.singleNotes.length, "parsarea ramane intacta (note)");
assert(d1.chords.length === lib.chords.length, "parsarea ramane intacta (chords)");

console.log("== descriptor: partial (nu sterge valorile deduse) ==");
const d2 = applyDescriptor(lib, { defaultFadeOut: 0.03 });
assert(d2.vendorPrefix === "RS", "vendorPrefix ramane RS (nu e in descriptor)");
assert(d2.displayName === "Acoustic Guitar 1", "displayName ramane");
assert(d2.defaultFadeOut === 0.03, "defaultFadeOut setat");

console.log("== registry: alegeri + etichete ==");
assert(JSON.stringify(libraryVariants(lib)) === JSON.stringify(["single", "full"]), "variante single+full");
const choices = buildLibraryChoices([lib]);
assert(choices.length === 2, "2 alegeri (" + choices.length + ")");
assert(choices[0].label === "RS - Acoustic Guitar 1 (Single Notes)", "eticheta single corecta: " + choices[0].label);
assert(choices[1].label === "RS - Acoustic Guitar 1 (Single Notes+Chords)", "eticheta full corecta: " + choices[1].label);
assert(choiceLabel(lib, "single") === "RS - Acoustic Guitar 1 (Single Notes)", "choiceLabel single");

console.log("== registry: resolve ==");
const r1 = resolveLibraryChoice([lib], `${LIB}::single`);
assert(r1 && r1.variant === "single" && r1.lib.id === LIB, "resolve single");
const r2 = resolveLibraryChoice([lib], `${LIB}::full`);
assert(r2 && r2.variant === "full", "resolve full");
assert(resolveLibraryChoice([lib], `${LIB}::garbage`) === null, "resolve varianta invalida -> null");
assert(resolveLibraryChoice([lib], "altceva") === null, "resolve id fara :: -> null");
assert(resolveLibraryChoice([lib], `Nexista::single`) === null, "resolve librarie inexistenta -> null");

console.log("");
console.log(`Rezultat: ${passed} ok, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
