#!/usr/bin/env node
// Extrage layerele din all-layers.psd pastrand pozitia lor absoluta in canvas-ul PSD-ului mare.
// Fiecare layer este salvat ca PNG de dimensiunea documentului (1400x650) — cu butonul plasat
// exact la coordonatele originale din Photoshop. Astfel, in HTML/aplicatie, punand doua PNG-uri
// unul peste altul (off + on cu opacity 0/1), toggle-ul e perfect aliniat, iar distantele
// intre butoane sunt exact cum le-a asezat userul in PSD.
//
// Iesire:
//   src/assets/graphics/svg/all/loop-off.png, loop-on.png, pause-off.png, play-on.png,
//                             stop-off.png, stop-on.png
//   src/assets/graphics/svg/all/positions.json  — meta: { docW, docH, bg, layers: { name: {left,top,w,h} } }
//   docs/graphics/html_PSD/all-layers-preview.html
//
// Nu atinge SVG-urile existente (loop-off.svg etc.) — foloseste director separat 'all/'.

import fs from 'node:fs';
import path from 'node:path';
import { readPsd, initializeCanvas } from 'ag-psd';
import sharp from 'sharp';

// --- canvas shim pentru ag-psd (Node headless) ---
function shim(w, h) {
  const size = Math.max(0, w * h * 4);
  const data = new Uint8ClampedArray(size);
  return {
    width: w, height: h,
    getContext() {
      return {
        createImageData: (a, b) => {
          if (typeof a === 'number') return { data: new Uint8ClampedArray(a * b * 4), width: a, height: b };
          return { data: new Uint8ClampedArray(a.width * a.height * 4), width: a.width, height: a.height };
        },
        getImageData: (x, y, w2, h2) => ({ data: new Uint8ClampedArray(w2 * h2 * 4), width: w2, height: h2 }),
        putImageData(img) { if (img && img.data) data.set(img.data.subarray(0, size)); },
        drawImage() {},
      };
    },
    toDataURL() { return ''; },
    _data: data,
  };
}
function shimData(a, b) {
  if (typeof a === 'number') return { data: new Uint8ClampedArray(a * b * 4), width: a, height: b };
  if (a && typeof a === 'object') return { data: new Uint8ClampedArray(a.width * a.height * 4), width: a.width, height: a.height };
  return { data: new Uint8ClampedArray(0), width: 0, height: 0 };
}
initializeCanvas(shim, shimData);

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const PSD_PATH = path.join(ROOT, 'docs/graphics/psd/all-layers.psd');
const OUT_DIR  = path.join(ROOT, 'src/assets/graphics/svg/all');
const HTML_OUT = path.join(ROOT, 'docs/graphics/html_PSD/all-layers-preview.html');

