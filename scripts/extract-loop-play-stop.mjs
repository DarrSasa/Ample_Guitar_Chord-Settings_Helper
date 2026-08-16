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
// Normalizare cu SCALARE a butonului efectiv la dimensiune uniforma.
//
// Problema fundamentala: fiecare PSD are butonul propriu-zis (patratul
// de piatra, fara halo) cu dimensiuni USOR DIFERITE - 475x515 vs
// 492x532 vs 495x535. Cand centrezi toate pe acelasi canvas, butoanele
// efective apar cu marimi vizuale diferite.
//
// Solutie:
//   1. Pentru fiecare pereche (off + on), detectez bbox-ul butonului
//      efectiv din OFF (care are doar buton + umbra mica, fara halo mare).
//   2. Calculez factor de scalare = target_button_size / off_bbox_max
//   3. Scalez AMBELE (off + on) cu acest factor - butonul efectiv devine
//      exact target_button_size in toate 3 perechile.
//   4. Centrez fiecare pe canvas mare uniform.
//
// Astfel butonul efectiv e identic vizual in toate 3, iar halo-urile
// din On raman diferite dar centrate corect.

async function trimBBox(pngBuffer, threshold = 30) {
  const trimmed = await sharp(pngBuffer).trim({ threshold }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  return { buf: trimmed, w: meta.width ?? 0, h: meta.height ?? 0 };
}

async function scaleBuffer(pngBuffer, scale) {
  const meta = await sharp(pngBuffer).metadata();
  const newW = Math.round((meta.width ?? 0) * scale);
  const newH = Math.round((meta.height ?? 0) * scale);
  return await sharp(pngBuffer).resize(newW, newH, { kernel: 'lanczos3' }).png().toBuffer();
}

// Centrare pe un canvas patrat de dimensiune data, apoi resize final.
async function centerOnCanvas(pngBuffer, canvasSide, targetSize) {
  const meta = await sharp(pngBuffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const composed = await sharp({
    create: { width: canvasSide, height: canvasSide, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: pngBuffer,
      left: Math.round((canvasSide - w) / 2),
      top: Math.round((canvasSide - h) / 2),
    }])
    .png().toBuffer();
  return await sharp(composed).resize(targetSize, targetSize, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 }).toBuffer();
}

async function process(pngBuffer, w, h) {
  return await sharp(pngBuffer).resize(w, h, { kernel: 'lanczos3', fit: 'inside' })
    .png({ compressionLevel: 9 }).toBuffer();
}

const TARGET_SIZE = 400; // canvas patrat uniform final
const TARGET_BUTTON_SIZE = 350; // dimensiunea butonului efectiv (fara halo)

// Pas 1: detectez bbox-ul butonului efectiv din OFF (are doar buton +
// umbra mica, aproape identic cu butonul propriu-zis).
console.log('\nPas 1: detectez bbox butoane efective din OFF...');
const loopOffTrim  = await trimBBox(loop.off.png,  30);
const pauseOffTrim = await trimBBox(pp.pauseOff.png, 30);
const stopOffTrim  = await trimBBox(stop.off.png,  30);
console.log(`  loop-off:  ${loopOffTrim.w}x${loopOffTrim.h}`);
console.log(`  pause-off: ${pauseOffTrim.w}x${pauseOffTrim.h}`);
console.log(`  stop-off:  ${stopOffTrim.w}x${stopOffTrim.h}`);

// Pas 2: factori scalare per pereche.
const loopScale  = TARGET_BUTTON_SIZE / Math.max(loopOffTrim.w,  loopOffTrim.h);
const pauseScale = TARGET_BUTTON_SIZE / Math.max(pauseOffTrim.w, pauseOffTrim.h);
const stopScale  = TARGET_BUTTON_SIZE / Math.max(stopOffTrim.w,  stopOffTrim.h);
console.log(`\nPas 2: factori scalare -> button = ${TARGET_BUTTON_SIZE}px`);
console.log(`  loop:  ${loopScale.toFixed(3)}   pause: ${pauseScale.toFixed(3)}   stop: ${stopScale.toFixed(3)}`);

// Pas 3: pentru fiecare PSD, extract layerele Off si On direct pe canvas
// mare (pastrand POZITIILE originale), apoi scalez si decupez la BBOX-ul
// butonului efectiv (detectat din Off) + o margine mica pentru halo.
//
// IMPORTANT: NU centrez fiecare imagine separat pe canvas (asta produce
// deplasari diferite). In schimb, folosesc bbox-ul BUTONULUI (nu al
// halo-ului) ca centru comun pentru Off si On.
console.log('\nPas 3: extract cu centru comun (buton efectiv, nu halo)...');

// Pentru fiecare buton am pozitia layerelor din PSD (already extracted).
// Le procesez direct pe canvas-ul PSD (473x650), aflu bbox-ul butonului
// din Off, apoi decupez o zona uniforma in jurul acelui bbox pentru
// AMBELE Off si On (astfel butonul e in acelasi loc).

async function processButtonPair(offRawPng, onRawPng, scale) {
  // Trim Off ca sa aflu unde e butonul efectiv.
  const offMeta = await sharp(offRawPng).metadata();
  const psdW = offMeta.width;
  const psdH = offMeta.height;

  // Detectez BUTONUL SOLID (nu halo). Halo-ul e semi-transparent
  // (alpha 30-150), butonul solid are alpha > 200. Folosind threshold
  // mare 200 gasesc centrul EXACT al butonului efectiv, ignorand
  // asimetria halo-ului.
  async function findSolidCenter(pngBuffer) {
    const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3];
        if (alpha > 200) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      w: maxX - minX + 1,
      h: maxY - minY + 1,
    };
  }

  const offSolid = await findSolidCenter(offRawPng);
  const onSolid  = await findSolidCenter(onRawPng);
  // Butonul solid din Off si On e ADESEA la pozitii diferite in PSD
  // (utilizatorul a desenat butonul-on putin mai sus/mai lat cu halou).
  // Deci trebuie sa decupez in jurul CENTRULUI PROPRIU al fiecarui
  // buton solid - astfel Off si On au butonul PERFECT in centrul
  // canvas-ului final.

  // Cropside comun pentru toata perechea = pornim de la butonul solid
  // (Off, care nu are halo) + margine 40% pentru halo-ul din On.
  const btnSide = Math.max(offSolid.w, offSolid.h);
  const cropSide = Math.round(btnSide * 1.4);

  async function cropAround(pngBuffer, cx, cy) {
    const cropLeft = Math.round(cx - cropSide / 2);
    const cropTop  = Math.round(cy - cropSide / 2);
    const safeLeft = Math.max(0, cropLeft);
    const safeTop  = Math.max(0, cropTop);
    const safeRight  = Math.min(psdW,  cropLeft + cropSide);
    const safeBottom = Math.min(psdH,  cropTop + cropSide);
    const safeW = safeRight - safeLeft;
    const safeH = safeBottom - safeTop;
    const extracted = await sharp(pngBuffer)
      .extract({ left: safeLeft, top: safeTop, width: safeW, height: safeH })
      .png().toBuffer();
    // Padding sa ajunga la cropSide x cropSide, pastrand pozitia
    // relativa fata de cropLeft/cropTop originale (nu safe).
    const offsetX = safeLeft - cropLeft;
    const offsetY = safeTop - cropTop;
    return await sharp({
      create: { width: cropSide, height: cropSide, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{ input: extracted, left: offsetX, top: offsetY }]).png().toBuffer();
  }

  // Decupez Off in jurul centrului sau propriu si On in jurul centrului
  // sau propriu. Astfel BUTONUL SOLID e in centrul (cropSide/2, cropSide/2)
  // in AMBELE - se aliniaza perfect vertical si orizontal.
  const offCanvas = await cropAround(offRawPng, offSolid.cx, offSolid.cy);
  const onCanvas  = await cropAround(onRawPng,  onSolid.cx,  onSolid.cy);

  const offFinal = await sharp(offCanvas).resize(TARGET_SIZE, TARGET_SIZE, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
  const onFinal  = await sharp(onCanvas).resize(TARGET_SIZE, TARGET_SIZE, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();

  void scale;
  return { off: offFinal, on: onFinal, cropSide, btnSide };
}

const loopPair  = await processButtonPair(loop.off.png,  loop.on.png,  loopScale);
const ppPairNew = await processButtonPair(pp.pauseOff.png, pp.playOn.png, pauseScale);
const stopPair2 = await processButtonPair(stop.off.png,  stop.on.png,  stopScale);
console.log(`  loop:  crop ${loopPair.cropSide} (btn ${loopPair.btnSide})`);
console.log(`  play:  crop ${ppPairNew.cropSide} (btn ${ppPairNew.btnSide})`);
console.log(`  stop:  crop ${stopPair2.cropSide} (btn ${stopPair2.btnSide})`);

const loopOffOut  = loopPair.off;
const loopOnOut   = loopPair.on;
const pauseOffOut = ppPairNew.off;
const playOnOut   = ppPairNew.on;
const stopOffOut  = stopPair2.off;
const stopOnOut   = stopPair2.on;

// Alias-uri pentru compatibilitate cu HTML preview de mai jos.
// Alias-uri pentru HTML preview de mai jos.
const ppPair = ppPairNew;
const stopPair = stopPair2;

const buttons = [
  { name: 'loop-off',  png: loopOffOut },
  { name: 'loop-on',   png: loopOnOut },
  { name: 'pause-off', png: pauseOffOut },
  { name: 'play-on',   png: playOnOut },
  { name: 'stop-off',  png: stopOffOut },
  { name: 'stop-on',   png: stopOnOut },
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
