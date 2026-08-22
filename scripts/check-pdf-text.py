#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check-pdf-text.py

Verifica, pagina cu pagina, daca un PDF are TEXT SELECTABIL sau e doar IMAGINE
(scanata). E util ca sa stii daca trebuie OCR sau nu, si unde anume.

Iesire: pentru fiecare pagina afiseaza numarul de caractere de text gasite.
  - pagini cu 0 caractere  -> pagina SCANATA (imagine, fara text)
  - pagini cu text         -> pagina digitala (text selectabil)

La final face un rezumat: cate pagini au text / cate nu + lista paginilor goale.

Folosire:
    python scripts\\check-pdf-text.py "C:\\carti\\cartea.pdf"
"""

import sys
import os


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.isfile(pdf_path):
        print("ERROR: PDF inexistent:", pdf_path)
        sys.exit(1)

    try:
        import pymupdf as fitz
    except ImportError:
        try:
            import fitz
        except ImportError:
            print("Lipseste PyMuPDF. Ruleaza:  pip install pymupdf")
            sys.exit(1)

    doc = fitz.open(pdf_path)
    empty_pages = []
    text_pages = 0

    print(f"PDF: {os.path.basename(pdf_path)}  |  {len(doc)} pagini")
    print("-" * 50)

    for i in range(len(doc)):
        text = doc[i].get_text("text")
        n_chars = len(text.strip())
        if n_chars == 0:
            empty_pages.append(i + 1)
            status = "SCANATA (fara text)"
        else:
            text_pages += 1
            status = f"text ({n_chars} caractere)"
        print(f"Pagina {i + 1}: {status}")

    doc.close()

    print("-" * 50)
    print(f"Rezumat: {text_pages} pagini cu text, {len(empty_pages)} pagini fara text.")
    if empty_pages:
        print("Pagini SCANATE (fara text):", empty_pages)
    else:
        print("Toata cartea are text selectabil — NU e nevoie de OCR.")


if __name__ == "__main__":
    main()
