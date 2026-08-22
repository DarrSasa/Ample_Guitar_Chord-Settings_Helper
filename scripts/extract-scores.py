#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract-scores.py

Scaneaza un PDF (cartea) pagina cu pagina si extrage AUTOMAT partiturile
(zonele cu portative), fara sa fie nevoie de screenshot-uri manuale.

Cum functioneaza (pe scurt):
  1. Randeaza fiecare pagina la 300 DPI (imagine gri).
  2. Detecteaza liniile orizontale lungi (= portative) cu OpenCV.
  3. Grupeaza liniile in "sisteme" (grupuri de 5 linii apropiate).
  4. Decupeaza fiecare sistem intr-un fisier PNG:
       scores/score-pNNN-a.png   (pagina NNN, partitura a)
       scores/score-pNNN-b.png   (pagina NNN, partitura b)
       ...
  5. Detecteaza partiturile care CONTINUA pe pagina urmatoare (marginea de
     jos a unei pagini e "deschisa" si urmatoarea pagina incepe "deschis") si
     le leaga in manifest.json.
  6. (Optional) Ruleaza Audiveris pe fiecare crop -> MusicXML (*.mxl), ca
     agentul AI sa poata citi notele + articulatiile.

Dependinte (o singura data):
    pip install pymupdf opencv-python-headless numpy

Folosire:
    python scripts\\extract-scores.py "C:\\carti\\carte.pdf"
    python scripts\\extract-scores.py "C:\\carti\\carte.pdf" --audiveris "C:\\Audiveris\\bin\\Audiveris.bat"
    python scripts\\extract-scores.py "C:\\carti\\carte.pdf" --dpi 300 --min-lines 4

Iesire (langa PDF):
    scores/score-pNNN-a.png ...        <- crop-urile partiturilor
    scores/manifest.json               <- legaturile (continuari, pagina, ordine)
    scores/score-pNNN-a.mxl ...        <- MusicXML (doar daca dai --audiveris)

NOTE (cinstit):
  - Detecția e HEURISTICA. Merge bine pe partituri tiparite curate; pe
    pagini foarte dense sau cu scanuri inclinate poate rata/agrega. Verifica
    rezultatul vizual.
  - Daca o pagina are portative in TAB (chitara), se detecteaza la fel
    (liniile orizontale).
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
    # PyMuPDF: variantele noi se importa ca `pymupdf`, cele vechi ca `fitz`.
    # Incercam mai intai varianta noua, ca sa nu mai apara avertismente.
    import pymupdf as fitz
except ImportError:
    try:
        import fitz  # PyMuPDF (varianta veche)
    except ImportError:
        print("Lipseste PyMuPDF. Ruleaza:  pip install pymupdf")
        sys.exit(1)


# ---------------------------------------------------------------------------
# 1. Randarea paginilor
# ---------------------------------------------------------------------------
def render_page_gray(page, dpi):
    mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY, alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    return img


