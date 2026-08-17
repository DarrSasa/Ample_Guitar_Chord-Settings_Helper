// inspect-guitar-library.mjs
//
// Scaneaza local o librarie de chitara (.exs/.gig + WAV-uri) si produce un
// RAPORT TEXT MIC pe care il urci pe GitHub (nu audio-ul, care e prea mare).
//
// Folosire (din folderul proiectului):
//   node scripts/inspect-guitar-library.mjs "C:\calea\catre\librarie"
//
// Daca nu dai cale, scaneaza "public/guitar samples".
//
// Ce extrage:
//   - arborele de foldere/fisiere (nume + dimensiuni) + numar de fisiere;
//   - pentru WAV-uri: sample rate, biti, canale, durata si chunk-ul `smpl`
//     (nota MIDI de baza / unity note + loop points) daca exista;
//   - continutul fisierelor .exs (text XML);
//   - doar lista pentru .gig / .pdf (nu le deschide aici).
//
// Rezultatul se scrie in `library-report.txt` (langa script) si la consola.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Folderul in care se afla acest script (corect SI pe Windows, spre
// deosebire de new URL(import.meta.url).pathname care strica calea pe win).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = process.argv[2] || "public/guitar samples";
const absRoot = path.resolve(root);

if (!fs.existsSync(absRoot)) {
  console.error(`Folderul nu exista: ${absRoot}`);
  process.exit(1);
}

const report = [];
const log = (line) => {
  report.push(line);
  console.log(line);
};

function human(n) {
  if (n == null) return "";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + " GB";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + " MB";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + " KB";
  return n + " B";
}

// ---------------------------------------------------------------------------
// Parser WAV: citeste `fmt ` si `smpl` (nota de baza + loop points).
// ---------------------------------------------------------------------------
function parseWavHeader(buf) {
  if (buf.length < 12) return { error: "prea mic" };
  if (buf.toString("ascii", 0, 4) !== "RIFF") return { error: "nu e RIFF" };
  if (buf.toString("ascii", 8, 12) !== "WAVE") return { error: "nu e WAVE" };

  const out = { chunks: {} };
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    // Chiar daca chunk-ul se intinde dincolo de ce am citit, putem lua
    // dimensiunea `data` (ne trebuie la durata) din header-ul lui.
    if (id === "data") {
      out.chunks.dataSize = size;
      break;
    }
    if (off + 8 + size > buf.length) break; // chunk-ul se intinde dincolo de ce am citit

    if (id === "fmt ") {
      out.chunks.fmt = {
        formatTag: buf.readUInt16LE(off + 8),
        channels: buf.readUInt16LE(off + 10),
        sampleRate: buf.readUInt32LE(off + 12),
        avgBytesPerSec: buf.readUInt32LE(off + 16),
        bitsPerSample: buf.readUInt16LE(off + 22),
      };
    } else if (id === "smpl") {
      const unityNote = buf.readUInt32LE(off + 8 + 12);
      const pitchFraction = buf.readUInt32LE(off + 8 + 16);
      const numLoops = buf.readUInt32LE(off + 8 + 28);
      const smpl = {
        unityNote,
        pitchFraction: "0x" + pitchFraction.toString(16),
        numLoops,
      };
      if (numLoops > 0 && off + 8 + 36 + 24 <= buf.length) {
        const l = off + 8 + 36;
        smpl.firstLoop = {
          type: buf.readUInt32LE(l + 4),
          start: buf.readUInt32LE(l + 8),
          end: buf.readUInt32LE(l + 12),
        };
      }
      out.chunks.smpl = smpl;
    }
    off += 8 + size + (size % 2); // chunk-urile sunt aliniate la cuvant
  }
  return out;
}

