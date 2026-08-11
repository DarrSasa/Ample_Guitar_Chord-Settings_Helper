#!/usr/bin/env node
/*
 * psd-to-svg.mjs
 *
 * Deschide un fisier .psd, extrage layerele dupa nume, compune stari (Off/On)
 * si le salveaza atat ca PNG @rezolutie PSD cat si ca SVG (cu PNG embed base64).
 *
 * Utilizare:
 *   node scripts/psd-to-svg.mjs docs/graphics/psd/buton-delete.psd delete
 *
 * Argumente:
 *   1. calea catre .psd
 *   2. numele de baza pentru fisierele generate (ex: "delete" -> delete-off.svg, delete-on.svg)
 *
 * Conventie layere (nume EXACT, litere mici):
 *   fundal-buton-oranj-off    -> fundalul in stare Off
 *   semn-<baseName>-off       -> pictograma peste fundal (Off)
 *   fundal-buton-oranj-on     -> fundalul in stare On
 *   semn-<baseName>-on        -> pictograma peste fundal (On)
 *
 * Ordinea de compunere: fundal + semn (semnul deasupra).
 * Foloseste doar `ag-psd` + `sharp` (fara canvas nativ).
 */

import fs from 'node:fs';
import path from 'node:path';
import { readPsd, initializeCanvas } from 'ag-psd';
import sharp from 'sharp';

// ag-psd cere un createCanvas / createImageData chiar si cand cerem raw pixels.
// Ii dam shim-uri pur JS (fara dependinta de biblioteca `canvas` nativa).
function shimCreateCanvas(width, height) {
  return {
    width,
    height,
    getContext() {
      return {
        createImageData(w, h) {
          return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
        },
        getImageData(x, y, w, h) {
          return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
        },
        putImageData() {},
        drawImage() {},
      };
    },
    toDataURL() { return ''; },
  };
}
function shimCreateImage() {
  return { width: 0, height: 0, src: '' };
}
function shimCreateImageData(a, b) {
  // Suporta ambele semnaturi: createImageData(w, h) SAU createImageData(imageDataExistent)
  if (typeof a === 'number') {
    const w = a, h = b;
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  if (a && typeof a === 'object') {
    const w = a.width, h = a.height;
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  return { data: new Uint8ClampedArray(0), width: 0, height: 0 };
}
// initializeCanvas accepta 2 argumente: (createCanvas, createImageData).
// Daca dam si createImageData direct, ag-psd nu mai apeleaza deloc canvas.getContext.
initializeCanvas(shimCreateCanvas, shimCreateImageData);

const [, , psdPath, baseName] = process.argv;
if (!psdPath || !baseName) {
  console.error('Utilizare: node scripts/psd-to-svg.mjs <path.psd> <base-name>');
  console.error('Exemplu:   node scripts/psd-to-svg.mjs docs/graphics/psd/buton-delete.psd delete');
  process.exit(1);
}

if (!fs.existsSync(psdPath)) {
  console.error(`Fisier PSD lipsa: ${psdPath}`);
  process.exit(1);
}

const outDirPng = path.resolve('src/assets/graphics/png');
const outDirSvg = path.resolve('src/assets/graphics/svg');
fs.mkdirSync(outDirPng, { recursive: true });
fs.mkdirSync(outDirSvg, { recursive: true });

console.log(`Deschid PSD: ${psdPath}`);
const buffer = fs.readFileSync(psdPath);

// useImageData: true => primim raw RGBA in `imageData` fara sa fie nevoie de canvas nativ.
const psd = readPsd(buffer, {
  skipCompositeImageData: true,
  useImageData: true,
  skipThumbnail: true,
});

console.log(`Dimensiune PSD: ${psd.width} x ${psd.height} px`);

// Aplatizeaza recursiv arborele de layere si returneaza doar frunzele cu pixeli.
function flattenLayers(node, acc = []) {
  if (!node.children) {
    if (node.name && node.imageData) acc.push(node);
    return acc;
  }
  for (const child of node.children) flattenLayers(child, acc);
  return acc;
}

const allLayers = flattenLayers(psd);
console.log(`Layere gasite in PSD (${allLayers.length}):`);
for (const l of allLayers) {
  const w = (l.right ?? 0) - (l.left ?? 0);
  const h = (l.bottom ?? 0) - (l.top ?? 0);
  console.log(`  - "${l.name}"  la (${l.left ?? 0},${l.top ?? 0}) marime ${w}x${h}`);
}

function findLayer(name) {
  const norm = (s) => (s || '').toLowerCase().trim();
  const target = norm(name);
  const hit = allLayers.find((l) => norm(l.name) === target);
  if (!hit) {
    console.error(`\nLIPSA layer: "${name}"`);
    console.error('  Numele existente in PSD:', allLayers.map((l) => `"${l.name}"`).join(', '));
    console.error('\n  Verifica in Photoshop ca layerul se numeste EXACT asa (litere mici, cratime, fara spatii/diacritice).');
    process.exit(2);
  }
  return hit;
}

const kind = baseName; // ex: "delete"
const layers = {
  fundalOff: findLayer(`fundal-buton-oranj-off`),
  semnOff:   findLayer(`semn-${kind}-off`),
  fundalOn:  findLayer(`fundal-buton-oranj-on`),
  semnOn:    findLayer(`semn-${kind}-on`),
};

// Transforma imageData (ImageData-like: {data: Uint8ClampedArray, width, height})
// intr-un buffer sharp cu pixeli RGBA raw.
function layerToSharp(layer) {
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const width = (layer.right ?? 0) - left;
  const height = (layer.bottom ?? 0) - top;
  if (width <= 0 || height <= 0) {
    throw new Error(`Layer "${layer.name}" are dimensiune invalida ${width}x${height}`);
  }
  // ag-psd returneaza pixeli RGBA (4 canale) in ordinea normala.
  const raw = Buffer.from(layer.imageData.data.buffer, layer.imageData.data.byteOffset, layer.imageData.data.byteLength);
  return {
    left, top, width, height,
    input: raw,
    raw: { width, height, channels: 4 },
  };
}

// Compune fundal + semn intr-un canvas transparent suficient de mare pentru
// a incapea layerele chiar si cand ies din canvasul PSD (offset negativ etc).
async function composeState(fundal, semn) {
  const f = layerToSharp(fundal);
  const s = layerToSharp(semn);

  // Bounding box care cuprinde AMBELE layere.
  const minLeft = Math.min(f.left, s.left);
  const minTop = Math.min(f.top, s.top);
  const maxRight = Math.max(f.left + f.width, s.left + s.width);
  const maxBottom = Math.max(f.top + f.height, s.top + s.height);

  const canvasWidth = maxRight - minLeft;
  const canvasHeight = maxBottom - minTop;

  // Convertim fiecare layer intr-un PNG intermediar.
  const fPng = await sharp(f.input, { raw: f.raw }).png().toBuffer();
  const sPng = await sharp(s.input, { raw: s.raw }).png().toBuffer();

  // Punem fundalul si semnul pe canvasul mare (translatam relativ la min).
  const composed = await sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: fPng, left: f.left - minLeft, top: f.top - minTop },
      { input: sPng, left: s.left - minLeft, top: s.top - minTop },
    ])
    .png()
    .toBuffer();

  // Trim marginile complet transparente.
  const trimmed = await sharp(composed)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 0 })
    .toBuffer()
    .catch(() => composed);

  const meta = await sharp(trimmed).metadata();
  return { buffer: trimmed, width: meta.width, height: meta.height };
}

