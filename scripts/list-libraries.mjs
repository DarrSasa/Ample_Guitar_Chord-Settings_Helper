// list-libraries.mjs
//
// Verifica workflow-ul add/remove: scaneaza o radacina (default
// "public/guitar samples") si afiseaza librariile detectate de parserul
// sampler (src/sampler/parseLibrary.ts) + descriptorii `library.json`.
//
// Rulare (Node >= 22):
//   node --experimental-strip-types scripts/list-libraries.mjs [cale]
//
// Utile pt. verificare INAINTE de build: daca o librarie nu apare aici,
// nu va aparea nici in meniul aplicatiei.

import fs from "node:fs";
import path from "node:path";
import { scanLibraries, libraryVariants } from "../src/sampler/parseLibrary.ts";
import { applyDescriptor } from "../src/sampler/descriptor.ts";
import { buildLibraryChoices } from "../src/sampler/libraryRegistry.ts";

const root = path.resolve(process.argv[2] || "public/guitar samples");

if (!fs.existsSync(root)) {
  console.error(`Folderul nu exista: ${root}`);
  process.exit(1);
}

// Construieste un listing DirEntry[] recursiv (ca main.cjs, dar local).
const entries = [];
function walk(dir, baseDir) {
  const names = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  for (const d of names) {
    const full = path.join(dir, d.name);
    const rel = path.relative(baseDir, full).split(path.sep).join("/");
    const isDir = d.isDirectory();
    const size = isDir ? 0 : (() => { try { return fs.statSync(full).size; } catch { return 0; } })();
    entries.push({ name: d.name, path: rel, isDirectory: isDir, size });
    if (isDir) walk(full, baseDir);
  }
}

walk(root, root);

// Citeste descriptorii library.json (ca main.cjs) — dupa walk, ca sa avem
// listing-ul complet.
const descriptors = {};
for (const e of entries) {
  if (e.isDirectory || e.name.toLowerCase() !== "library.json") continue;
  const parts = e.path.split("/");
  if (parts.length !== 2) continue;
  try {
    descriptors[parts[0]] = JSON.parse(fs.readFileSync(path.join(root, e.path), "utf8"));
  } catch {
    /* invalid -> ignora */
  }
}

const libs = scanLibraries(entries).map((l) => applyDescriptor(l, descriptors[l.id]));

console.log(`\nRadacina: ${root}`);
console.log(`Librarii detectate: ${libs.length}\n`);

if (libs.length === 0) {
  console.log("  (nicio librarie — pune folderele de librarie direct in acest folder)");
}

for (const lib of libs) {
  console.log(`• ${lib.folderName}`);
  console.log(`    vendor: "${lib.vendorPrefix}" | nume: "${lib.displayName}"`);
  console.log(`    Single Notes: ${lib.hasSingleNotes ? lib.singleNotes.length + " note (MIDI " + lib.singleNotes[0].midi + ".." + lib.singleNotes[lib.singleNotes.length - 1].midi + ")" : "—"}`);
  console.log(`    Chords: ${lib.hasChords ? lib.chords.length + " (ex. " + lib.chords.map((c) => c.root + (c.quality === "major" ? "" : "m")).slice(0, 6).join(", ") + ")" : "—"}`);
  if (lib.defaultFadeOut !== undefined) console.log(`    defaultFadeOut: ${lib.defaultFadeOut}s`);
  if (lib.loop) console.log(`    loop: ${JSON.stringify(lib.loop)}`);
}

console.log(`\nVariante in meniu (buildLibraryChoices):`);
for (const c of buildLibraryChoices(libs)) {
  console.log(`  - ${c.label}`);
}
console.log("");
