// Test pentru logica clipboard (src/clipboardLogic.ts): copy/cut/paste,
// inchiderea gap-ului la cut+paste, push-dreapta la copy+paste SI regulile
// NOI de "paste in gap" (1.1 + 1.2 A/B/C).
// Rulare: node --experimental-strip-types scripts/test-clipboard-logic.mjs

import { applyPaste, makeCopyClipboard, makeCutClipboard, progressionEndBeat } from "../src/clipboardLogic.ts";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log("  ok  " + msg); }
  else { failed++; console.error("FAIL  " + msg); }
}
const fmt = (arr) => arr.map((c) => `${c.label}@${c.startBeat}[${c.beats}]`).join(" ");

// A(0..1) B(1..2) C(2..3) — edge to edge, fiecare 1 beat.
const A = { id: "A", label: "A", beats: 1, startBeat: 0 };
const B = { id: "B", label: "B", beats: 1, startBeat: 1 };
const C = { id: "C", label: "C", beats: 1, startBeat: 2 };

console.log("== copy+paste: dreapta se impinge (acorduri alaturate) ==");
const copyClip = makeCopyClipboard([B]);
let r = applyPaste([A, B, C], copyClip, 1); // fara dropBeat -> push-dreapta
assert(fmt(r.next) === "A@0[1] B@1[1] B@2[1] C@3[1]", "copy B intre A,B -> " + fmt(r.next));

console.log("== cut: clipboard pastreaza cutStart + gapWidth ==");
const cutClip = makeCutClipboard([B]);
assert(cutClip.mode === "cut" && cutClip.cutStart === 1 && cutClip.gapWidth === 1, "cut B: cutStart 1, gapWidth 1");

console.log("== cut+paste: exemplul A,B,C (cut B, paste la coada) ==");
r = applyPaste([A, C], cutClip, 2); // paste la coada (fara dropBeat)
assert(fmt(r.next) === "A@0[1] C@1[1] B@2[1]", "cut B + paste coada -> " + fmt(r.next));

console.log("== NOU: paste in gap — 1.1 acord mai LUNG decat gap-ul ==");
// A@0..1, C@3..4 -> gap [1,3) lat 2. Paste B (3 beats) in gap -> micsorat la 2.
const A1 = { id: "A", label: "A", beats: 1, startBeat: 0 };
const C3 = { id: "C", label: "C", beats: 1, startBeat: 3 };
const longB = { id: "B", label: "B", beats: 3, startBeat: 0 };
const clipLong = makeCopyClipboard([longB]);
r = applyPaste([A1, C3], clipLong, 1, 2, 1); // dropBeat=2 (in gap), snap=1
assert(fmt(r.next) === "A@0[1] B@1[2] C@3[1]", "1.1: B lung 3 micsorat la 2 in gap -> " + fmt(r.next));
// vecinii raman fixi (A si C neschimbati)
assert(r.next.find((c) => c.label === "A").startBeat === 0, "1.1: A ramane fix");
assert(r.next.find((c) => c.label === "C").startBeat === 3, "1.1: C ramane fix");

console.log("== NOU: paste in gap — 1.2 Caz A (bara acoperita de stanga) ==");
// A@0..2, C@6..7 -> gap [2,6) lat 4. Paste B (1 beat) cu dropBeat=2.5, snap=4.
// floor(2.5/4)*4 = 0 < gapStart(2) -> lipeste la gapStart=2.
const A2 = { id: "A", label: "A", beats: 2, startBeat: 0 };
const C6 = { id: "C", label: "C", beats: 1, startBeat: 6 };
const clipShort = makeCopyClipboard([B]);
r = applyPaste([A2, C6], clipShort, 1, 2.5, 4);
assert(fmt(r.next) === "A@0[2] B@2[1] C@6[1]", "1.2A: B lipeste de A (la gapStart) -> " + fmt(r.next));

console.log("== NOU: paste in gap — 1.2 Caz B (bara vizibila) ==");
// dropBeat=5 (bara vizibila la 4, dupa gapStart 2). snap=4 -> floor(5/4)*4=4.
r = applyPaste([A2, C6], clipShort, 1, 5, 4);
assert(fmt(r.next) === "A@0[2] B@4[1] C@6[1]", "1.2B: B pe bara 4 -> " + fmt(r.next));

console.log("== NOU: paste in gap — 1.2 Caz C (nu incape -> micsorat) ==");
// A@0..2, C@4.5..5.5 (snap=4). dropBeat=4 -> firstStart=4. B (2 beats) ar depasi
// gapEnd(4.5) -> micsorat la 0.5.
const C45 = { id: "C", label: "C", beats: 1, startBeat: 4.5 };
const B2 = { id: "B", label: "B", beats: 2, startBeat: 0 };
const clipB2 = makeCopyClipboard([B2]);
r = applyPaste([A2, C45], clipB2, 1, 4, 4);
assert(fmt(r.next) === "A@0[2] B@4[0.5] C@4.5[1]", "1.2C: B micsorat la 0.5 -> " + fmt(r.next));
assert(r.next.find((c) => c.label === "C").startBeat === 4.5, "1.2C: C ramane fix");

console.log("== NOU: regulile de gap se aplica SI la cut+paste ==");
// A@0..1, C@3..4, cut B (cutStart 1, gapWidth 1). Paste B (3 beats) in gap [1,3).
const cutLong = makeCutClipboard([{ id: "B", label: "B", beats: 3, startBeat: 1 }]);
r = applyPaste([A1, C3], cutLong, 1, 2, 1); // gap [1,3): B micsorat la 2, apoi inchide gap-ul taietii
assert(fmt(r.next) === "A@0[1] B@1[2] C@3[1]", "cut+paste in gap: B micsorat -> " + fmt(r.next));

console.log("== NOU: cut pe PRIMUL acord + paste in gap = fara miscarea progresiei ==");
// A@0..1 (primul), B@3..4, C@4..5. Cut A (cutStart 0, gapWidth 1).
// Paste A in gap-ul [0,3) la dropBeat=2 -> A la 2; B si C raman PE LOC.
const AFirst = { id: "A", label: "A", beats: 1, startBeat: 0 };
const B3 = { id: "B", label: "B", beats: 1, startBeat: 3 };
const C4 = { id: "C", label: "C", beats: 1, startBeat: 4 };
const cutFirst = makeCutClipboard([AFirst]);
r = applyPaste([B3, C4], cutFirst, 1, 2, 1); // dropBeat=2 in gap [0,3)
assert(fmt(r.next) === "A@2[1] B@3[1] C@4[1]", "cut primul + paste in gap -> B,C nemiscati: " + fmt(r.next));

console.log("== NOU: cut pe PRIMUL acord + paste la coada = fara miscarea progresiei ==");
r = applyPaste([B3, C4], cutFirst, 2); // paste la coada (fara dropBeat)
assert(fmt(r.next) === "B@3[1] C@4[1] A@5[1]", "cut primul + paste coada -> B,C nemiscati: " + fmt(r.next));

console.log("== progressionEndBeat ==");
assert(progressionEndBeat([A, C]) === 3, "end(A,C) = 3");

console.log("");
console.log(`Rezultat: ${passed} ok, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