async function saveState(stateName, composed) {
  const pngPath = path.join(outDirPng, `${baseName}-${stateName}.png`);
  fs.writeFileSync(pngPath, composed.buffer);
  console.log(`  PNG salvat: ${pngPath}  (${composed.width}x${composed.height}, ${(composed.buffer.length / 1024).toFixed(1)} KB)`);

  const b64 = composed.buffer.toString('base64');
  const svg =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${composed.width} ${composed.height}" width="${composed.width}" height="${composed.height}">\n` +
    `  <image href="data:image/png;base64,${b64}" width="${composed.width}" height="${composed.height}" image-rendering="auto"/>\n` +
    `</svg>\n`;
  const svgPath = path.join(outDirSvg, `${baseName}-${stateName}.svg`);
  fs.writeFileSync(svgPath, svg);
  console.log(`  SVG salvat: ${svgPath}  (${(svg.length / 1024).toFixed(1)} KB)`);

  return { width: composed.width, height: composed.height };
}

console.log('\nCompun starea OFF...');
const offInfo = await saveState('off', await composeState(layers.fundalOff, layers.semnOff));

console.log('\nCompun starea ON...');
const onInfo = await saveState('on', await composeState(layers.fundalOn, layers.semnOn));

// Actualizeaza manifest.json.
const metaPath = path.resolve('src/assets/graphics/manifest.json');
let manifest = {};
if (fs.existsSync(metaPath)) {
  try { manifest = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { manifest = {}; }
}
manifest[baseName] = {
  off: { svg: `svg/${baseName}-off.svg`, png: `png/${baseName}-off.png`, width: offInfo.width, height: offInfo.height },
  on:  { svg: `svg/${baseName}-on.svg`,  png: `png/${baseName}-on.png`,  width: onInfo.width,  height: onInfo.height  },
};
fs.writeFileSync(metaPath, JSON.stringify(manifest, null, 2));
console.log(`\nManifest actualizat: ${metaPath}`);
console.log('\nGATA. Poti importa in React:');
console.log(`  import off from './assets/graphics/svg/${baseName}-off.svg';`);
console.log(`  import on  from './assets/graphics/svg/${baseName}-on.svg';`);
