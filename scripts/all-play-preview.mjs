#!/usr/bin/env node
/*
 * all-play-preview.mjs
 *
 * Genereaza previzualizari pentru butonul Play realistic (piatra sticloasa
 * futuristica).
 *
 * Pasi:
 *   1. Deschide docs/graphics/psd/all-play.psd
 *   2. Extrage cele 4 layere: fundal + semn, Off + On (dimensiuni exacte)
 *   3. Le decupeaza pe canvas-ul patrat 1500x1500
 *   4. Genereaza 5 nivele de simplificare (blur / downscale-upscale / median)
 *   5. Salveaza toate versiunile in docs/graphics/generated/
 *   6. Creeaza 3 HTML-uri de preview:
 *      - all-play_psd.html          - buton complet cu straturi
 *      - all-play_compare-simplify.html - comparatie nivele simplificare
 *      - all-play_layers.html       - layere individuale
 */

import fs from 'node:fs';
import path from 'node:path';
import { readPsd, initializeCanvas } from 'ag-psd';
import sharp from 'sharp';

// Shim canvas pur JS (fara canvas nativ)
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

const PSD_PATH = 'docs/graphics/psd/all-play.psd';
const OUT_DIR = 'docs/graphics/generated';
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log(`Deschid ${PSD_PATH}...`);
const buffer = fs.readFileSync(PSD_PATH);
const psd = readPsd(buffer, { skipCompositeImageData: true, useImageData: true, skipThumbnail: true });
console.log(`Dimensiune PSD: ${psd.width} x ${psd.height}`);

// Aplatizeaza toate layerele intr-o lista simpla
function flattenLayers(node, acc = []) {
  if (!node.children) {
    if (node.name && node.imageData) acc.push(node);
    return acc;
  }
  for (const child of node.children) flattenLayers(child, acc);
  return acc;
}
const layers = flattenLayers(psd);
console.log('Layere gasite:');
for (const l of layers) {
  const w = (l.right ?? 0) - (l.left ?? 0);
  const h = (l.bottom ?? 0) - (l.top ?? 0);
  console.log(`  "${l.name}"  (${l.left},${l.top}) ${w}x${h}`);
}

function findLayer(name) {
  const hit = layers.find(l => l.name.toLowerCase().trim() === name.toLowerCase().trim());
  if (!hit) throw new Error(`Layer lipsa: "${name}"`);
  return hit;
}

// Extrage un layer decupat pe canvas-ul PSD (1500x1500) - orice bucata
// care iese in afara e taiata.
async function layerToSquarePng(layer) {
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const w = (layer.right ?? 0) - left;
  const h = (layer.bottom ?? 0) - top;
  const raw = Buffer.from(
    layer.imageData.data.buffer,
    layer.imageData.data.byteOffset,
    layer.imageData.data.byteLength
  );
  // Decupam layerul la dreptunghiul de intersectie cu canvas-ul PSD
  // (1500x1500). Layerul poate fi mai mare decat canvas (bucata iese in
  // afara pentru efecte extinse) - decupam ce e util.
  const canvasW = psd.width;
  const canvasH = psd.height;
  const intersectLeft   = Math.max(0, -left);
  const intersectTop    = Math.max(0, -top);
  const intersectRight  = Math.min(w, canvasW - left);
  const intersectBottom = Math.min(h, canvasH - top);
  const cutW = intersectRight - intersectLeft;
  const cutH = intersectBottom - intersectTop;
  if (cutW <= 0 || cutH <= 0) {
    // Layerul e complet in afara canvas-ului
    return await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
  }
  const cutPng = await sharp(raw, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: intersectLeft, top: intersectTop, width: cutW, height: cutH })
    .png()
    .toBuffer();
  const compositeLeft = Math.max(0, left);
  const compositeTop  = Math.max(0, top);
  return await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: cutPng, left: compositeLeft, top: compositeTop }])
    .png()
    .toBuffer();
}

console.log('\nExtrag layere...');
const fundalOff = await layerToSquarePng(findLayer('fundal-buton-play-off'));
const fundalOn  = await layerToSquarePng(findLayer('fundal-buton-play-on'));
let semnOff     = await layerToSquarePng(findLayer('semn-play-off'));
let semnOn      = await layerToSquarePng(findLayer('semn-play-on'));

