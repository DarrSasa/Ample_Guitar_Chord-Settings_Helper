#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract-scores.py

Scaneaza un PDF (cartea) pagina cu pagina si extrage AUTOMAT exemplele
muzicale (partiturile), fiecare cu titlul/legenda lui, apoi (optional) le
converteste in MusicXML prin Audiveris.

Strategie (echilibru intre precizie si robustete):
  - Detectam portativele prin proiectie orizontala + varfuri (fiabil, merge
    la orice scala).
  - Grupam portativele APROPIATE intr-un singur "exemplu" (ex. un pian cu 2
    portative, sau un scor multi-instrument) — distanta de unire e reglabila.
  - Decupam exemplul cu margini GENEROASE + extindere ca sa includem si
    titlul de sus / legenda de jos (textul din partitura).
  - Audiveris primeste CROP-uri curate (nu pagini intregi pline de text),
    ceea ce il face sa mearga mult mai bine.

Iesire:
    music/score-pNNN-a.png     <- crop-ul exemplului muzical
    music/score-pNNN-a.mxl     <- MusicXML (doar cu --audiveris)
    music/manifest.json        <- lista paginilor + exemplarelor

Dependinte (o singura data):
    pip install pymupdf opencv-python-headless numpy

Folosire:
    python scripts\\extract-scores.py "C:\\carti\\carte.pdf"
    python scripts\\extract-scores.py "C:\\carti\\carte.pdf" --audiveris "C:\\Program Files\\Audiveris\\Audiveris.exe"
    python scripts\\extract-scores.py "C:\\carti\\carte.pdf" --merge-gap-interlines 10

Parametrul --merge-gap-interlines (default 8):
  - Mai MARE (ex. 12): uneste mai mult (bun daca partiturile multi-instrument
    sunt spatioase sau un exemplu are mai multe sisteme suprapuse).
  - Mai MIC (ex. 4): separa mai mult (bun daca pe pagina sunt multe exemple
    scurte apropiate).
