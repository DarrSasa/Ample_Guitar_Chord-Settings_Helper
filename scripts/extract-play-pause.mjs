#!/usr/bin/env node
/*
 * extract-play-pause.mjs
 *
 * Extrage layerele din all-play.psd si all-pause.psd, le converteste
 * in SVG-uri finale (Off + On pentru fiecare buton), si genereaza un
 * HTML preview care simuleaza cum vor arata butoanele in context in
 * sectiunea "Chord Progression Builder" (pe fundal #003970).
 *
 * PSD-urile CONTIN DEJA:
 *   - buton complet cu halou (starea On) si umbra (starea Off) aplicate
 *     in Photoshop cu Feather (margini difuze)
 *   - deci NU mai generez halo/glow procedural - imaginile sunt
 *     complete si le folosesc as-is.
 *
 * Output:
 *   src/assets/graphics/svg/play-off.svg
 *   src/assets/graphics/svg/play-on.svg
 *   src/assets/graphics/svg/pause-off.svg
 *   src/assets/graphics/svg/pause-on.svg
 *   docs/graphics/html_PSD/play-pause-in-context.html
 */

import fs from 'node:fs';
import path from 'node:path';
import { readPsd, initializeCanvas } from 'ag-psd';
import sharp from 'sharp';

// Shim canvas pur JS
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

// Culoarea fundalului sectiunii Builder (user specification)
const BG_COLOR = '#003970';

function flatten(node, acc = []) {
  if (!node.children) {
    if (node.name && node.imageData) acc.push(node);
    return acc;
  }
  for (const c of node.children) flatten(c, acc);
  return acc;
}