// Semnul din PSD are fundal NEGRU (in loc de transparent). Il transformam
// in transparent prin "color key" pe negru pur - orice pixel a carui
// luminozitate combinata (R+G+B) e sub un prag devine transparent.
// Astfel triunghiul cristal ramane vizibil dar restul dispare.
async function keyOutBlackBackground(pngBuffer, threshold = 25) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    // Foarte aproape de negru pur (suma canalelor sub prag) -> transparent.
    if (r + g + b < threshold * 3) {
      out[i + 3] = 0;
    } else if (r + g + b < threshold * 6) {
      // In zona de tranzitie (negru inspre culoare) reducem alpha
      // proportional - antialiasing smooth pe margini.
      const factor = ((r + g + b) - threshold * 3) / (threshold * 3);
      out[i + 3] = Math.round(out[i + 3] * Math.min(1, Math.max(0, factor)));
    }
  }
  return await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

console.log('  Aplic color-key pentru semne (elimina fundalul negru)...');
semnOff = await keyOutBlackBackground(semnOff);
semnOn  = await keyOutBlackBackground(semnOn);

fs.writeFileSync(path.join(OUT_DIR, 'fundal-play-off.png'), fundalOff);
fs.writeFileSync(path.join(OUT_DIR, 'fundal-play-on.png'), fundalOn);
fs.writeFileSync(path.join(OUT_DIR, 'semn-play-off.png'), semnOff);
fs.writeFileSync(path.join(OUT_DIR, 'semn-play-on.png'), semnOn);
console.log('  Layere brute salvate.');

// -----------------------------------------------------------------
// SIMPLIFICARE - 5 nivele pentru fundal-play-on (cel mai mare, cu textura)
// -----------------------------------------------------------------
// Nivel 0: original (referinta)
// Nivel 1: usor blur + downscale-upscale usor
// Nivel 2: moderat
// Nivel 3: puternic
// Nivel 4: extrem (aspect ilustrativ / poster)
//
// Metode combinate:
//  - downscale la % din original + upscale inapoi cu Lanczos3 (netezire)
//  - median filter (curata zgomotul, pastreaza margini)
//  - blur usor
//
// Toate exportate ca PNG comprimat maxim + apoi convertite in dataURI
// pentru comparatie.

const SIMPLIFY_LEVELS = [
  { name: 'orig',   downTo: 100, median: 0, blur: 0 },  // original
  { name: 's1',     downTo: 50,  median: 3, blur: 0.5 },
  { name: 's2',     downTo: 30,  median: 5, blur: 1 },
  { name: 's3',     downTo: 20,  median: 7, blur: 1.5 },
  { name: 's4',     downTo: 12,  median: 9, blur: 2 },
];