"""

import json
import os
import shutil
import subprocess
import sys
import argparse

import numpy as np
import cv2

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz  # PyMuPDF (varianta veche)
    except ImportError:
        print("Lipseste PyMuPDF. Ruleaza:  pip install pymupdf")
        sys.exit(1)

# Distanta maxima (in interlinii) intre doua portative ca sa fie unite intr-un
# singur exemplu. Setabila din linia de comanda.
merge_gap_interlines = 8


# ---------------------------------------------------------------------------
# Randarea paginilor
# ---------------------------------------------------------------------------
def render_page_gray(page, dpi):
    mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY, alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    return img


# ---------------------------------------------------------------------------
# Detectia portativelor (proiectie orizontala + varfuri)
# ---------------------------------------------------------------------------
def detect_staves(gray, dpi=300):
    """Gaseste portativele: grupuri de 4-6 linii orizontale la distanta regulata.

    Intoarce lista de (top, bot, left, right, nr_linii, interline).
    """
    h, w = gray.shape
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    rowink = (bw > 0).sum(axis=1).astype(np.float64)
    sm = np.convolve(rowink, np.ones(3) / 3, mode="same")

    # O linie de portativ = rand cu multa cerneala orizontala (>=14% din latime).
    thr = w * 0.14
    is_line = sm >= thr

    # Detectia de BENZI (nu varfuri): o linie de portativ poate avea grosime de
    # 3-8px, deci produce un PLATEAU de randuri consecutive. Luam CENTRUL
    # fiecarei benzi ca pozitia liniei — astfel fiecare linie = 1 punct,
    # indiferent de grosimea ei.
    centers = []
    y = 0
    while y < h:
        if is_line[y]:
            y0 = y
            while y < h and is_line[y]:
                y += 1
            centers.append((y0 + y - 1) // 2)
        else:
            y += 1

    peaks = centers
    if len(peaks) < 4:
        return []

    min_gap = max(2, int(dpi * 0.02))
    max_gap = int(dpi * 0.25)

    staves = []
    n = len(peaks)
    i = 0
    while i + 4 < n:
        ys = peaks[i:i + 5]
        gaps = [ys[k + 1] - ys[k] for k in range(4)]
        med = sum(gaps) / 4
        if med <= 0:
            i += 1
            continue
        regular = all(min_gap <= g <= max_gap and abs(g - med) <= med * 0.30 for g in gaps)
        if not regular:
            i += 1
            continue

        j = i + 5
        while j < n:
            g = peaks[j] - peaks[j - 1]
            if abs(g - med) <= med * 0.30:
                j += 1
            else:
                break

        if 4 <= j - i <= 6:
            top = min(ys)
            bot = max(peaks[j - 1], peaks[i + 4])
            pad = max(10, int(med * 4))
            y0 = max(0, top - pad)
            y1 = min(h, bot + pad)
            band = bw[y0:y1, :]
            colink = (band > 0).sum(axis=0)
            cols = np.where(colink > 0)[0]
            left = int(cols.min()) if len(cols) else 0
            right = int(cols.max() + 1) if len(cols) else w
            staves.append((top, bot, left, right, j - i, med))
            i = j
            continue
        i += 1

    return staves


def merge_staves_into_blocks(staves):
    """Uneste portativele apropiate intr-un singur exemplu muzical."""
    if not staves:
        return []
    staves = sorted(staves, key=lambda s: s[0])
    blocks = []
    for s in staves:
        interline = s[5]
        gap_threshold = max(30, int(interline * merge_gap_interlines))
        if blocks and (s[0] - blocks[-1][1]) <= gap_threshold:
            t, b, l, r, n, il = blocks[-1]
            blocks[-1] = (t, max(b, s[1]), min(l, s[2]), max(r, s[3]), n + s[4], max(il, interline))
        else:
            blocks.append(list(s))
    return blocks


# ---------------------------------------------------------------------------
# Extindere "constienta de text"
# ---------------------------------------------------------------------------
def _ink_profile(gray):
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return (bw > 0).sum(axis=1)


def expand_to_ink_region(gray, top, bot, min_blank_px):
    """Extinde vertical ca sa includa textul apropiat (titlu/legenda), oprindu-se
    la primul gol mare (paragrafele corpului raman afara)."""
    h, w = gray.shape
    rowink = _ink_profile(gray)
    blank_thresh = max(3, int(w * 0.004))
    blank = rowink <= blank_thresh

    new_top = top
    run = 0
    for y in range(max(0, top - 1), -1, -1):
        if blank[y]:
            run += 1
            if run >= min_blank_px:
                new_top = min(y + run, h)
                break
        else:
            run = 0
            new_top = y

    new_bot = bot
    run = 0
    for y in range(min(h - 1, bot), h):
        if blank[y]:
            run += 1
            if run >= min_blank_px:
                new_bot = max(0, y - run)
                break
        else:
            run = 0
            new_bot = y + 1

    return new_top, new_bot


def expand_horizontal_to_ink(gray, top, bot):
    band = gray[top:bot, :]
    _, bw = cv2.threshold(band, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    colink = (bw > 0).sum(axis=0)
    cols = np.where(colink > 0)[0]
    if len(cols) == 0:
        return 0, gray.shape[1]
    return int(cols.min()), int(cols.max() + 1)


# ---------------------------------------------------------------------------
# Audiveris (optional) -> MusicXML
# ---------------------------------------------------------------------------
def run_audiveris(audiveris_path, png_path, out_dir):
    proc = subprocess.run(
        [audiveris_path, "-batch", "-export", "-output", out_dir, "--", png_path],
        capture_output=True,
        text=True,
        timeout=900,
    )
    base = os.path.splitext(os.path.basename(png_path))[0]
    book_dir = os.path.join(out_dir, base)
    mxl_dst = os.path.join(out_dir, base + ".mxl")

    if os.path.isfile(mxl_dst):
        return

    if os.path.isdir(book_dir):
        for f in os.listdir(book_dir):
            if f.lower().endswith(".mxl"):
                shutil.move(os.path.join(book_dir, f), mxl_dst)
                return

    # Nu a produs .mxl: ori a picat, ori nu a gasit muzica. Aratam de ce.
    if proc.returncode != 0:
        tail = (proc.stderr or "").strip().splitlines()[-6:]
        print(f"  ! Audiveris esuat pe {base}:")
        for line in tail:
            print(f"      {line}")
    else:
        print(f"  ! Audiveris nu a gasit muzica in {base} (probabil nu e partitura)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", help="calea catre PDF")
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--audiveris", default="", help="calea catre Audiveris.exe (optional)")
    ap.add_argument("--out", default="", help="folderul de iesire (default: 'music' langa PDF)")
    ap.add_argument("--merge-gap-interlines", type=int, default=8,
                    help="distanta maxima de unire a portativelor (in interlinii). Default 8.")
    args = ap.parse_args()

    global merge_gap_interlines
    merge_gap_interlines = args.merge_gap_interlines

    pdf_path = args.pdf
    if not os.path.isfile(pdf_path):
        print("ERROR: PDF inexistent:", pdf_path)
        sys.exit(1)

    base_dir = os.path.dirname(os.path.abspath(pdf_path))
    out_dir = args.out or os.path.join(base_dir, "music")
    os.makedirs(out_dir, exist_ok=True)

    doc = fitz.open(pdf_path)
    manifest = {"pages": []}

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        gray = render_page_gray(page, args.dpi)
        staves = detect_staves(gray, args.dpi)
        blocks = merge_staves_into_blocks(staves)

        if not blocks:
            continue

        page_entry = {"page": page_idx + 1, "scores": []}

        for bi, blk in enumerate(blocks):
            interline = blk[5]
            # Margini generoase + extindere la titlu/legenda.
            pad_v = max(40, int(interline * 4))
            pad_side = int(interline * 2)
            top = max(0, blk[0] - pad_v)
            bot = min(gray.shape[0], blk[1] + pad_v)
            left = max(0, blk[2] - pad_side)
            right = min(gray.shape[1], blk[3] + pad_side)

            min_blank = max(80, int(interline * 6))
            top, bot = expand_to_ink_region(gray, top, bot, min_blank)
            left, right = expand_horizontal_to_ink(gray, top, bot)

            # Margine finala mica.
            top = max(0, top - 12)
            bot = min(gray.shape[0], bot + 12)
            left = max(0, left - 12)
            right = min(gray.shape[1], right + 12)

            crop = gray[top:bot, left:right]

            # Sarim peste fragmente prea mici.
            if (bot - top) < max(40, int(interline * 2.5)):
                continue

            letter = chr(ord("a") + bi)
            png_name = f"score-p{page_idx + 1:03d}-{letter}.png"
            png_path = os.path.join(out_dir, png_name)
            cv2.imwrite(png_path, crop)

            page_entry["scores"].append({"file": png_name, "page": page_idx + 1, "letter": letter})

            if args.audiveris:
                run_audiveris(args.audiveris, png_path, out_dir)

        manifest["pages"].append(page_entry)
        print(f"Pagina {page_idx + 1}: {len(page_entry['scores'])} exemplu(e) muzical(e)")

    doc.close()

    manifest_path = os.path.join(out_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    total = sum(len(p["scores"]) for p in manifest["pages"])
    print(f"\nDONE. {total} exemplu(e) muzical(e) in: {out_dir}")
    print(f"      manifest: {manifest_path}")


if __name__ == "__main__":
    main()