// Extrage un layer pe canvas patrat de dimensiunea PSD-ului.
// Decupeaza portiunile care ies din canvas.
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
  const intersectLeft   = Math.max(0, -left);
  const intersectTop    = Math.max(0, -top);
  const intersectRight  = Math.min(w, psdW - left);
  const intersectBottom = Math.min(h, psdH - top);
  const cutW = intersectRight - intersectLeft;
  const cutH = intersectBottom - intersectTop;
  if (cutW <= 0 || cutH <= 0) {
    return await sharp({
      create: { width: psdW, height: psdH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
  }
  const cutPng = await sharp(raw, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: intersectLeft, top: intersectTop, width: cutW, height: cutH })
    .png()
    .toBuffer();
  const compositeLeft = Math.max(0, left);
  const compositeTop  = Math.max(0, top);
  return await sharp({
    create: { width: psdW, height: psdH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: cutPng, left: compositeLeft, top: compositeTop }])
    .png()
    .toBuffer();
}

// Construieste SVG minimal (doar imaginea, fara filtre suplimentare).
// Butonul si halo-ul/umbra sunt DEJA in layer-ul PSD - le folosim as-is.
function buildSvg(pngBuffer, size = 500) {
  const b64 = pngBuffer.toString('base64');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <image href="data:image/png;base64,${b64}" width="${size}" height="${size}"/>
</svg>`;
}

// Simplificare optionala pentru marimi SVG mai mici (aici alegem un
// nivel bun - user a spus ca ii place orig, dar il downscale-uim putin
// la 400px de la 500px canvas ca sa nu fie fisiere uriase).
async function processLayer(pngBuffer, targetSize = 400) {
  return await sharp(pngBuffer)
    .resize(targetSize, targetSize, { kernel: 'lanczos3', fit: 'inside' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function extractButton(psdPath, layerNames) {
  console.log(`\nDeschid ${psdPath}...`);
  const buffer = fs.readFileSync(psdPath);
  const psd = readPsd(buffer, {
    skipCompositeImageData: true,
    useImageData: true,
    skipThumbnail: true,
    // IMPORTANT: extragem si layerele hidden (user a lasat pause-on
    // hidden dar il vrem oricum in output).
    // ag-psd extrage layerele oricum in structura, hidden e doar flag.
  });
  console.log(`  Dimensiune: ${psd.width}x${psd.height}`);
  const layers = flatten(psd);

  const results = {};
  for (const [key, name] of Object.entries(layerNames)) {
    const layer = layers.find(l => l.name.toLowerCase().trim() === name.toLowerCase().trim());
    if (!layer) {
      console.warn(`  LIPSA: "${name}"`);
      results[key] = null;
      continue;
    }
    console.log(`  Extrag "${name}"${layer.hidden ? ' [hidden - il extrag oricum]' : ''}...`);
    const png = await layerToSquarePng(layer, psd.width, psd.height);
    results[key] = { png, w: psd.width, h: psd.height };
  }
  return results;
}

// -----------------------------------------------------------------
// Extract all-play.psd
// -----------------------------------------------------------------
const play = await extractButton('docs/graphics/psd/all-play.psd', {
  off: 'play-off',
  on:  'play-on',
});

// -----------------------------------------------------------------
// Extract all-pause.psd
// -----------------------------------------------------------------
const pause = await extractButton('docs/graphics/psd/all-pause.psd', {
  off:    'pause-off',
  on:     'pause-on',
  bg:     'fundal-sectiunea-builder',
});

// -----------------------------------------------------------------
// Salvez fisierele SVG in src/assets/graphics/svg/ (folosite in app)
// -----------------------------------------------------------------
console.log('\nGenerez SVG-uri finale...');

const buttons = [
  { name: 'play-off',  data: play.off },
  { name: 'play-on',   data: play.on },
  { name: 'pause-off', data: pause.off },
  { name: 'pause-on',  data: pause.on },
];

for (const btn of buttons) {
  if (!btn.data) continue;
  const smallPng = await processLayer(btn.data.png, 400);
  const svg = buildSvg(smallPng, 400);
  const outPath = path.join(SVG_OUT, `${btn.name}.svg`);
  fs.writeFileSync(outPath, svg);
  console.log(`  ${outPath}: ${(svg.length / 1024).toFixed(1)} KB`);
}

// -----------------------------------------------------------------
// HTML Preview "in context" - simuleaza cum arata in aplicatie
// -----------------------------------------------------------------
console.log('\nGenerez HTML preview...');

function pngToDataUri(buf) {
  return `data:image/png;base64,${buf.toString('base64')}`;
}

// Pentru HTML afisez la marimi reale (128px in app = ~256 in preview)
async function toPreviewPng(pngBuffer) {
  return await sharp(pngBuffer).resize(512, 512, { kernel: 'lanczos3' }).png().toBuffer();
}
const playOffUri  = pngToDataUri(await toPreviewPng(play.off.png));
const playOnUri   = pngToDataUri(await toPreviewPng(play.on.png));
const pauseOffUri = pngToDataUri(await toPreviewPng(pause.off.png));
const pauseOnUri  = pngToDataUri(await toPreviewPng(pause.on.png));
const bgUri       = pngToDataUri(await toPreviewPng(pause.bg.png));

const html = `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<title>Play + Pause preview in context</title>
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
  body.dark .intro code { background: #444; color: #eee; }

  /* Simularea sectiunii Chord Progression Builder cu fundalul #003970 */
  .builder-mock {
    background: ${BG_COLOR};
    padding: 24px;
    border-radius: 8px;
    border: 1px solid #000;
    margin-bottom: 20px;
    color: #fff;
  }
  .builder-mock h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 16px 0;
    color: #fff;
    letter-spacing: 0.5px;
  }

  /* Row cu butoane - la fel ca in aplicatie, cu spacing minim.
     overflow visible ca halo-ul sa se vada in afara containerului. */
  .btn-row {
    display: flex;
    align-items: center;
    gap: 0;              /* spacing minim - butoanele lipite (halo-ul le separa vizual) */
    overflow: visible;
  }
  .btn-row.gap-small { gap: 2px; }
  .btn-row.gap-med   { gap: 6px; }

  /* Butonul: dimensiune de baza 128x128 in app (2x mai mare decat vechile
     64x32). Preview afisat cu scala variabila. */
  .btn-wrapper {
    width: calc(128px * var(--scale, 1.5));
    height: calc(128px * var(--scale, 1.5));
    display: inline-block;
    position: relative;
    overflow: visible;
    /* Padding negativ ca imaginea PNG (500x500) sa contina halo-ul
       care iese peste dimensiunea butonului de baza. Overflow visible
       lasa halo-ul sa iasa in afara containerului. */
  }
  .btn-wrapper img {
    width: 100%;
    height: 100%;
    display: block;
    /* Halo/umbra din PSD au margini difuze (Feather) si pot iesi peste
       dimensiunea butonului "logic". Le lasam sa se vada in afara. */
  }
  .btn-cell { text-align: center; }
  .btn-cell .caption {
    display: block; font-size: 11px; margin-top: 6px; color: #eee;
  }

  .section-label {
    color: #aaa;
    font-size: 11px;
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
</style>
</head>
<body>

<h1>Preview Play + Pause in context - fundal Builder <code>${BG_COLOR}</code></h1>
<div class="intro">
  Simulez cum vor arata butoanele in sectiunea <strong>Chord Progression Builder</strong>
  cu fundalul schimbat la <code>${BG_COLOR}</code> (albastru inchis, cerut de tine).
  <br>
  Ambele PSD-uri contin DEJA halo (On) si umbra (Off) cu Feather - imaginile
  sunt folosite as-is, fara filtre SVG suplimentare.
  <br>
  <strong>Play</strong>: schimba intre off si on - vezi cum halo-ul lui On
  se difuzeaza natural fara sa se suprapuna neplacut cu Pause.
</div>

<div class="scale-control">
  <label>Scala:</label>
  <input type="range" id="scale" min="0.5" max="2.5" step="0.1" value="1.5">
  <output id="scaleOut">1.5x</output>
  <button class="theme-toggle" onclick="document.body.classList.toggle('dark')">Toggle fundal pagina</button>
</div>

<h2>Test 1: butoanele in stare NORMALA (Play=Off, Pause=Off)</h2>
<div class="builder-mock">
  <h3>Chord Progression Builder</h3>
  <div class="section-label">Butoane lipite (gap=0)</div>
  <div class="btn-row">
    <div class="btn-cell"><div class="btn-wrapper"><img src="${playOffUri}" alt="play-off"></div><span class="caption">Play Off</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${pauseOffUri}" alt="pause-off"></div><span class="caption">Pause Off</span></div>
  </div>
</div>

<h2>Test 2: Play PORNIT (Play=On, Pause=Off) - vezi halo-ul lui Play</h2>
<div class="builder-mock">
  <h3>Chord Progression Builder</h3>
  <div class="section-label">Butoane lipite (gap=0) - halo Play nu trebuie sa "manance" Pause</div>
  <div class="btn-row">
    <div class="btn-cell"><div class="btn-wrapper"><img src="${playOnUri}" alt="play-on"></div><span class="caption">Play ON</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${pauseOffUri}" alt="pause-off"></div><span class="caption">Pause Off</span></div>
  </div>
</div>

<h2>Test 3: Pause PORNIT (Play=Off, Pause=On) - vezi halo-ul lui Pause</h2>
<div class="builder-mock">
  <h3>Chord Progression Builder</h3>
  <div class="section-label">Butoane lipite (gap=0) - halo Pause nu trebuie sa "manance" Play</div>
  <div class="btn-row">
    <div class="btn-cell"><div class="btn-wrapper"><img src="${playOffUri}" alt="play-off"></div><span class="caption">Play Off</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${pauseOnUri}" alt="pause-on"></div><span class="caption">Pause ON</span></div>
  </div>
</div>

<h2>Test 4: Cu spacing mic (gap=2px)</h2>
<div class="builder-mock">
  <h3>Chord Progression Builder</h3>
  <div class="section-label">Butoane cu gap=2px</div>
  <div class="btn-row gap-small">
    <div class="btn-cell"><div class="btn-wrapper"><img src="${playOnUri}" alt="play-on"></div><span class="caption">Play ON</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${pauseOffUri}" alt="pause-off"></div><span class="caption">Pause Off</span></div>
  </div>
  <div class="section-label" style="margin-top: 16px;">Butoane cu gap=6px</div>
  <div class="btn-row gap-med">
    <div class="btn-cell"><div class="btn-wrapper"><img src="${playOnUri}" alt="play-on"></div><span class="caption">Play ON</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${pauseOffUri}" alt="pause-off"></div><span class="caption">Pause Off</span></div>
  </div>
</div>

<h2>Fundal referinta din PSD (fundal-sectiunea-builder)</h2>
<div class="intro">
  Layerul <code>fundal-sectiunea-builder</code> din <code>all-pause.psd</code>
  a fost folosit ca referinta de culoare. Extras din PSD:
</div>
<div style="display: inline-block; border: 1px solid #000; padding: 4px; background: #fff;">
  <img src="${bgUri}" alt="bg" style="width: 200px; height: 200px; display: block;">
</div>
<div class="intro" style="margin-top: 8px;">
  Culoarea aplicata in aplicatie: <code>${BG_COLOR}</code>
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

fs.writeFileSync('docs/graphics/html_PSD/play-pause-in-context.html', html);
console.log('  docs/graphics/html_PSD/play-pause-in-context.html');

console.log('\nGata!');