// Butoanele de interes (ignoram 'fundal' — il redam separat via CSS)
const LAYER_NAMES = ['loop-off', 'loop-on', 'pause-off', 'play-on', 'stop-off', 'stop-on'];
const BG_COLOR = '#677987';

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(HTML_OUT), { recursive: true });

  const buffer = fs.readFileSync(PSD_PATH);
  const psd = readPsd(buffer, { useImageData: true, skipThumbnail: true });
  const docW = psd.width;
  const docH = psd.height;
  console.log(`PSD: ${docW}x${docH}`);

  // aduna toate layerele intr-un flat map dupa nume
  const flat = {};
  function walk(node) {
    if (node.children) { for (const c of node.children) walk(c); return; }
    if (node.name) flat[node.name] = node;
  }
  walk(psd);

  const positions = { docW, docH, bg: BG_COLOR, layers: {} };

  for (const name of LAYER_NAMES) {
    const layer = flat[name];
    if (!layer) { console.warn(`  ! lipseste layerul "${name}"`); continue; }
    const left = layer.left ?? 0;
    const top  = layer.top  ?? 0;
    const w = (layer.right  ?? 0) - left;
    const h = (layer.bottom ?? 0) - top;
    if (!layer.imageData || !w || !h) { console.warn(`  ! layer "${name}" fara imageData`); continue; }

    // imageData a layerului e in bbox-ul lui (w x h). Il asezam pe un canvas transparent
    // de dimensiunea documentului la coordonatele (left, top).
    const src = layer.imageData.data; // RGBA, w*h*4
    // sharp: raw input RGBA
    const layerBuf = Buffer.from(src.buffer, src.byteOffset, src.byteLength);

    // creaza canvas transparent docW x docH si compune layerul la (left, top)
    const fullPng = await sharp({
      create: { width: docW, height: docH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{
        input: layerBuf,
        raw: { width: w, height: h, channels: 4 },
        left, top,
      }])
      .png({ compressionLevel: 9 })
      .toBuffer();

    const outPath = path.join(OUT_DIR, `${name}.png`);
    fs.writeFileSync(outPath, fullPng);
    positions.layers[name] = { left, top, w, h };
    console.log(`  ✓ ${name}.png  (${left},${top}) ${w}x${h}  ${(fullPng.length/1024).toFixed(0)} KB`);
  }

  // salveaza pozitiile (util in Etapa 2 pentru cablare)
  fs.writeFileSync(path.join(OUT_DIR, 'positions.json'), JSON.stringify(positions, null, 2));
  console.log(`  ✓ positions.json`);

  // --- HTML preview ---
  // convertim PNG-urile in data URI ca sa fie autoportante (ca la mostrele anterioare)
  const dataUri = {};
  for (const name of LAYER_NAMES) {
    const p = path.join(OUT_DIR, `${name}.png`);
    if (!fs.existsSync(p)) continue;
    dataUri[name] = `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
  }

  const html = buildHtml(docW, docH, dataUri, positions);
  fs.writeFileSync(HTML_OUT, html);
  console.log(`\n✓ preview: docs/graphics/html_PSD/all-layers-preview.html`);
}

function buildHtml(docW, docH, uri, positions) {
  const pairs = [
    { key: 'loop',       off: 'loop-off',  on: 'loop-on'  },
    { key: 'play-pause', off: 'pause-off', on: 'play-on'  },
    { key: 'stop',       off: 'stop-off',  on: 'stop-on'  },
  ];
  const pos = positions.layers;

  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8" />
<title>All-Layers preview — layout exact din Photoshop</title>
<style>
  :root { --bg: ${BG_COLOR}; --scale: 1; }
  html, body { margin: 0; padding: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #1a1a1a; color: #eee; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #222; padding: 10px 16px; display: flex; gap: 24px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid #333; }
  .toolbar label { display: flex; align-items: center; gap: 8px; font-size: 14px; }
  .toolbar input[type=range] { width: 220px; }
  .toolbar .val { font-variant-numeric: tabular-nums; opacity: 0.8; min-width: 44px; }
  .scenario { padding: 20px 16px; }
  .scenario h2 { margin: 0 0 10px; font-size: 15px; font-weight: 600; color: #bbb; }
  .stage {
    position: relative;
    width: ${docW}px;
    height: ${docH}px;
    background: var(--bg);
    transform-origin: top left;
    transform: scale(var(--scale));
    outline: 1px solid #333;
  }
  .stage.no-bg { background: transparent; background-image:
      linear-gradient(45deg, #2a2a2a 25%, transparent 25%),
      linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #2a2a2a 75%),
      linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
      background-size: 20px 20px;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0;
  }
  .stage img { position: absolute; left: 0; top: 0; width: ${docW}px; height: ${docH}px; user-select: none; -webkit-user-drag: none; pointer-events: none; }
  .frame { margin-bottom: ${docH + 40}px; }
  .info { font-size: 12px; color: #888; margin-bottom: 8px; }
  code { background: #2a2a2a; padding: 1px 6px; border-radius: 3px; font-size: 12px; }
</style>
</head>
<body>
  <div class="toolbar">
    <label>Slider scală
      <input id="scale" type="range" min="0.3" max="1.5" step="0.05" value="0.7" />
      <span class="val" id="scaleVal">0.70x</span>
    </label>
    <label>
      <input id="bg" type="checkbox" checked /> Toggle fundal <code>${BG_COLOR}</code>
    </label>
    <span class="info">Document PSD: <code>${docW}×${docH}</code> — pozitiile butoanelor sunt exact cele din Photoshop.</span>
  </div>

  ${pairs.map(({ key, off, on }) => {
    const po = pos[off]; const pn = pos[on];
    return `
  <section class="scenario">
    <h2>${key.toUpperCase()} — OFF (${off}) suprapus cu ON (${on}) ascuns</h2>
    <div class="info">off @ (${po?.left ?? '-'}, ${po?.top ?? '-'}) ${po?.w ?? '-'}×${po?.h ?? '-'} · on @ (${pn?.left ?? '-'}, ${pn?.top ?? '-'}) ${pn?.w ?? '-'}×${pn?.h ?? '-'}</div>
    <div class="frame">
      <div class="stage">
        <img src="${uri[off] || ''}" alt="${off}" />
      </div>
    </div>
  </section>`;
  }).join('')}

  <section class="scenario">
    <h2>TOATE OFF (starea initiala din UI)</h2>
    <div class="frame">
      <div class="stage">
        <img src="${uri['loop-off']  || ''}" alt="loop-off" />
        <img src="${uri['pause-off'] || ''}" alt="pause-off" />
        <img src="${uri['stop-off']  || ''}" alt="stop-off" />
      </div>
    </div>
  </section>

  <section class="scenario">
    <h2>TOATE ON (loop-on + play-on + stop-on)</h2>
    <div class="frame">
      <div class="stage">
        <img src="${uri['loop-on'] || ''}" alt="loop-on" />
        <img src="${uri['play-on'] || ''}" alt="play-on" />
        <img src="${uri['stop-on'] || ''}" alt="stop-on" />
      </div>
    </div>
  </section>

  <section class="scenario">
    <h2>Scenariu real: Loop ON + Play ON (redare cu loop) + Stop OFF</h2>
    <div class="frame">
      <div class="stage">
        <img src="${uri['loop-on']  || ''}" alt="loop-on" />
        <img src="${uri['play-on']  || ''}" alt="play-on" />
        <img src="${uri['stop-off'] || ''}" alt="stop-off" />
      </div>
    </div>
  </section>

  <section class="scenario">
    <h2>Scenariu real: Loop OFF + Pause (redare oprita) + Stop OFF</h2>
    <div class="frame">
      <div class="stage">
        <img src="${uri['loop-off']  || ''}" alt="loop-off" />
        <img src="${uri['pause-off'] || ''}" alt="pause-off" />
        <img src="${uri['stop-off']  || ''}" alt="stop-off" />
      </div>
    </div>
  </section>

<script>
  const root = document.documentElement;
  const sc = document.getElementById('scale');
  const scv = document.getElementById('scaleVal');
  const bg = document.getElementById('bg');
  function apply() {
    root.style.setProperty('--scale', sc.value);
    scv.textContent = parseFloat(sc.value).toFixed(2) + 'x';
    document.querySelectorAll('.stage').forEach(s => {
      if (bg.checked) s.classList.remove('no-bg');
      else s.classList.add('no-bg');
    });
    // ajusteaza marginea de jos a fiecarui .frame la inaltimea scalata
    const h = ${docH} * parseFloat(sc.value);
    document.querySelectorAll('.frame').forEach(f => { f.style.marginBottom = (h - ${docH} + 40) + 'px'; });
  }
  sc.addEventListener('input', apply);
  bg.addEventListener('change', apply);
  apply();
</script>
</body>
</html>`;
}

main().catch(e => { console.error(e); process.exit(1); });
