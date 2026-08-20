// Test pentru logica SLIDE (src/slideLogic.ts): dreapta = cascada push
// (gaps dispar), stanga = stop lipit de vecin (fara push, fara modificare de
// lungime). Rulare: node --experimental-strip-types scripts/test-slide-logic.mjs

import { applySlideMove } from "../src/slideLogic.ts";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log("  ok  " + msg); }
  else { failed++; console.error("FAIL  " + msg); }
}
const fmt = (arr) => arr.map((c) => `${c.id}@${c.startBeat}`).join(" ");
const beatsOf = (arr, id) => arr.find((c) => c.id === id).beats;

const A = { id: "A", beats: 2, startBeat: 0 };  // 0..2
const B = { id: "B", beats: 2, startBeat: 4 };  // 4..6 (gap 2..4)

console.log("== DREAPTA: gap dispare, vecinul e impins ==");
let r = applySlideMove([A, B], ["A"], 2.5); // A mutat la 2.5..4.5
assert(fmt(r) === "A@2.5 B@4.5", "A@2.5 B@4.5 (lipite, gap disparut) -> " + fmt(r));
assert(beatsOf(r, "A") === 2 && beatsOf(r, "B") === 2, "lungimi intacte (2/2)");

console.log("== DREAPTA: grup de 3, gaps dispar ==");
const C = { id: "C", beats: 2, startBeat: 8 }; // 8..10 (gap 6..8)
r = applySlideMove([A, B, C], ["A"], 4); // A -> 4..6
assert(fmt(r) === "A@4 B@6 C@8", "A@4 B@6 C@8 (toate lipite) -> " + fmt(r));
assert(beatsOf(r, "A") === 2 && beatsOf(r, "B") === 2 && beatsOf(r, "C") === 2, "lungimi intacte");

console.log("== STANGA: se opreste lipit de vecinul din stanga ==");
r = applySlideMove([A, B], ["B"], -3.5); // B vrea la 0.5, dar A.end=2 -> stop la 2
assert(fmt(r) === "A@0 B@2", "B se opreste la 2 (lipit de A) -> " + fmt(r));
assert(beatsOf(r, "A") === 2 && beatsOf(r, "B") === 2, "lungimi intacte");

console.log("== STANGA: fara vecin la stanga -> se opreste la 0 ==");
r = applySlideMove([B], ["B"], -10); // B vrea la -6 -> clamp 0
assert(fmt(r) === "B@0", "B clampat la 0 -> " + fmt(r));

console.log("== STANGA: trage dar nu a ajuns la vecin (gap scade partial) ==");
r = applySlideMove([A, B], ["B"], -1); // B -> 3 (gap 2..3 ramane)
assert(fmt(r) === "A@0 B@3", "B@3 (nu a ajuns la A) -> " + fmt(r));

console.log("== delta 0 = fara schimbari ==");
r = applySlideMove([A, B], ["A"], 0);
assert(fmt(r) === "A@0 B@4", "delta 0 -> neschimbat -> " + fmt(r));

console.log("");
console.log(`Rezultat: ${passed} ok, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
