#!/usr/bin/env node
// Rapid: enumera layerele dintr-un PSD ca sa vad structura.
import fs from 'node:fs';
import { readPsd, initializeCanvas } from 'ag-psd';

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

const psdPath = process.argv[2];
if (!psdPath) { console.error('utilizare: node inspect-psd.mjs path.psd'); process.exit(1); }
const buffer = fs.readFileSync(psdPath);
const psd = readPsd(buffer, { skipCompositeImageData: true, useImageData: true, skipThumbnail: true });
console.log(`Dimensiune: ${psd.width} x ${psd.height}`);
function walk(node, depth = 0) {
  const indent = '  '.repeat(depth);
  if (node.children) {
    if (node.name) console.log(`${indent}[group] "${node.name}"`);
    for (const c of node.children) walk(c, depth + 1);
  } else if (node.name) {
    const w = (node.right ?? 0) - (node.left ?? 0);
    const h = (node.bottom ?? 0) - (node.top ?? 0);
    console.log(`${indent}"${node.name}"  (${node.left ?? 0},${node.top ?? 0}) ${w}x${h}${node.hidden ? ' [HIDDEN]' : ''}`);
  }
}
walk(psd);
