#!/usr/bin/env node
/*
 * extract-loop-play-stop.mjs
 *
 * Extrage layerele din:
 *   - loop-on-loop-off.psd   -> loop-off, loop-on
 *   - play-on-pause-off.psd  -> pause-off, play-on
 *   - stop-on-stop-off.psd   -> stop-off, stop-on
 *
 * Genereaza:
 *   - src/assets/graphics/svg/{loop,play,pause,stop}-{off,on}.svg
 *   - docs/graphics/html_PSD/loop-play-stop-preview.html
 *     (preview cu 3 butoane in ordinea loop/play-pause/stop pe fundal
 *     #677987, spatiu 22px intre ele, toate cele 2^3 = 8 combinatii de
 *     stari, slider scala + toggle fundal)
 */

import fs from 'node:fs';
import path from 'node:path';
import { readPsd, initializeCanvas } from 'ag-psd';
import sharp from 'sharp';

function shim(w, h) {
  return { width: w, height: h, getContext() {
    return {
      createImageData: (a, b) => {
        if (typeof a === 'number') return { data: new Uint8ClampedArray(a * b * 4), width: a, height: b };
        return { data: new Uint8ClampedArray(a.width * a.height * 4), width: a.width, height: a.height };
      },
      getImageData: (x, y, w2, h2) => ({ data: new Uint8ClampedArray(w2 * h2 * 4), width: w2, height: h2 }),
      putImageData() {}, drawImage() {},
    };
  }, toDataURL() { return ''; } };
}
function shimData(a, b) {
  if (typeof a === 'number') return { data: new Uint8ClampedArray(a * b * 4), width: a, height: b };
  if (a && typeof a === 'object') return { data: new Uint8ClampedArray(a.width * a.height * 4), width: a.width, height: a.height };
  return { data: new Uint8ClampedArray(0), width: 0, height: 0 };
}
initializeCanvas(shim, shimData);

const SVG_OUT = 'src/assets/graphics/svg';
fs.mkdirSync(SVG_OUT, { recursive: true });
fs.mkdirSync('docs/graphics/generated', { recursive: true });

// Culoarea noua a fundalului Builder (user explicit)
const BG_COLOR = '#677987';

function flatten(node, acc = []) {
  if (!node.children) {
    if (node.name && node.imageData) acc.push(node);
    return acc;
  }
  for (const c of node.children) flatten(c, acc);
  return acc;
}

