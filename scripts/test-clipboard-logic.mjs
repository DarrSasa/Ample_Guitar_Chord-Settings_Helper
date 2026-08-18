// Test pentru logica clipboard (src/clipboardLogic.ts): copy/cut/paste,
// inchiderea gap-ului la cut+paste, push-dreapta la copy+paste.
// Rulare: node --experimental-strip-types scripts/test-clipboard-logic.mjs

import { applyPaste, makeCopyClipboard, makeCutClipboard, progressionEndBeat } from "../src/clipboardLogic.ts";

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log("  ok  " + msg); }
  else { failed++; console.error("FAIL  " + msg); }
}
const fmt = (arr) => arr.map((c) => `${c.label}@${c.startBeat}`).join(" ");

// A(0..1) B(1..2) C(2..3) — edge to edge, fiecare 1 beat.
const A = { id: "A", label: "A", beats: 1, startBeat: 0 };
const B = { id: "B", label: "B", beats: 1, startBeat: 1 };
const C = { id: "C", label: "C", beats: 1, startBeat: 2 };

console.log("== copy+paste: dreapta se impinge (acorduri alaturate) ==");
const copyClip = makeCopyClipboard([B]);
let r = applyPaste([A, B, C], copyClip, 1); // paste copie B intre A si B
assert(fmt(r.next) === "A@0 B@1 B@2 C@3", "copy B intre A,B -> A@0 B@1 B@2 C@3 (" + fmt(r.next) + ")");
r = applyPaste([A, B, C], copyClip, 3); // paste la coada
assert(fmt(r.next) === "A@0 B@1 C@2 B@3", "copy B la coada -> A@0 B@1 C@2 B@3 (" + fmt(r.next) + ")");

console.log("== cut: clipboard pastreaza cutStart + gapWidth ==");
const cutClip = makeCutClipboard([B]);
assert(cutClip.mode === "cut", "mode cut");
assert(cutClip.cutStart === 1, "cutStart = 1");
assert(cutClip.gapWidth === 1, "gapWidth = 1");

console.log("== cut+paste: exemplul userului A,B,C (cut B, paste la coada) ==");
// dupa cut B: ramane A@0, C@2 (gap [1,2))
r = applyPaste([A, C], cutClip, 2); // paste B la coada (dupa C)
assert(fmt(r.next) === "A@0 C@1 B@2", "cut B + paste la coada -> A@0 C@1 B@2 (C umple golul) (" + fmt(r.next) + ")");

console.log("== cut+paste: paste inapoi in gol ==");
r = applyPaste([A, C], cutClip, 1); // paste B intre A si C (in gol)
assert(fmt(r.next) === "A@0 B@1 C@2", "cut B + paste inapoi -> A@0 B@1 C@2 (" + fmt(r.next) + ")");

console.log("== cut+paste: 4 acorduri, cut B, paste intre C si D ==");
const D = { id: "D", label: "D", beats: 1, startBeat: 3 };
const cutB = makeCutClipboard([B]); // cutStart 1, gapWidth 1
r = applyPaste([A, C, D], cutB, 2); // paste B intre C si D (dupa C)
assert(fmt(r.next) === "A@0 C@1 B@2 D@3", "cut B + paste intre C,D -> A@0 C@1 B@2 D@3 (" + fmt(r.next) + ")");

console.log("== cut+paste cu latimi diferite ==");
// A(0..3), B(3..4) [1 beat], C(4..7) [3 beats]. Cut B (gapWidth 1).
const A3 = { id: "A", label: "A", beats: 3, startBeat: 0 };
const B1 = { id: "B", label: "B", beats: 1, startBeat: 3 };
const C3 = { id: "C", label: "C", beats: 3, startBeat: 4 };
const cutB1 = makeCutClipboard([B1]);
r = applyPaste([A3, C3], cutB1, 2); // paste B la coada
assert(fmt(r.next) === "A@0 C@3 B@6", "latimi diferite: A@0 C@3 B@6 (" + fmt(r.next) + ")");

console.log("== copy cu mai multe acorduri ==");
const AB = [A, B].map((x) => ({ ...x }));
const copyAB = makeCopyClipboard(AB);
r = applyPaste([C], copyAB, 1); // C@2, paste A,B la coada (dupa C)
assert(fmt(r.next) === "C@2 A@3 B@4", "copy A,B dupa C -> C@2 A@3 B@4 (" + fmt(r.next) + ")");
assert(r.cloneIds.length === 2, "2 clone ids");

console.log("== progressionEndBeat ==");
assert(progressionEndBeat([A, C]) === 3, "end(A,C) = 3");

console.log("");
console.log(`Rezultat: ${passed} ok, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