# ---------------------------------------------------------------------------
# 2. Detectia liniilor orizontale (portative)
# ---------------------------------------------------------------------------
def detect_horizontal_lines(gray, dpi=300, min_line_frac=0.12):
    """Intoarce lista de (center_y, w, x0, x1) pentru liniile orizontale lungi."""
    h, w = gray.shape
    # Binarizare inversa (negru = 255).
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Linie de portativ poate fi ingusta (partituri mici, o singura coloana).
    # Cerem minim 12% din latimea paginii, dar cel putin 120px.
    min_line_w = max(120, int(w * min_line_frac))
    hsize = max(15, int(w / 60))  # kernel orizontal lung
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (hsize, 1))
    horizontal = cv2.morphologyEx(bw, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(horizontal, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    lines = []
    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        # Linie de portativ: lunga, subtire. Grosimea tipica la 300dpi e 4-8px
        # (linia de 1-1.5pt din PDF). Acceptam pana la ~ dpi/40.
        if cw >= min_line_w and ch <= max(6, int(dpi / 40)):
            lines.append((y + ch // 2, cw, x, x + cw))
    lines.sort(key=lambda t: t[0])
    return lines


def group_lines_into_staves(lines, dpi):
    """Grupeaza liniile in stave (portative) de 4-6 linii cu SPATIERE REGULATA.

    Folosim o fereastra glisanta: un portativ = 5 linii consecutive la distanta
    APROAPE EGALA intre ele. Metoda e INDEPENDENTA de scala (merge si la
    partituri mari, si la partituri mici), pentru ca interlinia e dedusa local
    din grup, nu dintr-un prag fix.
    """
    if not lines:
        return []
    staves = []
    n = len(lines)
    i = 0
    while i <= n - 4:
        # Candidat: liniile i..i+4 (5 linii).
        ys = [lines[i + k][0] for k in range(5)]
        gaps = [ys[k + 1] - ys[k] for k in range(4)]
        med = sum(gaps) / 4
        if med <= 0:
            i += 1
            continue
        # Distanta intre linii trebuie sa fie consistenta (30% variatie max)
        # si intr-un domeniu plauzibil (3..60px la 300dpi).
        regular = all(3 <= g <= 60 and abs(g - med) <= med * 0.30 for g in gaps)
        if not regular:
            i += 1
            continue

        # Prelungim grupul cat mai permit liniile regulate (ex. TAB pe 6 linii).
        j = i + 5
        while j < n:
            g = lines[j][0] - lines[j - 1][0]
            if abs(g - med) <= med * 0.30:
                j += 1
            else:
                break
        group = lines[i:j]

        if 4 <= len(group) <= 6:
            lefts = [g[2] for g in group]
            rights = [g[3] for g in group]
            width = max(rights) - min(lefts)
            if width <= 0:
                width = 1
            aligned_left = (max(lefts) - min(lefts)) <= 0.20 * width
            aligned_right = (max(rights) - min(rights)) <= 0.20 * width
            if aligned_left and aligned_right:
                top = min(g[0] for g in group)
                bot = max(g[0] for g in group)
                staves.append((top, bot, min(lefts), max(rights), len(group), med))
                i = j
                continue
        i += 1
    return staves


def merge_staves_into_systems(staves, dpi):
    """Uneste portativele unui ACELASI exemplu muzical intr-un singur crop.

    O partitura dintr-o carte poate avea:
      - un singur portativ (5 linii);
      - mai multe portative LIPITE (pian = 2 portative cu acolada, sau mai multe
        instrumente);
      - mai multe SISTEME suprapuse (acelasi exemplu continuat pe verticala).

    Regula: unim doua portative daca distanta verticala dintre ele e mai mica
    decat ~18 interlinii (generos, ca sa prindem toate portativele exemplului,
    de sus pana jos). Exemplele diferite din carte sunt despartite de text, deci
    au spatii si mai mari -> raman separate.
    """
    if not staves:
        return []
    staves = sorted(staves, key=lambda s: s[0])
    blocks = []
    for s in staves:
        interline = s[5]
        gap_threshold = max(60, int(interline * 18))
        if blocks and (s[0] - blocks[-1][1]) <= gap_threshold:
            t, b, l, r, n, il = blocks[-1]
            blocks[-1] = (t, max(b, s[1]), min(l, s[2]), max(r, s[3]), n + s[4], max(il, interline))
        else:
            blocks.append(list(s))
    return blocks


def pad_box(box, shape, pad_top, pad_bot, pad_side):
    top, bot, left, right = box
    h, w = shape[:2]
    top = max(0, top - pad_top)
    bot = min(h, bot + pad_bot)
    left = max(0, left - pad_side)
    right = min(w, right + pad_side)
    return top, bot, left, right


def touches_bottom(box, shape, tol_frac=0.02):
    _, bot, _, _ = box
    return bot >= shape[0] * (1 - tol_frac)


def touches_top(box, shape, tol_frac=0.02):
    top, _, _, _ = box
    return top <= shape[0] * tol_frac


# ---------------------------------------------------------------------------
# 4. Audiveris (optional) -> MusicXML
# ---------------------------------------------------------------------------
def run_audiveris(audiveris_path, png_path, out_dir):
    try:
        subprocess.run(
            # `--` separa flagurile de fisierele de intrare (ca in documentatia
            # oficiala Audiveris).
            [audiveris_path, "-batch", "-export", "-output", out_dir, "--", png_path],
            check=True,
            capture_output=True,
            timeout=900,
        )
    except Exception as e:
        print(f"  ! Audiveris a esuat pe {os.path.basename(png_path)}: {e}")
        return False

    # Audiveris pune rezultatele intr-un subfolder numit dupa fisier (fara
    # extensie). ex: scores/score-p001-a/score-p001-a.mxl
    # Mutam .mxl-ul la suprafata (flat) ca package-book.py sa-l gaseasca direct:
    #   scores/score-p001-a.mxl
    base = os.path.splitext(os.path.basename(png_path))[0]
    book_dir = os.path.join(out_dir, base)
    mxl_dst = os.path.join(out_dir, base + ".mxl")
    if os.path.isfile(mxl_dst):
        return True
    if os.path.isdir(book_dir):
        for f in os.listdir(book_dir):
            if f.lower().endswith(".mxl"):
                shutil.move(os.path.join(book_dir, f), mxl_dst)
                return True
    print(f"  ! Audiveris nu a produs .mxl pentru {os.path.basename(png_path)}")
    return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", help="calea catre PDF")
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--min-lines", type=int, default=3, help="min. linii per portativa")
    ap.add_argument("--audiveris", default="", help="calea catre Audiveris.bat (optional)")
    ap.add_argument("--out", default="", help="folderul de iesire (default: 'scores' langa PDF)")
    args = ap.parse_args()

    pdf_path = args.pdf
    if not os.path.isfile(pdf_path):
        print("ERROR: PDF inexistent:", pdf_path)
        sys.exit(1)

    base_dir = os.path.dirname(os.path.abspath(pdf_path))
    out_dir = args.out or os.path.join(base_dir, "scores")
    os.makedirs(out_dir, exist_ok=True)

    doc = fitz.open(pdf_path)
    manifest = {"pages": []}

    prev_open_bottom = False  # ultima partitura a paginii trecute atinge josul?

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        gray = render_page_gray(page, args.dpi)
        lines = detect_horizontal_lines(gray, args.dpi)
        staves = group_lines_into_staves(lines, args.dpi)
        systems = merge_staves_into_systems(staves, args.dpi)

        page_entry = {"page": page_idx + 1, "scores": []}

        if systems:
            letter_idx = 0
            for si, sys_box in enumerate(systems):
                interline = sys_box[5] if len(sys_box) > 5 else 15
                # Padding vertical GENEROS: notele se intind ~3-4 interlinii
                # deasupra si dedesubtul portativului. Fara asta, crop-urile
                # taiau notele (user: "partiturile sunt taiate sus/jos").
                pad_v = max(40, int(interline * 4))
                pad_side = int(interline * 2)
                t, b, l, r = pad_box(sys_box[:4], gray.shape, pad_v, pad_v, pad_side)
                crop = gray[t:b, l:r]

                # Sarim peste fragmente prea mici (Audiveris pica pe ele).
                if (b - t) < max(40, int(interline * 2.5)):
                    continue

                letter = chr(ord("a") + letter_idx)
                letter_idx += 1
                is_cont = False
                # Partitura continua din pagina anterioara?
                if letter_idx == 1 and touches_top(sys_box[:4], gray.shape) and prev_open_bottom:
                    is_cont = True

                png_name = f"score-p{page_idx + 1:03d}-{letter}.png"
                png_path = os.path.join(out_dir, png_name)
                cv2.imwrite(png_path, crop)

                score_entry = {
                    "file": png_name,
                    "letter": letter,
                    "page": page_idx + 1,
                    "continuation_of": "previous-page" if is_cont else None,
                }
                page_entry["scores"].append(score_entry)

                if args.audiveris:
                    run_audiveris(args.audiveris, png_path, out_dir)

            # Ultima partitura a paginii atinge josul? (posibila continuare)
            prev_open_bottom = touches_bottom(systems[-1][:4], gray.shape)
        else:
            prev_open_bottom = False

        manifest["pages"].append(page_entry)
        print(f"Pagina {page_idx + 1}: {len(page_entry['scores'])} partitura(i)")

    manifest_path = os.path.join(out_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    total = sum(len(p["scores"]) for p in manifest["pages"])
    print(f"\nDONE. {total} partitura(i) extrase in: {out_dir}")
    print(f"      manifest: {manifest_path}")


if __name__ == "__main__":
    main()