async function layerToSquarePng(layer, psdW, psdH) {
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const w = (layer.right ?? 0) - left;
  const h = (layer.bottom ?? 0) - top;
  const raw = Buffer.from(
    layer.imageData.data.buffer,
    layer.imageData.data.byteOffset,
    layer.imageData.data.byteLength
  );
  const iL = Math.max(0, -left);
  const iT = Math.max(0, -top);
  const iR = Math.min(w, psdW - left);
  const iB = Math.min(h, psdH - top);
  const cW = iR - iL;
  const cH = iB - iT;
  if (cW <= 0 || cH <= 0) {
    return await sharp({
      create: { width: psdW, height: psdH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
  }
  const cutPng = await sharp(raw, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: iL, top: iT, width: cW, height: cH })
    .png().toBuffer();
  return await sharp({
    create: { width: psdW, height: psdH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: cutPng, left: Math.max(0, left), top: Math.max(0, top) }])
    .png().toBuffer();
}

function buildSvg(pngBuffer, w, h) {
  const b64 = pngBuffer.toString('base64');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <image href="data:image/png;base64,${b64}" width="${w}" height="${h}"/>
</svg>`;
}

async function extractPsd(psdPath, layerNames) {
  console.log(`Deschid ${psdPath}...`);
  const buffer = fs.readFileSync(psdPath);
  const psd = readPsd(buffer, { skipCompositeImageData: true, useImageData: true, skipThumbnail: true });
  console.log(`  ${psd.width}x${psd.height}`);
  const layers = flatten(psd);
  const results = {};
  for (const [key, name] of Object.entries(layerNames)) {
    const layer = layers.find(l => l.name.toLowerCase().trim() === name.toLowerCase().trim());
    if (!layer) { console.warn(`  LIPSA: "${name}"`); results[key] = null; continue; }
    console.log(`  Extrag "${name}"...`);
    const png = await layerToSquarePng(layer, psd.width, psd.height);
    results[key] = { png, w: psd.width, h: psd.height };
  }
  return results;
}

// -----------------------------------------------------------------
const loop  = await extractPsd('docs/graphics/psd/loop-on-loop-off.psd', {
  off: 'loop-off',  on: 'loop-on',
});
const pp    = await extractPsd('docs/graphics/psd/play-on-pause-off.psd', {
  pauseOff: 'pause-off',  playOn: 'play-on',
});
const stop  = await extractPsd('docs/graphics/psd/stop-on-stop-off.psd', {
  off: 'stop-off',  on: 'stop-on',
});

// -----------------------------------------------------------------
// Resize la ceva rezonabil (max 400 pe latura mare) si salvez SVG-uri.
// Toate PSD-urile au acelasi canvas 473x650.
// Detecteaza bounding box-ul netransparent al unei imagini PNG.
// Returneaza { left, top, width, height } - zona utila.
async function getBoundingBox(pngBuffer) {
  const trimmed = await sharp(pngBuffer).trim({ threshold: 5 }).toBuffer();
  const trimMeta = await sharp(trimmed).metadata();
  const origMeta = await sharp(pngBuffer).metadata();
  // sharp.trim() in versiunile noi returneaza trimOffsetLeft/Top in metadata.
  // Daca nu, calculez indirect: dimensiune originala - dimensiune trimmed.
  return {
    left: (origMeta.width ?? 0) - (trimMeta.width ?? 0),  // aproximativ
    top: (origMeta.height ?? 0) - (trimMeta.height ?? 0),
    width: trimMeta.width ?? origMeta.width ?? 0,
    height: trimMeta.height ?? origMeta.height ?? 0,
  };
}

// Normalizeaza o PERECHE (off + on) la acelasi canvas patrat, centrand
// AMBELE la fel. Foloseste On ca referinta (are halo mai mare, deci
// bounding box mai mare) - Off e centrat pe acelasi canvas cu spatiu
// mai mare in jur.
//
// Astfel butonul efectiv (in centrul canvas-ului) este in ACEEASI
// pozitie in Off si On -> nu "sare" cand tranzitezi. Iar canvas-urile
// sunt identice ca marime pentru toate cele 3 butoane -> spatiu uniform.
async function normalizePair(offPng, onPng, targetSize) {
  // Trim ambele imagini si iau bounding box-urile.
  const offTrimmed = await sharp(offPng).trim({ threshold: 5 }).toBuffer();
  const onTrimmed  = await sharp(onPng).trim({ threshold: 5 }).toBuffer();
  const offMeta = await sharp(offTrimmed).metadata();
  const onMeta  = await sharp(onTrimmed).metadata();
  // Alegem MAX pe fiecare axa ca sa incapa ambele centrat.
  const maxW = Math.max(offMeta.width ?? 0, onMeta.width ?? 0);
  const maxH = Math.max(offMeta.height ?? 0, onMeta.height ?? 0);
  const maxSide = Math.max(maxW, maxH);
  // Fara padding suplimentar - canvas-ul = bounding box max (On cu halo).
  // Astfel butoanele lipite au spatiu minim intre halo-uri, natural.
  const pad = 0;
  const canvasSide = maxSide + pad * 2;

  // Compune fiecare (off + on) centrat pe canvas patrat identic.
  const centerAndScale = async (trimmedBuf, trimMeta) => {
    const w = trimMeta.width ?? 0;
    const h = trimMeta.height ?? 0;
    const composed = await sharp({
      create: { width: canvasSide, height: canvasSide, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{
        input: trimmedBuf,
        left: Math.round((canvasSide - w) / 2),
        top: Math.round((canvasSide - h) / 2),
      }])
      .png().toBuffer();
    return await sharp(composed).resize(targetSize, targetSize, { kernel: 'lanczos3' })
      .png({ compressionLevel: 9 }).toBuffer();
  };
  const offOut = await centerAndScale(offTrimmed, offMeta);
  const onOut  = await centerAndScale(onTrimmed, onMeta);
  return { off: offOut, on: onOut, canvasSide };
}

async function process(pngBuffer, w, h) {
  return await sharp(pngBuffer).resize(w, h, { kernel: 'lanczos3', fit: 'inside' })
    .png({ compressionLevel: 9 }).toBuffer();
}

const TARGET_SIZE = 400; // canvas patrat uniform pentru toate

// Normalizez fiecare pereche (off + on) la canvas patrat identic
// pentru fiecare buton. Astfel loop-off/loop-on/pause-off/play-on/
// stop-off/stop-on au TOATE aceeasi dimensiune si centrare -> spatiul
// vizual dintre butoane devine UNIFORM cand sunt asezate lipite.
console.log('\nNormalizez perechile (off + on) la canvas patrat uniform...');
const loopPair = await normalizePair(loop.off.png, loop.on.png, TARGET_SIZE);
const ppPair   = await normalizePair(pp.pauseOff.png, pp.playOn.png, TARGET_SIZE);
const stopPair = await normalizePair(stop.off.png, stop.on.png, TARGET_SIZE);
console.log(`  loop  canvas: ${loopPair.canvasSide}x${loopPair.canvasSide} -> resize ${TARGET_SIZE}x${TARGET_SIZE}`);
console.log(`  play  canvas: ${ppPair.canvasSide}x${ppPair.canvasSide} -> resize ${TARGET_SIZE}x${TARGET_SIZE}`);
console.log(`  stop  canvas: ${stopPair.canvasSide}x${stopPair.canvasSide} -> resize ${TARGET_SIZE}x${TARGET_SIZE}`);

const buttons = [
  { name: 'loop-off',  png: loopPair.off },
  { name: 'loop-on',   png: loopPair.on },
  { name: 'pause-off', png: ppPair.off },
  { name: 'play-on',   png: ppPair.on },
  { name: 'stop-off',  png: stopPair.off },
  { name: 'stop-on',   png: stopPair.on },
];

console.log('\nSalvez SVG-uri finale...');
for (const btn of buttons) {
  const svg = buildSvg(btn.png, TARGET_SIZE, TARGET_SIZE);
  const outPath = path.join(SVG_OUT, `${btn.name}.svg`);
  fs.writeFileSync(outPath, svg);
  console.log(`  ${outPath}: ${(svg.length / 1024).toFixed(1)} KB`);
}

// -----------------------------------------------------------------
// HTML preview
// -----------------------------------------------------------------
function pngToDataUri(buf) {
  return `data:image/png;base64,${buf.toString('base64')}`;
}
// Butoanele normalizate deja au canvas patrat uniform 400x400 - le
// redimensionez la 512x512 pentru preview HD.
async function toPreviewPng(pngBuffer) {
  return await sharp(pngBuffer).resize(512, 512, { kernel: 'lanczos3' }).png().toBuffer();
}

const loopOff  = pngToDataUri(await toPreviewPng(loopPair.off));
const loopOn   = pngToDataUri(await toPreviewPng(loopPair.on));
const pauseOff = pngToDataUri(await toPreviewPng(ppPair.off));
const playOn   = pngToDataUri(await toPreviewPng(ppPair.on));
const stopOff  = pngToDataUri(await toPreviewPng(stopPair.off));
const stopOn   = pngToDataUri(await toPreviewPng(stopPair.on));

// Dimensiune butoane in preview: canvas-ul PSD e 473x650 (aspect
// vertical), dar butonul propriu-zis (fara halo) ocupa doar zona
// centrala. Cand cablam in app vom folosi containere PATRATE si
// imaginea in overflow visible. Pentru preview afisez la ~130x180
// (aspect ratio-ul canvas-ului PSD).
// Butoanele au canvas normalizat 1:1 (patrat) cu butonul efectiv
// centrat perfect si padding uniform 8% pentru halo/umbra. Cand sunt
// asezate lipite (gap = 0), spatiul vizual dintre butoane devine
// UNIFORM (~15-20px) fara diferente per PSD.
const PREVIEW_W = 160;
const PREVIEW_H = 160;
const GAP_PX = 0;

const html = `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<title>Loop + Play/Pause + Stop preview</title>
<style>
  * { box-sizing: border-box; }
  body {
    background: #acb0ac;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #222;
    margin: 0;
    padding: 24px;
  }
  h1 { margin: 0 0 8px 0; font-size: 18px; }
  h2 { margin: 24px 0 10px 0; font-size: 14px; }
  .intro { max-width: 900px; margin-bottom: 20px; font-size: 13px; line-height: 1.5; }
  .intro code { background: #d5d5d5; padding: 2px 5px; border-radius: 3px; }
  .scale-control {
    display: inline-flex; align-items: center; gap: 12px;
    background: #d5d5d5; padding: 8px 14px; border-radius: 6px; margin-bottom: 16px;
  }
  .scale-control input { width: 200px; }
  .scale-control output { font-family: monospace; font-weight: bold; min-width: 45px; text-align: right; }
  .theme-toggle {
    background: #d5d5d5; padding: 8px 14px; border-radius: 6px;
    border: 1px solid #999; cursor: pointer; margin-left: 8px; font-family: inherit;
  }
  body.dark { background: #2a2d2a; color: #ddd; }
  body.dark .scale-control, body.dark .theme-toggle { background: #444; color: #eee; }

  /* Builder mock cu fundalul nou */
  .builder-mock {
    background: ${BG_COLOR};
    padding: 24px;
    border-radius: 8px;
    border: 1px solid #000;
    margin-bottom: 20px;
    color: #fff;
  }
  .builder-mock h3 {
    font-size: 14px; font-weight: 600; margin: 0 0 16px 0; color: #fff;
    letter-spacing: 0.5px;
  }
  .btn-row {
    display: flex; align-items: center; gap: ${GAP_PX}px; overflow: visible;
  }
  .btn-wrapper {
    width: calc(${PREVIEW_W}px * var(--scale, 1));
    height: calc(${PREVIEW_H}px * var(--scale, 1));
    display: inline-block; position: relative; overflow: visible;
  }
  .btn-wrapper img {
    width: 100%; height: 100%; display: block; object-fit: contain;
  }
  .btn-cell { text-align: center; }
  .btn-cell .caption {
    display: block; font-size: 11px; margin-top: 6px; color: #eee;
  }
  .section-label {
    color: rgba(255,255,255,0.7); font-size: 11px; margin-bottom: 6px;
    text-transform: uppercase; letter-spacing: 1px;
  }
</style>
</head>
<body>

<h1>Preview: Loop + Play/Pause + Stop pe fundal <code>${BG_COLOR}</code></h1>
<div class="intro">
  Ordinea: <strong>Loop → Play/Pause → Stop</strong>. Distanta \u00eentre butoane: <code>${GAP_PX}px</code>.
  <br>
  Butoanele sunt afisate la ~${PREVIEW_W}x${PREVIEW_H}px (canvas PSD 473x650 scalat).
  In app dimensiunea reala va fi ajustata la nevoie.
</div>

<div class="scale-control">
  <label>Scala:</label>
  <input type="range" id="scale" min="0.5" max="2.5" step="0.1" value="1">
  <output id="scaleOut">1.0x</output>
  <button class="theme-toggle" onclick="document.body.classList.toggle('dark')">Toggle fundal pagina</button>
</div>

<h2>Toate 3 butoanele in stare OFF (initial)</h2>
<div class="builder-mock">
  <h3>Chord Progression Builder</h3>
  <div class="section-label">Loop OFF · Pause OFF · Stop OFF</div>
  <div class="btn-row">
    <div class="btn-cell"><div class="btn-wrapper"><img src="${loopOff}" alt="loop-off"></div><span class="caption">Loop Off</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${pauseOff}" alt="pause-off"></div><span class="caption">Pause Off</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${stopOff}" alt="stop-off"></div><span class="caption">Stop Off</span></div>
  </div>
</div>

<h2>Play activ (Loop OFF, Play ON, Stop OFF)</h2>
<div class="builder-mock">
  <h3>Chord Progression Builder</h3>
  <div class="section-label">Loop OFF · Play ON · Stop OFF</div>
  <div class="btn-row">
    <div class="btn-cell"><div class="btn-wrapper"><img src="${loopOff}" alt="loop-off"></div><span class="caption">Loop Off</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${playOn}" alt="play-on"></div><span class="caption">Play ON</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${stopOff}" alt="stop-off"></div><span class="caption">Stop Off</span></div>
  </div>
</div>

<h2>Loop activ (Loop ON, Play ON, Stop OFF)</h2>
<div class="builder-mock">
  <h3>Chord Progression Builder</h3>
  <div class="section-label">Loop ON · Play ON · Stop OFF (loop rulez\u0103 in continuu)</div>
  <div class="btn-row">
    <div class="btn-cell"><div class="btn-wrapper"><img src="${loopOn}" alt="loop-on"></div><span class="caption">Loop ON</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${playOn}" alt="play-on"></div><span class="caption">Play ON</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${stopOff}" alt="stop-off"></div><span class="caption">Stop Off</span></div>
  </div>
</div>

<h2>Stop apasat (flash 400ms) - Loop OFF · Pause OFF · Stop ON</h2>
<div class="builder-mock">
  <h3>Chord Progression Builder</h3>
  <div class="section-label">Cand apas Stop: stop-on apare 400ms apoi revine automat la stop-off</div>
  <div class="btn-row">
    <div class="btn-cell"><div class="btn-wrapper"><img src="${loopOff}" alt="loop-off"></div><span class="caption">Loop Off</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${pauseOff}" alt="pause-off"></div><span class="caption">Pause Off</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${stopOn}" alt="stop-on"></div><span class="caption">Stop ON</span></div>
  </div>
</div>

<h2>Toate butoanele in stare ON (in acelasi timp)</h2>
<div class="builder-mock">
  <h3>Chord Progression Builder</h3>
  <div class="section-label">Loop ON · Play ON · Stop ON (doar pt. comparatie vizuala)</div>
  <div class="btn-row">
    <div class="btn-cell"><div class="btn-wrapper"><img src="${loopOn}" alt="loop-on"></div><span class="caption">Loop ON</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${playOn}" alt="play-on"></div><span class="caption">Play ON</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${stopOn}" alt="stop-on"></div><span class="caption">Stop ON</span></div>
  </div>
</div>

<script>
  const scaleInput = document.getElementById('scale');
  const scaleOut = document.getElementById('scaleOut');
  function updateScale() {
    document.documentElement.style.setProperty('--scale', scaleInput.value);
    scaleOut.textContent = parseFloat(scaleInput.value).toFixed(1) + 'x';
  }
  scaleInput.addEventListener('input', updateScale);
  updateScale();
</script>
</body>
</html>`;

fs.writeFileSync('docs/graphics/html_PSD/loop-play-stop-preview.html', html);
console.log('\nGata:');
console.log('  docs/graphics/html_PSD/loop-play-stop-preview.html');