function describeWav(fullPath, size) {
  const fd = fs.openSync(fullPath, "r");
  try {
    const head = Buffer.alloc(128 * 1024);
    const read = fs.readSync(fd, head, 0, head.length, 0);
    const parsed = parseWavHeader(head.subarray(0, read));
    const fmt = parsed.chunks.fmt;
    const smpl = parsed.chunks.smpl;
    let line = `      ${path.basename(fullPath)} (${human(size)})`;
    if (fmt) {
      const dur =
        fmt.avgBytesPerSec > 0 && parsed.chunks.dataSize
          ? (parsed.chunks.dataSize / fmt.avgBytesPerSec).toFixed(2) + "s"
          : "?";
      line += `  | ${fmt.sampleRate}Hz ${fmt.bitsPerSample}bit ${fmt.channels}ch ${dur}`;
      if (smpl) {
        line += `  | smpl: unityNote=${smpl.unityNote} loops=${smpl.numLoops}`;
        if (smpl.firstLoop) {
          line += ` (loop[0] type=${smpl.firstLoop.type} start=${smpl.firstLoop.start} end=${smpl.firstLoop.end})`;
        }
      } else {
        line += `  | smpl: LIPSESTE`;
      }
    } else {
      line += `  | ${parsed.error || "fmt lipsa"}`;
    }
    return line;
  } finally {
    fs.closeSync(fd);
  }
}

// ---------------------------------------------------------------------------
// Parcurgere recursiva.
// ---------------------------------------------------------------------------
const DETAIL_WAV_LIMIT = 8; // analizeaza in detaliu primele N WAV-uri; restul doar le listeaza
let wavDetailed = 0;
let wavTotal = 0;
let exsTotal = 0;
let otherFiles = [];

function walk(dir, indent) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => {
      // folderele primele, apoi fisierele, alfabetic natural
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      log(`${indent}[DIR] ${e.name}/`);
      walk(full, indent + "  ");
    } else {
      const size = fs.statSync(full).size;
      const ext = path.extname(e.name).toLowerCase();
      if (ext === ".wav" || ext === ".wave") {
        wavTotal++;
        if (wavDetailed < DETAIL_WAV_LIMIT) {
          log(describeWav(full, size));
          wavDetailed++;
        } else {
          log(`${indent}${e.name} (${human(size)})`);
        }
      } else if (ext === ".exs") {
        exsTotal++;
        log(`${indent}[EXS] ${e.name} (${human(size)})`);
        // Unele librarii (ex. Realsamples) livreaza sub extensia .exs fisiere
        // de fapt BINARE (GigaStudio). Nu le varsam ca text - ar umple
        // raportul cu gunoi binar. Detectam binarul dupa byte-ul NUL.
        const probe = Buffer.alloc(4096);
        const fdx = fs.openSync(full, "r");
        const n = fs.readSync(fdx, probe, 0, probe.length, 0);
        fs.closeSync(fdx);
        let isBinary = false;
        for (let i = 0; i < n; i++) {
          if (probe[i] === 0) { isBinary = true; break; }
        }
        if (isBinary) {
          log(`${indent}  (fisier BINAR - probabil GigaStudio redenumit .exs; nu afisez continutul)`);
        } else {
          try {
            const txt = fs.readFileSync(full, "utf8");
            const lines = txt.split(/\r?\n/);
            const maxLines = 400;
            log(`${indent}  --- continut .exs (primele ${Math.min(lines.length, maxLines)} linii) ---`);
            lines.slice(0, maxLines).forEach((l) => log(`${indent}  ${l}`));
            if (lines.length > maxLines) log(`${indent}  ... (${lines.length - maxLines} linii ramase, trunchiate)`);
          } catch (err) {
            log(`${indent}  (nu pot citi: ${err.message})`);
          }
        }
      } else {
        otherFiles.push({ name: e.name, size });
        log(`${indent}${e.name} (${human(size)})`);
      }
    }
  }
}

log("===========================================================");
log(" RAPORT LIBRARIE GUITAR SAMPLES");
log(` Data: ${new Date().toISOString()}`);
log(` Radacina: ${absRoot}`);
log("===========================================================");
walk(absRoot, "");
log("===========================================================");
log(` Total WAV: ${wavTotal} (detaliate: ${wavDetailed})`);
log(` Total EXS: ${exsTotal}`);
log(` Alte fisiere: ${otherFiles.length}`);
log("===========================================================");
if (wavTotal > DETAIL_WAV_LIMIT) {
  log(` NOTA: s-au analizat in detaliu doar primele ${DETAIL_WAV_LIMIT} WAV-uri.`);
  log("       Daca vrei detaliu la mai multe, spune-mi si maresc limita.");
}

// Salvam raportul LANGA acest script (in folderul scripts/), cu calea
// absoluta rezolvata, ca sa fie usor de gasit pe Windows.
const outPath = path.resolve(__dirname, "library-report.txt");
fs.writeFileSync(outPath, report.join("\n"), "utf8");
console.log("\n[Raport salvat in] " + outPath);
