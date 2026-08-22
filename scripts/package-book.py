#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
package-book.py

Imbina textul unei carti (extras dintr-un PDF) cu partiturile convertite in
MusicXML, intr-un singur fisier `book.md` pe care il poate citi agentul AI.

Intrari:
  1. <carte.pdf>   PDF-ul scanat/ocrizat. Textul se extrage cu PyMuPDF.
  2. <scores/>     folder cu fisiere MusicXML, denumite DUPA PAGINA:
                     page-NNN-score-MM.(musicxml|xml|mxl)
                   ex: page-014-score-01.musicxml  = pagina 14, partitura 1

Iesire:
  book.md  (langa PDF), cu:
     - textul fiecarei pagini (## Page N)
     - marcatori [SCORE: <fisier>] la pagina corespunzatoare

Instalare dependinte (o singura data):
    pip install pymupdf

Folosire:
    python package-book.py "C:\carti\carte.pdf" "C:\carti\scores"
"""

import os
import re
import sys


def extract_pages(pdf_path):
    """Intoarce lista de texte, una pe pagina."""
    try:
        import pymupdf as fitz  # varianta noua
    except ImportError:
        import fitz  # varianta veche
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        pages.append(page.get_text("text"))
    doc.close()
    return pages


def parse_score_filename(fname):
    """'page-014-score-01.musicxml' -> 14 ; 'score-p014-a.mxl' -> 14 ; altfel None."""
    m = re.match(r"page-(\d+)-score-\d+\.(musicxml|xml|mxl)$", fname, re.I)
    if m:
        return int(m.group(1))
    m2 = re.match(r"score-p(\d+)-[a-z]+\.(musicxml|xml|mxl)$", fname, re.I)
    if m2:
        return int(m2.group(1))
    return None


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    pdf_path = sys.argv[1]
    scores_dir = sys.argv[2]

    if not os.path.isfile(pdf_path):
        print("ERROR: PDF not found:", pdf_path)
        sys.exit(1)

    # Textul cartii, pagina cu pagina.
    print("Extracting text from PDF...")
    pages = extract_pages(pdf_path)

    # Partiturile, grupate dupa pagina.
    scores_by_page = {}
    if os.path.isdir(scores_dir):
        for fname in sorted(os.listdir(scores_dir)):
            page_no = parse_score_filename(fname)
            if page_no is not None:
                scores_by_page.setdefault(page_no, []).append(fname)
    else:
        print("WARNING: scores folder not found:", scores_dir)

    # Construim book.md.
    out_path = os.path.splitext(pdf_path)[0] + ".md"
    lines = []
    lines.append("# Cartea (text OCR + partituri)")
    lines.append("")
    for idx, text in enumerate(pages, 1):
        lines.append(f"## Page {idx}")
        lines.append("")
        if text.strip():
            lines.append(text.strip())
            lines.append("")
        for score in scores_by_page.get(idx, []):
            lines.append(f"[SCORE: scores/{score}]")
            lines.append("")
        # Un mic separator vizual intre pagini.
        lines.append("---")
        lines.append("")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    n_scores = sum(len(v) for v in scores_by_page.values())
    print(f"DONE. book.md written to: {out_path}")
    print(f"      pages: {len(pages)}, scores linked: {n_scores}")


if __name__ == "__main__":
    main()