async function simplify(pngBuffer, level, sizeHint = 512) {
  if (level.name === 'orig') {
    // Doar downscale la sizeHint pentru comparatie in HTML.
    return await sharp(pngBuffer).resize(sizeHint, sizeHint, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
  }
  const smallSize = Math.max(24, Math.round(sizeHint * level.downTo / 100));
  let img = sharp(pngBuffer)
    .resize(smallSize, smallSize, { kernel: 'lanczos3' })
    .resize(sizeHint, sizeHint, { kernel: 'lanczos3' });
  if (level.median > 0) img = img.median(level.median);
  if (level.blur > 0) img = img.blur(level.blur);
  return await img.png({ compressionLevel: 9 }).toBuffer();
}

console.log('\nGenerez versiuni simplificate ale fundal-play-on...');
const targetSize = 512; // preview size in HTML
const fundalOnSimplified = {};
for (const level of SIMPLIFY_LEVELS) {
  const buf = await simplify(fundalOn, level, targetSize);
  fundalOnSimplified[level.name] = buf;
  fs.writeFileSync(path.join(OUT_DIR, `fundal-play-on-${level.name}.png`), buf);
  console.log(`  ${level.name}: ${(buf.length / 1024).toFixed(1)} KB`);
}
// Fac si versiuni pentru fundal-off + semnele
const fundalOffSimplified = {};
const semnOffSimplified = {};
const semnOnSimplified = {};
for (const level of SIMPLIFY_LEVELS) {
  fundalOffSimplified[level.name] = await simplify(fundalOff, level, targetSize);
  semnOffSimplified[level.name]   = await simplify(semnOff, level, targetSize);
  semnOnSimplified[level.name]    = await simplify(semnOn, level, targetSize);
}

// -----------------------------------------------------------------
// Genereaza SVG-uri per varianta simplificata
// -----------------------------------------------------------------

function pngToDataURI(buf) {
  return `data:image/png;base64,${buf.toString('base64')}`;
}

console.log('\nSalvez SVG-uri finale pentru fiecare nivel de simplificare...');
const svgFiles = {};
for (const level of SIMPLIFY_LEVELS) {
  // Buton OFF: fundal + semn
  const offSvg = buildButtonSvg({
    fundal: pngToDataURI(fundalOffSimplified[level.name]),
    semn:   pngToDataURI(semnOffSimplified[level.name]),
    state:  'off',
  });
  // Buton ON: fundal + semn + halo curcubeu + LED glow + reflexie
  const onSvg = buildButtonSvg({
    fundal: pngToDataURI(fundalOnSimplified[level.name]),
    semn:   pngToDataURI(semnOnSimplified[level.name]),
    state:  'on',
  });
  const offPath = path.join(OUT_DIR, `all-play-${level.name}-off.svg`);
  const onPath  = path.join(OUT_DIR, `all-play-${level.name}-on.svg`);
  fs.writeFileSync(offPath, offSvg);
  fs.writeFileSync(onPath, onSvg);
  svgFiles[level.name] = {
    off: offSvg,
    on: onSvg,
    offSize: offSvg.length,
    onSize: onSvg.length,
  };
  console.log(`  ${level.name}: OFF=${(offSvg.length/1024).toFixed(1)} KB, ON=${(onSvg.length/1024).toFixed(1)} KB`);
}

// -----------------------------------------------------------------
// buildButtonSvg - compune butonul cu toate straturile
// -----------------------------------------------------------------

function buildButtonSvg({ fundal, semn, state }) {
  // ViewBox patrat, dimensiune "virtuala" 100x100 (SVG-ul se scaleaza)
  const isOn = state === 'on';

  // Glow patrat realist (user request: fara halo curcubeu circular).
  //
  // Ideea: simulez lumina care emana dintr-un obiect luminos - urmeaza
  // FORMA butonului (patrat) si se stinge treptat spre exterior. Folosesc
  // mai multe straturi de <rect> mai mari decat butonul, fiecare cu blur
  // gaussian tot mai mare - creaza efect de difuzie ambientala reala.
  //
  // Culoarea principala: alb-galbui cald (culoarea dominanta a texturii
  // tale de piatra sticloasa). Culorile cyan/magenta din refractie sunt
  // adaugate ca tuse subtile intr-un al doilea strat pentru varietate
  // cromatica, dar NU inele separate - se amesteca in glow-ul principal.
  //
  // Toate straturile sunt SUB butonul propriu-zis (renders inainte de
  // <clipPath>-ul butonului).
  const halo = isOn ? `
    <!-- Strat 1: glow foarte larg alb-galbui (raspandire exterioara). -->
    <rect x="-14" y="-14" width="128" height="128" rx="16"
      fill="#fff2c0" opacity="0.65" filter="url(#glow-blur-large)"/>
    <!-- Strat 2: halo mediu alb-galbui cald (langa margini) -->
    <rect x="-6" y="-6" width="112" height="112" rx="12"
      fill="#ffdc78" opacity="0.60" filter="url(#glow-blur-medium)"/>
    <!-- Strat 3: tenta subtila cyan (refractie sticla) -->
    <rect x="-10" y="-10" width="120" height="120" rx="14"
      fill="#60d8ff" opacity="0.22" filter="url(#glow-blur-large)"/>
    <!-- Strat 4: tenta subtila magenta (refractie sticla) -->
    <rect x="-12" y="-12" width="124" height="124" rx="15"
      fill="#ff70d0" opacity="0.18" filter="url(#glow-blur-large)"/>
    <!-- Strat 5: halo strans langa buton pentru "aprindere" clara -->
    <rect x="0" y="0" width="100" height="100" rx="8"
      fill="#fff8e0" opacity="0.55" filter="url(#glow-blur-small)"/>` : '';

  // Efect "pressed"/"raised": inset shadow interior pentru On, drop shadow
  // pentru Off. Ambele in SVG cu filter.
  const insetOverlay = isOn ? `
    <!-- Buton "introdus" - inset shadow interior -->
    <rect x="4" y="4" width="92" height="92" rx="6" fill="none"
      style="filter: url(#pressed-inner);" pointer-events="none"/>
    <!-- Shadow interior "manual" prin gradient in colturi -->
    <rect x="4" y="4" width="92" height="92" rx="6" fill="url(#pressed-vignette)" pointer-events="none"/>` : '';

  const raisedOverlay = !isOn ? `
    <!-- Buton "ridicat" - highlight top + shadow bottom manual -->
    <rect x="4" y="4" width="92" height="46" rx="6" fill="url(#raised-highlight)" pointer-events="none"/>
    <rect x="4" y="50" width="92" height="46" fill="url(#raised-shadow)" pointer-events="none"/>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <!-- Umbre exterioare (drop shadow "cade lumina de sus") -->
    <filter id="drop-shadow-btn" x="-20%" y="-20%" width="140%" height="150%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
      <feOffset dx="0.5" dy="1.5"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <!-- Glow blur pentru straturile de lumina ambientala (halo patrat).
         3 dimensiuni: small (langa buton) / medium / large (difuzie
         larga in exterior). stdDeviation controleaza cat de "moale" e
         raspandirea luminii. -->
    <filter id="glow-blur-small" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="2"/>
    </filter>
    <filter id="glow-blur-medium" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>
    <filter id="glow-blur-large" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>

    <!-- Inset shadow pentru starea "pressed" (On, buton introdus) -->
    <filter id="pressed-inner">
      <feFlood flood-color="#000000" flood-opacity="0.35"/>
      <feComposite in2="SourceAlpha" operator="out"/>
      <feGaussianBlur stdDeviation="2"/>
      <feOffset dx="0" dy="1.5"/>
      <feComposite in2="SourceAlpha" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="pressed-vignette" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(0,0,0,0.25)"/>
      <stop offset="0.15" stop-color="rgba(0,0,0,0)"/>
      <stop offset="0.85" stop-color="rgba(0,0,0,0)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.15)"/>
    </linearGradient>

    <!-- Raised: highlight top + shadow bottom pentru starea Off -->
    <linearGradient id="raised-highlight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="1" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
    <linearGradient id="raised-shadow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(0,0,0,0)"/>
      <stop offset="1" stop-color="rgba(0,0,0,0.20)"/>
    </linearGradient>

    <!-- Clip patrat cu colturi usor rotunjite pentru buton -->
    <clipPath id="btn-clip">
      <rect x="4" y="4" width="92" height="92" rx="6"/>
    </clipPath>
  </defs>

  <g filter="url(#drop-shadow-btn)">
    <!-- Halo (doar cand ON) sub buton -->
    ${halo}

    <!-- Buton continut - clip patrat -->
    <g clip-path="url(#btn-clip)">
      <!-- Fundal buton (piatra sticloasa) -->
      <image href="${fundal}" x="4" y="4" width="92" height="92" preserveAspectRatio="xMidYMid slice"/>
      <!-- Semn play (triunghi din PSD) -->
      <image href="${semn}" x="4" y="4" width="92" height="92" preserveAspectRatio="xMidYMid slice"/>

      ${raisedOverlay}
      ${insetOverlay}
    </g>

    <!-- Border subtire negru pentru definitie -->
    <rect x="4" y="4" width="92" height="92" rx="6" fill="none" stroke="rgba(0,0,0,0.6)" stroke-width="0.5"/>
  </g>
</svg>`;
}

// -----------------------------------------------------------------
// HTML preview 1: buton complet in 5 variante (simplificari)
// -----------------------------------------------------------------

function commonCss() {
  return `
    * { box-sizing: border-box; }
    body { background: #acb0ac; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #222; margin: 0; padding: 24px; }
    body.dark { background: #2a2d2a; color: #ddd; }
    h1 { margin: 0 0 8px 0; font-size: 18px; }
    h2 { margin: 24px 0 10px 0; font-size: 14px; }
    .intro { max-width: 1000px; margin-bottom: 20px; font-size: 13px; line-height: 1.5; }
    .intro code { background: #d5d5d5; padding: 2px 5px; border-radius: 3px; }
    body.dark .intro code { background: #444; color: #eee; }
    .scale-control { display: inline-flex; align-items: center; gap: 12px; background: #d5d5d5; padding: 8px 14px; border-radius: 6px; margin-bottom: 16px; }
    body.dark .scale-control { background: #444; color: #eee; }
    .scale-control input { width: 200px; }
    .scale-control output { font-family: monospace; font-weight: bold; min-width: 45px; text-align: right; }
    .theme-toggle { background: #d5d5d5; padding: 8px 14px; border-radius: 6px; border: 1px solid #999; cursor: pointer; margin-left: 8px; font-family: inherit; }
    body.dark .theme-toggle { background: #555; color: #eee; border-color: #333; }
    .row { display: flex; align-items: center; gap: 20px; padding: 14px; background: rgba(255,255,255,0.15); border-radius: 8px; margin-bottom: 10px; }
    body.dark .row { background: rgba(255,255,255,0.05); }
    .label { flex: 0 0 220px; font-size: 13px; }
    .label .desc { display: block; font-size: 11px; opacity: 0.7; margin-top: 3px; }
    .btn-group { display: flex; gap: 12px; align-items: center; }
    .btn-cell { text-align: center; }
    .btn-cell .caption { display: block; font-size: 11px; margin-top: 6px; opacity: 0.7; }
    /* Butonul: 128 x 128 px de baza (2x fata de 64x32 vechi = ~2x mai mare).
       In preview afisam 2x pentru vizibilitate (256x256). */
    .btn-wrapper { display: inline-block; width: calc(256px * var(--scale, 1)); height: calc(256px * var(--scale, 1)); transition: transform 120ms ease; }
    .btn-wrapper:hover { transform: translateY(-2px); }
    .btn-wrapper svg, .btn-wrapper img { width: 100%; height: 100%; display: block; }
  `;
}

function scaleControlHtml() {
  return `
    <div class="scale-control">
      <label>Scala:</label>
      <input type="range" id="scale" min="0.3" max="2.5" step="0.1" value="1">
      <output id="scaleOut">1.0x</output>
      <button class="theme-toggle" onclick="document.body.classList.toggle('dark')">Toggle fundal</button>
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
    </script>`;
}

console.log('\nGenerez HTML preview: buton complet cu 5 variante...');
const rows1 = SIMPLIFY_LEVELS.map(level => `
  <div class="row">
    <div class="label">
      ${level.name === 'orig' ? '<strong>Original</strong>' : `<strong>Simplificat ${level.name}</strong>`}
      <span class="desc">${
        level.name === 'orig' ? 'PSD extract la 512px (referinta)' :
        `downTo=${level.downTo}%, median=${level.median}, blur=${level.blur}`
      }</span>
      <span class="desc">SVG Off: ${(svgFiles[level.name].offSize / 1024).toFixed(1)} KB, On: ${(svgFiles[level.name].onSize / 1024).toFixed(1)} KB</span>
    </div>
    <div class="btn-group">
      <div class="btn-cell">
        <div class="btn-wrapper">${svgFiles[level.name].off}</div>
        <span class="caption">Off</span>
      </div>
      <div class="btn-cell">
        <div class="btn-wrapper">${svgFiles[level.name].on}</div>
        <span class="caption">On</span>
      </div>
    </div>
  </div>
`).join('');
const html1 = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>All-Play preview</title>
<style>${commonCss()}</style></head><body>
<h1>Buton Play realistic - 5 nivele de simplificare</h1>
<div class="intro">
  Butonul e construit din straturile tale (fundal + semn din PSD) plus straturi
  generate procedural: <strong>halo curcubeu</strong> (alb-galbui + cyan + magenta),
  <strong>umbra exterioara</strong> (drop-shadow), <strong>overlay pressed/raised</strong>
  (buton introdus / ridicat), <strong>border</strong> negru pentru definitie.
  <br>
  Fiecare varianta simplifica textura fundalului diferit prin combinatie de
  downscale-upscale, median filter, blur - vezi ce arata bine si e mic ca marime.
  <br>
  Dimensiune de baza: <code>128x128 px</code> (2x fata de butoanele vechi 64x32).
  Preview afisat la <code>256x256</code> pentru vizibilitate.
</div>
${scaleControlHtml()}
${rows1}
</body></html>`;
fs.writeFileSync('docs/graphics/html_PSD/all-play_psd.html', html1);
console.log('  docs/graphics/html_PSD/all-play_psd.html');

// -----------------------------------------------------------------
// HTML preview 2: compararea nivelelor de simplificare pentru fundal
// -----------------------------------------------------------------

console.log('\nGenerez HTML preview: comparatie simplificari fundal-play-on...');
const rows2 = SIMPLIFY_LEVELS.map(level => `
  <div class="row">
    <div class="label">
      <strong>${level.name}</strong>
      <span class="desc">${
        level.name === 'orig' ? 'original (referinta)' :
        `downTo=${level.downTo}%, median=${level.median}, blur=${level.blur}`
      }</span>
      <span class="desc">PNG: ${(fundalOnSimplified[level.name].length / 1024).toFixed(1)} KB</span>
    </div>
    <div class="btn-group">
      <div class="btn-cell">
        <div class="btn-wrapper">
          <img src="${pngToDataURI(fundalOnSimplified[level.name])}" alt="${level.name}">
        </div>
        <span class="caption">fundal ON</span>
      </div>
    </div>
  </div>
`).join('');
const html2 = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Compare simplify</title>
<style>${commonCss()}</style></head><body>
<h1>Comparatie nivele simplificare pentru fundal-play-on</h1>
<div class="intro">
  Vezi cum pierd detalii pe masura ce cresc simplificarea. La niveluri mari
  textura piatra sticloasa devine "poster" - mai putine detalii dar SVG mai mic.
  Alege un nivel bun cand faci butonul final: <strong>trebuie sa arate bine
  la dimensiunea reala (128x128 sau chiar 64x64)</strong> - nu la 512!
</div>
${scaleControlHtml()}
${rows2}
</body></html>`;
fs.writeFileSync('docs/graphics/html_PSD/all-play_compare-simplify.html', html2);
console.log('  docs/graphics/html_PSD/all-play_compare-simplify.html');

// -----------------------------------------------------------------
// HTML preview 3: layere individuale
// -----------------------------------------------------------------

console.log('\nGenerez HTML preview: layere individuale...');
const html3 = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Layere individuale</title>
<style>${commonCss()}
  .row .btn-wrapper { background: repeating-conic-gradient(#ccc 0 25%, #eee 0 50%) 50% / 20px 20px; }
</style></head><body>
<h1>Layere individuale din all-play.psd</h1>
<div class="intro">
  Fiecare layer extras din PSD, afisat pe fundal cadrilat ca sa vezi
  transparenta. Verifica daca dimensiunile si pozitiile sunt corecte.
</div>
${scaleControlHtml()}
<div class="row">
  <div class="label"><strong>fundal-buton-play-off</strong></div>
  <div class="btn-group">
    <div class="btn-cell"><div class="btn-wrapper"><img src="${pngToDataURI(await sharp(fundalOff).resize(512, 512, { kernel: 'lanczos3' }).png().toBuffer())}"></div><span class="caption">OFF</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${pngToDataURI(await sharp(fundalOn).resize(512, 512, { kernel: 'lanczos3' }).png().toBuffer())}"></div><span class="caption">ON</span></div>
  </div>
</div>
<div class="row">
  <div class="label"><strong>semn-play</strong></div>
  <div class="btn-group">
    <div class="btn-cell"><div class="btn-wrapper"><img src="${pngToDataURI(await sharp(semnOff).resize(512, 512, { kernel: 'lanczos3' }).png().toBuffer())}"></div><span class="caption">OFF</span></div>
    <div class="btn-cell"><div class="btn-wrapper"><img src="${pngToDataURI(await sharp(semnOn).resize(512, 512, { kernel: 'lanczos3' }).png().toBuffer())}"></div><span class="caption">ON</span></div>
  </div>
</div>
</body></html>`;
fs.writeFileSync('docs/graphics/html_PSD/all-play_layers.html', html3);
console.log('  docs/graphics/html_PSD/all-play_layers.html');

console.log('\nGata!');
