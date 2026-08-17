// Test pentru strategiile Auto Vel (src/sampler/velocity.ts).
// Rulare: node --experimental-strip-types scripts/test-sampler-velocity.mjs

import { applyAutoVel, defaultVelocities, AUTO_VEL_STRATEGIES } from "../src/sampler/velocity.ts";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log("  ok  " + msg); }
  else { failed++; console.error("FAIL  " + msg); }
}

// Triada C major: C3=48, E3=52, G3=55 (ascendenta).
const C = [48, 52, 55];
const ctx = { chordIndex: 0, startBeat: 0, totalChords: 4, beatsPerBar: 4 };

console.log("== lista strategii ==");
assert(AUTO_VEL_STRATEGIES.length === 8, "8 strategii");
assert(AUTO_VEL_STRATEGIES[0].id === "DS", "prima e DS");
assert(AUTO_VEL_STRATEGIES[7].id === "PL", "ultima e PL");

console.log("== default ==");
const def = defaultVelocities(C);
assert(def.length === 3 && def.every((v) => v === 100), "default = 100 peste tot");

console.log("== DS (bas mai tare) ==");
const ds = applyAutoVel(C, "DS", ctx);
assert(ds.length === 3, "DS: 3 valori");
assert(ds[0] > ds[1] && ds[1] > ds[2], "DS: descrescator de la bas la acut (" + ds.join(",") + ")");
assert(ds.every((v) => v >= 30 && v <= 127), "DS: in [30,127]");

console.log("== US (acute mai tari) ==");
const us = applyAutoVel(C, "US", ctx);
assert(us[0] < us[1] && us[1] < us[2], "US: crescator de la bas la acut (" + us.join(",") + ")");

console.log("== MT (top in evidenta) ==");
const mt = applyAutoVel(C, "MT", ctx);
assert(mt[2] === 118 && mt[0] === 82 && mt[1] === 66, "MT: top=118, bas=82, interior=66 (" + mt.join(",") + ")");

console.log("== BR (bas accentuat) ==");
const br = applyAutoVel(C, "BR", ctx);
assert(br[0] === 118 && br[1] === 76 && br[2] === 76, "BR: bas=118, rest=76 (" + br.join(",") + ")");

console.log("== DSU (alternanta pe index) ==");
const dsu0 = applyAutoVel(C, "DSU", { ...ctx, chordIndex: 0 });
const dsu1 = applyAutoVel(C, "DSU", { ...ctx, chordIndex: 1 });
assert(JSON.stringify(dsu0) === JSON.stringify(ds), "DSU index par = DS");
assert(JSON.stringify(dsu1) === JSON.stringify(us), "DSU index impar = US");

console.log("== BB (backbeat pe bataile 2 si 4) ==");
const bb2 = applyAutoVel(C, "BB", { ...ctx, startBeat: 1 }); // bataia 2
const bb1 = applyAutoVel(C, "BB", { ...ctx, startBeat: 0 }); // bataia 1
assert(bb2[0] === 114, "BB bataia 2 = 114");
assert(bb1[0] === 84, "BB bataia 1 = 84");
const bb4 = applyAutoVel(C, "BB", { ...ctx, startBeat: 3 });
assert(bb4[0] === 114, "BB bataia 4 = 114");

console.log("== PL (pulse pe bataia 1) ==");
const pl1 = applyAutoVel(C, "PL", { ...ctx, startBeat: 0 });
const pl3 = applyAutoVel(C, "PL", { ...ctx, startBeat: 2 });
assert(pl1[0] === 116, "PL bataia 1 = 116");
assert(pl3[0] === 80, "PL bataia 3 = 80");

console.log("== SW (crescendo) ==");
const swFirst = applyAutoVel(C, "SW", { ...ctx, chordIndex: 0, totalChords: 4 });
const swLast = applyAutoVel(C, "SW", { ...ctx, chordIndex: 3, totalChords: 4 });
assert(swFirst[0] === 72, "SW primul = 72");
assert(swLast[0] === 118, "SW ultimul = 118");
assert(swFirst.every((v) => v === swFirst[0]), "SW uniform pe note");
const swSingle = applyAutoVel(C, "SW", { ...ctx, chordIndex: 0, totalChords: 1 });
assert(swSingle[0] === 100, "SW cu un singur acord = 100");

console.log("== edge: note goale ==");
assert(applyAutoVel([], "DS", ctx).length === 0, "note goale -> []");

console.log("== clamp: acord cu multe note ==");
const wide = [48, 52, 55, 60, 65, 72];
const dsWide = applyAutoVel(wide, "DS", ctx);
assert(dsWide.every((v) => v >= 30 && v <= 127), "DS wide: toate in [30,127] (" + dsWide.join(",") + ")");
assert(dsWide[0] >= dsWide[dsWide.length - 1], "DS wide: bas >= acut");

console.log("");
console.log(`Rezultat: ${passed} ok, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
