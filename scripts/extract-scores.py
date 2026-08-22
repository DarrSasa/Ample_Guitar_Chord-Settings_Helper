#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract-scores.py

Scaneaza un PDF (cartea) pagina cu pagina, gaseste PAGINILE care contin
partituri si le salveaza intregi (fara sa le taie), apoi (optional) ruleaza
Audiveris pe fiecare pagina ca sa scoata MusicXML cu notele + textul din
partitura (versuri, titluri, acorduri).

STRATEGIE (de ce asa si nu crop per portativ):
  - Detectarea PRECISA a fiecarui portativ separat, intr-o carte mixta
    (text + partituri + tabele + fotografii gri), este o problema de computer
    vision grea. Orice heuristica de decupare taie sau pierde partituri.
  - In schimb, detectarea la nivel de PAGINA ("contine pagina muzica?") este
    FIABILA: un portativ = 5 linii orizontale la distanta regulata, gasite
    prin proiectie orizontala + varfuri.
  - De partea GREA (gasirea exacta a portativelor, a textului din ele, a
    versurilor) se ocupa AUDIVERIS, care e construit fix pentru asta.

Cum functioneaza:
  1. Randeaza fiecare pagina la DPI (default 300).
  2. Detecteaza daca pagina are portative (proiectie orizontala + varfuri).
  3. Daca da, salveaza PAGINA INTREAGA:
       music-pages/page-NNN.png   (pagina NNN)
  4. Scrie manifest.json cu numerele de pagina.
  5. (Optional) Ruleaza Audiveris pe fiecare pagina -> MusicXML (*.mxl).

Dependinte (o singura data):
    pip install pymupdf opencv-python-headless numpy

Folosire:
    python scripts\\extract-scores.py "C:\\carti\\carte.pdf"
    python scripts\\extract-scores.py "C:\\carti\\carte.pdf" --audiveris "C:\\Program Files\\Audiveris\\Audiveris.exe"
    python scripts\\extract-scores.py "C:\\carti\\carte.pdf" --dpi 300 --out "C:\\carti\\music"

Iesire:
    music-pages/page-NNN.png       <- paginile cu muzica (intregi)
    music-pages/manifest.json      <- numerele de pagina
    music-pages/page-NNN.mxl       <- MusicXML (doar daca dai --audiveris)

NOTE (cinstit):
  - Detecția la nivel de pagina e buna, dar nu perfecta: pe pagini cu tabele
    sau grafice cu linii regulate pot aparea fals-pozitive. Verifica manifest.
  - Audiveris merge bine pe partituri tiparite curate; pe notatii dense sau
    scrise de mana poate rata detalii. Rezultatul final (MusicXML) e cel mai
    bogat format posibil.
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


# ---------------------------------------------------------------------------
# Randarea paginilor
# ---------------------------------------------------------------------------
def render_page_gray(page, dpi):
    mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY, alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    return img


# ---------------------------------------------------------------------------
# Detectia portativelor prin PROIECTIE ORIZONTALA + VARFURI (robusta)
# ---------------------------------------------------------------------------
def detect_staves(gray, dpi=300):
    """Gaseste portativele (grupuri de 4-6 linii orizontale la distanta regulata).

    Proiectia orizontala (cata cerneala pe fiecare rand) arata o linie de
    portativ ca un VARF local — robust la inclinare si la intreruperi (note,
    barlini, cheia sol). Apoi grupam 4-6 varfuri consecutive cu distanta
    regulata (interlinie dedusa local -> merge la orice scala).

    Intoarce lista de (top, bot, left, right, nr_linii, interline).
    """
    h, w = gray.shape
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    rowink = (bw > 0).sum(axis=1).astype(np.float64)

    sm = np.convolve(rowink, np.ones(3) / 3, mode="same")

    # Un rand e "linie de portativ" daca are multa cerneala orizontala
    # (>= 14% din latime). Exclude randurile obisnuite de text (~10-12%).
    thr = w * 0.14
    peaks = []
    for y in range(1, h - 1):
        if sm[y] >= thr and sm[y] >= sm[y - 1] and sm[y] >= sm[y + 1]:
            peaks.append(y)

    if len(peaks) < 4:
        return []

    # Interlinie plauzibila, relativ la DPI (300dpi: 6..75px) — acopera de la
    # portative mici la partituri la scala mare, si exclude liniile de tabel
    # (la distanta >= 50px).
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

        # Prelungim grupul cat permit varfurile regulate (ex. TAB pe 6 linii).
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


# ---------------------------------------------------------------------------
# Audiveris (optional) -> MusicXML
# ---------------------------------------------------------------------------
def run_audiveris(audiveris_path, png_path, out_dir):
    try:
        subprocess.run(
            [audiveris_path, "-batch", "-export", "-output", out_dir, "--", png_path],
            check=True,
            capture_output=True,
            timeout=900,
        )
    except Exception as e:
        print(f"  ! Audiveris a esuat pe {os.path.basename(png_path)}: {e}")
        return

    # Audiveris pune rezultatele intr-un subfolder numit dupa fisier. Mutam
    # .mxl-urile la suprafata, cu numele paginii.
    base = os.path.splitext(os.path.basename(png_path))[0]
    book_dir = os.path.join(out_dir, base)
    if not os.path.isdir(book_dir):
        print(f"  ! Audiveris nu a produs rezultate pentru {base}")
        return
    found = False
    for f in os.listdir(book_dir):
        if f.lower().endswith(".mxl"):
            dst = os.path.join(out_dir, base + ".mxl")
            shutil.move(os.path.join(book_dir, f), dst)
            found = True
    if not found:
        print(f"  ! Audiveris nu a gasit note in {base} (poate e o imagine/foto, nu partitura)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", help="calea catre PDF")
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--audiveris", default="", help="calea catre Audiveris.exe (optional)")
    ap.add_argument("--out", default="", help="folderul de iesire (default: 'music-pages' langa PDF)")
    args = ap.parse_args()

    pdf_path = args.pdf
    if not os.path.isfile(pdf_path):
        print("ERROR: PDF inexistent:", pdf_path)
        sys.exit(1)

    base_dir = os.path.dirname(os.path.abspath(pdf_path))
    out_dir = args.out or os.path.join(base_dir, "music-pages")
    os.makedirs(out_dir, exist_ok=True)

    doc = fitz.open(pdf_path)
    manifest = {"pages": []}

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        gray = render_page_gray(page, args.dpi)
        staves = detect_staves(gray, args.dpi)

        if not staves:
            continue

        # Pagina are muzica: o salvam INTREAGA (nu decupam nimic — de
        # portativele exacte si de text se ocupa Audiveris).
        png_name = f"page-{page_idx + 1:03d}.png"
        png_path = os.path.join(out_dir, png_name)
        cv2.imwrite(png_path, gray)

        manifest["pages"].append({"page": page_idx + 1, "file": png_name, "staves": len(staves)})
        print(f"Pagina {page_idx + 1}: MUZICA ({len(staves)} portativ(e))")

        if args.audiveris:
            run_audiveris(args.audiveris, png_path, out_dir)

    doc.close()

    manifest_path = os.path.join(out_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    total = len(manifest["pages"])
    print(f"\nDONE. {total} pagini cu muzica gasite in: {out_dir}")
    print(f"      manifest: {manifest_path}")


if __name__ == "__main__":
    main()
